import { execFile } from "node:child_process";
import type { Meting, Scherm } from "../domein/types.js";

export interface DdcBrug {
  lijstSchermen(): Promise<Scherm[]>;
  leesIngangen(ids: string[]): Promise<Map<string, Meting>>;
  zetIngang(id: string, code: number): Promise<{ ok: boolean; fout?: string }>;
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
  private wachtrij: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly scriptPad: string,
    private readonly logger: { warn(msg: string): void },
  ) {}

  private draai(args: string[]): Promise<string> {
    const taak = this.wachtrij.then(
      () =>
        new Promise<string>((resolve) => {
          execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", this.scriptPad, ...args],
            { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 },
            (fout, stdout, stderr) => {
              if (fout) this.logger.warn(`ddc.ps1 ${args[0]}: ${fout.message} ${stderr}`.trim());
              resolve(stdout ?? "");
            },
          );
        }),
    );
    this.wachtrij = taak.catch(() => undefined);
    return taak;
  }

  async lijstSchermen(): Promise<Scherm[]> {
    return parseLijst(await this.draai(["list"]));
  }

  async leesIngangen(ids: string[]): Promise<Map<string, Meting>> {
    if (ids.length === 0) return new Map();
    return parseMetingen(await this.draai(["get", ...ids]), ids);
  }

  async zetIngang(id: string, code: number): Promise<{ ok: boolean; fout?: string }> {
    return parseZetResultaat(await this.draai(["set", id, String(code)]));
  }
}
