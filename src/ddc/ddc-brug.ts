import { execFile } from "node:child_process";
import type { Meting, Scherm } from "../domein/types.js";

/** hoog = een knopdruk (lezen/zetten) en gaat vóór polls en schermlijsten; laag = de rest. */
export type Prioriteit = "hoog" | "laag";

export interface DdcBrug {
  lijstSchermen(): Promise<Scherm[]>;
  leesIngangen(ids: string[], prioriteit?: Prioriteit): Promise<Map<string, Meting>>;
  zetIngang(id: string, code: number, prioriteit?: Prioriteit): Promise<{ ok: boolean; fout?: string }>;
}

type Wachtende = { taak: () => Promise<unknown>; los: (waarde: unknown) => void; breek: (fout: unknown) => void };

/**
 * Draait taken één voor één (DDC verdraagt geen twee gelijktijdige PowerShell-aanroepen)
 * en laat een hoog-taak vóór alle wachtende laag-taken. De lopende taak wordt nooit onderbroken.
 */
export class PrioriteitsWachtrij {
  private readonly hoog: Wachtende[] = [];
  private readonly laag: Wachtende[] = [];
  private bezig = false;

  voegToe<T>(prioriteit: Prioriteit, taak: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const rij = prioriteit === "hoog" ? this.hoog : this.laag;
      rij.push({ taak: taak as () => Promise<unknown>, los: resolve as (waarde: unknown) => void, breek: reject });
      void this.werkAf();
    });
  }

  private async werkAf(): Promise<void> {
    if (this.bezig) return;
    this.bezig = true;
    try {
      for (;;) {
        const volgende = this.hoog.shift() ?? this.laag.shift();
        if (!volgende) return;
        // Een mislukte taak mag de wachtrij nooit stilzetten; de fout gaat alleen naar zijn eigen aanroeper.
        try {
          volgende.los(await volgende.taak());
        } catch (fout) {
          volgende.breek(fout);
        }
      }
    } finally {
      this.bezig = false;
    }
  }
}

function veiligJson(tekst: string): unknown {
  try {
    return tekst.trim() ? JSON.parse(tekst) : undefined;
  } catch {
    return undefined;
  }
}

export function parseLijst(json: string): Scherm[] {
  const data = veiligJson(json);
  if (!Array.isArray(data)) return [];
  return data
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null && typeof (r as Record<string, unknown>).id === "string")
    .map((r) => ({
      id: String(r.id),
      naam: typeof r.naam === "string" && r.naam ? r.naam : String(r.id),
      serie: typeof r.serie === "string" ? r.serie : "",
      huidig: typeof r.huidig === "number" ? r.huidig : null,
      ingangen: Array.isArray(r.ingangen) ? r.ingangen.filter((n): n is number => typeof n === "number") : [],
    }));
}

export function parseMetingen(json: string, ids: string[]): Map<string, Meting> {
  const data = veiligJson(json) as Record<string, unknown> | undefined;
  const uit = new Map<string, Meting>();
  for (const id of ids) {
    const w = data && typeof data === "object" ? data[id] : undefined;
    uit.set(id, typeof w === "number" ? w : null);
  }
  return uit;
}

export function parseZetResultaat(json: string): { ok: boolean; fout?: string } {
  const data = veiligJson(json) as Record<string, unknown> | undefined;
  if (!data || typeof data.ok !== "boolean") return { ok: false, fout: "geen geldige uitvoer van ddc.ps1" };
  return data.ok ? { ok: true } : { ok: false, fout: typeof data.fout === "string" ? data.fout : "onbekende fout" };
}

/** Spawnt ps/ddc.ps1 onzichtbaar (ADR-0001). Eén aanroep per commando; nooit twee tegelijk (DDC verdraagt dat slecht). */
export class PowerShellDdcBrug implements DdcBrug {
  private readonly wachtrij = new PrioriteitsWachtrij();

  constructor(
    private readonly scriptPad: string,
    private readonly logger: { warn(msg: string): void },
  ) {}

  private draai(args: string[], prioriteit: Prioriteit, timeoutMs: number): Promise<string> {
    return this.wachtrij.voegToe(
      prioriteit,
      () =>
        new Promise<string>((resolve) => {
          execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", this.scriptPad, ...args],
            { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 },
            (fout, stdout, stderr) => {
              if (fout) this.logger.warn(`ddc.ps1 ${args[0]}: ${fout.message} ${stderr}`.trim());
              resolve(stdout ?? "");
            },
          );
        }),
    );
  }

  /** De schermlijst is altijd laag: hij duurt het langst en mag nooit vóór een knopdruk komen. */
  async lijstSchermen(): Promise<Scherm[]> {
    // list leest ook de capabilities-string van elk scherm en duurt ~4 s; ruim de tijd.
    return parseLijst(await this.draai(["list"], "laag", 15000));
  }

  async leesIngangen(ids: string[], prioriteit: Prioriteit = "laag"): Promise<Map<string, Meting>> {
    if (ids.length === 0) return new Map();
    // Lezen en zetten duren normaal onder een seconde; hangt het langer, dan is er iets mis en
    // mag de wachtrij niet 15 s vaststaan.
    return parseMetingen(await this.draai(["get", ...ids], prioriteit, 5000), ids);
  }

  async zetIngang(id: string, code: number, prioriteit: Prioriteit = "laag"): Promise<{ ok: boolean; fout?: string }> {
    return parseZetResultaat(await this.draai(["set", id, String(code)], prioriteit, 5000));
  }
}
