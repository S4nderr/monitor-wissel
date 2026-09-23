export type Stand = "pc" | "werk" | "onbekend";
export type Orientatie = "staand" | "liggend";

// Type-alias (geen interface): de SDK eist voor instellingen een JsonObject, en
// alleen type-aliassen krijgen in TypeScript de impliciete index-signatuur.
export type Instellingen = {
  schermId?: string;
  thuisingang?: string;
  werkingang?: string;
  thuisingangHandmatig?: string;
  werkingangHandmatig?: string;
  orientatie?: Orientatie;
  /** ADR-0003: dit scherm meldt zijn ingang niet betrouwbaar; niet meten maar onthouden. */
  geheugenstand?: boolean;
  /** ADR-0003: de laatst succesvol gestuurde kant; alleen in gebruik bij geheugenstand. */
  onthoudenStand?: "pc" | "werk";
  /** Sneltoets: naam waarmee een deeplink (/wissel/<naam>) deze knop laat wisselen; vergeleken zonder hoofdletters en spaties eromheen. */
  sneltoetsnaam?: string;
  /** Sneltoets (toets), ADR-0004: "F13" t/m "F24" die de plugin zelf bewaakt, of leeg. */
  sneltoetsToets?: string;
};

export interface Scherm {
  id: string;
  naam: string;
  serie: string;
  huidig: number | null;
  ingangen: number[];
}

/** null = leesfout of scherm niet gevonden */
export type Meting = number | null;
