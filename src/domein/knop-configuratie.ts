import type { Instellingen, Orientatie, Scherm } from "./types.js";
import { effectieveCode } from "./wisselregel.js";

/** Eén keuze in een keuzelijst van de Property Inspector. */
export type Keuze = { value: string; label: string };

/** MCCS-ingangscodes (decimaal) met hun gangbare naam; per fabrikant kan de naam afwijken. */
const MCCS_NAMEN: Record<number, string> = {
  1: "VGA 1",
  2: "VGA 2",
  3: "DVI 1",
  4: "DVI 2",
  5: "HDMI 1 (Samsung)",
  6: "HDMI 2 (Samsung)",
  15: "DisplayPort 1",
  16: "DisplayPort 2",
  17: "HDMI 1",
  18: "HDMI 2",
  19: "HDMI 3 / USB-C",
};

/** Bijvoorbeeld: 17 → "17 – HDMI 1". Onbekende codes blijven leesbaar. */
export function ingangLabel(code: number): string {
  return `${code} – ${MCCS_NAMEN[code] ?? "onbekend"}`;
}

/** Bijvoorbeeld: "HP E273q (…02H4)"; zonder serienummer alleen de naam. */
export function schermLabel(s: Scherm): string {
  const staart = s.serie ? ` (…${s.serie.slice(-4)})` : "";
  return `${s.naam}${staart}`;
}

/** Keuzelijst met de gevonden schermen. */
export function schermItems(schermen: Scherm[]): Keuze[] {
  return schermen.map((s) => ({ value: s.id, label: schermLabel(s) }));
}

/** Keuzelijst met de ingangen van één scherm; leeg als het scherm ontbreekt. */
export function ingangItems(scherm: Scherm | undefined): Keuze[] {
  return (scherm?.ingangen ?? []).map((c) => ({ value: String(c), label: ingangLabel(c) }));
}

/** Wat één knop nodig heeft om te kunnen wisselen. */
export type KnopConfiguratie = { schermId: string; thuis: number; werk: number; orientatie: Orientatie; geheugenstand: boolean };

/** Volledige, bruikbare configuratie van één knop; undefined zolang er iets ontbreekt. */
export function configuratie(i: Instellingen): KnopConfiguratie | undefined {
  const thuis = effectieveCode(i.thuisingang, i.thuisingangHandmatig);
  const werk = effectieveCode(i.werkingang, i.werkingangHandmatig);
  if (!i.schermId || thuis === undefined || werk === undefined) return undefined;
  // geheugenstand hoort erbij (ADR-0003): het verandert wat de knop doet. onthoudenStand niet:
  // dat wisselt bij elke druk en zou de knop dan telkens opnieuw laten registreren. Ook
  // sneltoetsnaam en sneltoetsToets niet: die veranderen niets aan meten of tekenen, alleen aan wie
  // de knop aanspreekt.
  return { schermId: i.schermId, thuis, werk, orientatie: i.orientatie ?? "staand", geheugenstand: i.geheugenstand === true };
}
