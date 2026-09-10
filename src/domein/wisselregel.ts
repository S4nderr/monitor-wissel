import type { Meting, Stand } from "./types.js";

/** Handmatige code overstemt de keuzelijst; alleen gehele getallen 0-255 tellen. */
export function effectieveCode(keuze: string | undefined, handmatig: string | undefined): number | undefined {
  for (const kandidaat of [handmatig, keuze]) {
    const tekst = kandidaat?.trim();
    if (!tekst) continue;
    if (!/^\d{1,3}$/.test(tekst)) return undefined;
    const n = Number(tekst);
    return n <= 255 ? n : undefined;
  }
  return undefined;
}

/** ADR-0002: een leesfout telt als werk. */
export function bepaalStand(meting: Meting, thuis: number, werk: number): Stand {
  if (meting === null) return "werk";
  if (meting === thuis) return "pc";
  if (meting === werk) return "werk";
  return "onbekend";
}

/** ADR-0002: alleen vanuit pc naar werk; alles anders gaat naar de thuisingang. */
export function bepaalDoel(stand: Stand, thuis: number, werk: number): number {
  return stand === "pc" ? werk : thuis;
}
