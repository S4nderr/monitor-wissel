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
