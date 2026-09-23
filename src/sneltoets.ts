/**
 * Sneltoets: een toets op het toetsenbord die de Wissel van een knop uitvoert. Een extern programma
 * (AutoHotkey) opent daarvoor een Stream Deck-deeplink:
 *   streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/<sneltoetsnaam>?streamdeck=hidden
 * Stream Deck haalt schema en plugin-UUID eraf; de plugin krijgt alleen het pad "/wissel/<naam>".
 */

/** Alleen wat de afhandeling van de logger nodig heeft. */
export type SneltoetsLogger = { info(bericht: string): void; warn(bericht: string): void };

/** Het deel van WisselIngang dat een sneltoets aanspreekt; zo blijft dit los te testen. */
export type SneltoetsDoel = { wisselViaSneltoets(naam: string): Promise<number> };

/** Sneltoetsnamen vergelijken we zonder spaties eromheen en zonder hoofdletters: "HP " = "hp". */
export function normaliseerSneltoetsnaam(naam: string | undefined): string {
  return (naam ?? "").trim().toLowerCase();
}

/** "/wissel/hp" -> "hp"; undefined als het pad geen sneltoets-opdracht is. */
export function sneltoetsUitPad(pad: string): string | undefined {
  const treffer = /^\/wissel\/([^/]+)\/?$/i.exec(pad);
  if (!treffer) return undefined;
  let naam: string;
  try {
    naam = decodeURIComponent(treffer[1]);
  } catch {
    return undefined;
  }
  const genormaliseerd = normaliseerSneltoetsnaam(naam);
  return genormaliseerd === "" ? undefined : genormaliseerd;
}

/** Verwerkt één binnengekomen deeplink; gooit nooit, want hij draait los van elke knopdruk. */
export async function verwerkDeepLink(pad: string, doel: SneltoetsDoel, logger: SneltoetsLogger): Promise<void> {
  const naam = sneltoetsUitPad(pad);
  if (naam === undefined) {
    logger.warn(`deeplink niet herkend: ${pad} (verwacht /wissel/<sneltoetsnaam>)`);
    return;
  }
  try {
    const aantal = await doel.wisselViaSneltoets(naam);
    if (aantal > 0) logger.info(`sneltoets ${naam}: ${aantal} knop(pen) gewisseld`);
  } catch (fout) {
    logger.warn(`sneltoets ${naam} mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);
  }
}
