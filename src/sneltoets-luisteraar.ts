import { spawn, type SpawnOptions } from "node:child_process";

/**
 * Sneltoets (toets), ADR-0004: de plugin start zelf een klein PowerShell-proces
 * (ps/sneltoets-luisteraar.ps1) dat de per knop ingestelde toetsen F13 t/m F24 bewaakt en bij een
 * druk het id van de knop (de context) als regel op stdout zet. Deze klasse beheert dat proces:
 * starten, herstarten als de toetsen veranderen, stoppen als er niets meer te bewaken is.
 */

/** De toetsen die een knop als Sneltoets kan krijgen; gewone toetsenborden hebben ze niet. */
export const SNELTOETS_TOETSEN = ["F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24"] as const;

/** "f21 " -> "F21"; undefined voor leeg of een toets buiten F13 t/m F24. */
export function normaliseerToets(toets: string | undefined): string | undefined {
  const t = (toets ?? "").trim().toUpperCase();
  return (SNELTOETS_TOETSEN as readonly string[]).includes(t) ? t : undefined;
}

/** Alleen wat de luisteraar van de logger nodig heeft. */
export type LuisteraarLogger = { info(bericht: string): void; warn(bericht: string): void };

/** Het deel van een kindproces dat de luisteraar gebruikt; tests geven een nepkind. */
export type LuisteraarKind = {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  on(event: "exit", luisteraar: (code: number | null, signaal: NodeJS.Signals | null) => void): unknown;
  on(event: "error", luisteraar: (fout: Error) => void): unknown;
  kill(): boolean;
};

export type SpawnFn = (bestand: string, args: readonly string[], opties: SpawnOptions) => LuisteraarKind;

/** Context-ids van Stream Deck zijn hex; alles buiten dit patroon zou de argumentenlijst kunnen verstoren. */
const VEILIG_ID = /^[A-Za-z0-9_-]+$/;

export class SneltoetsLuisteraar {
  private kind: LuisteraarKind | undefined;
  /** De toetsen van het lopende (of laatst gestarte) proces, als vaste tekst; "" = niets. */
  private huidigeSleutel = "";
  private bijDruk: (context: string) => void = () => {};
  private readonly opruimen = (): void => this.stop();
  private opruimenGeregistreerd = false;

  constructor(
    private readonly scriptPad: string,
    private readonly logger: LuisteraarLogger,
    private readonly spawnFn: SpawnFn = spawn as unknown as SpawnFn,
  ) {}

  /** Wat er moet gebeuren als een bewaakte toets ingedrukt wordt: krijgt de context van de knop. */
  bijToets(callback: (context: string) => void): void {
    this.bijDruk = callback;
  }

  /**
   * Stelt in welke toets bij welke knop hoort (toets -> context). Gelijk aan het lopende proces:
   * niets. Anders: het oude proces stopt en er start een nieuw; leeg: het proces stopt.
   */
  stel(mapping: ReadonlyMap<string, string>): void {
    const paren: string[] = [];
    for (const [toets, context] of mapping) {
      const genormaliseerd = normaliseerToets(toets);
      if (genormaliseerd === undefined || !VEILIG_ID.test(context)) {
        this.logger.warn(`sneltoets-luisteraar: ${toets}=${context} overgeslagen (ongeldige toets of id)`);
        continue;
      }
      paren.push(`${genormaliseerd}=${context}`);
    }
    paren.sort();
    const sleutel = paren.join(" ");
    if (sleutel === "") {
      if (this.kind) this.logger.info("sneltoets-luisteraar gestopt: geen toetsen meer ingesteld");
      this.stop();
      return;
    }
    // Zelfde toetsen en het proces leeft nog: niets te doen. Is het proces intussen gestopt, dan
    // start deze aanroep het opnieuw.
    if (sleutel === this.huidigeSleutel && this.kind) return;
    this.stop();
    this.start(paren, sleutel);
  }

  /** Stopt het lopende proces (als dat er is). */
  stop(): void {
    const kind = this.kind;
    this.kind = undefined;
    this.huidigeSleutel = "";
    if (this.opruimenGeregistreerd) {
      process.off("exit", this.opruimen);
      this.opruimenGeregistreerd = false;
    }
    if (kind) {
      try {
        kind.kill();
      } catch {
        // Al weg; niets aan te doen.
      }
    }
  }

  private start(paren: string[], sleutel: string): void {
    const args = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", this.scriptPad, String(process.pid), ...paren];
    let kind: LuisteraarKind;
    try {
      kind = this.spawnFn("powershell.exe", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch (fout) {
      this.logger.warn(`sneltoets-luisteraar start niet: ${fout instanceof Error ? fout.message : String(fout)}`);
      return;
    }
    this.kind = kind;
    this.huidigeSleutel = sleutel;
    // Stopt de plugin netjes, dan het kind ook. Wordt de plugin hard afgeschoten, dan merkt het
    // script binnen 2 s zelf dat zijn ouder weg is.
    if (!this.opruimenGeregistreerd) {
      process.on("exit", this.opruimen);
      this.opruimenGeregistreerd = true;
    }
    const toetsen = paren.map((p) => p.split("=")[0]).join(", ");

    let buffer = "";
    kind.stdout?.setEncoding("utf8");
    kind.stdout?.on("data", (stuk: string | Buffer) => {
      // Een vervangen (herstart) proces stuurt zijn oude listeners niet los; zonder deze wacht
      // zou een regel van een al vervangen kind alsnog een knopdruk uitlokken.
      if (this.kind !== kind) return;
      buffer += stuk.toString();
      // Een regel kan in stukken binnenkomen: alleen volledige regels verwerken, de rest bewaren.
      let einde: number;
      while ((einde = buffer.indexOf("\n")) >= 0) {
        const regel = buffer.slice(0, einde).trim();
        buffer = buffer.slice(einde + 1);
        if (regel === "") continue;
        if (regel === "klaar") {
          this.logger.info(`sneltoets-luisteraar gestart (toetsen: ${toetsen})`);
          continue;
        }
        try {
          this.bijDruk(regel);
        } catch (fout) {
          this.logger.warn(`sneltoets ${regel} mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);
        }
      }
    });
    kind.stderr?.setEncoding("utf8");
    kind.stderr?.on("data", (stuk: string | Buffer) => {
      if (this.kind !== kind) return;
      const tekst = stuk.toString().trim();
      if (tekst) this.logger.warn(`sneltoets-luisteraar: ${tekst}`);
    });
    kind.on("error", (fout: Error) => {
      if (this.kind !== kind) return;
      this.logger.warn(`sneltoets-luisteraar fout: ${fout.message}`);
      this.kind = undefined;
    });
    kind.on("exit", (code: number | null, signaal: NodeJS.Signals | null) => {
      // Alleen een onverwacht einde melden; een proces dat wij zelf stopten is al vervangen.
      if (this.kind !== kind) return;
      this.logger.warn(`sneltoets-luisteraar gestopt (code ${code ?? signaal ?? "onbekend"}); start opnieuw bij de volgende wijziging`);
      this.kind = undefined;
    });
  }
}
