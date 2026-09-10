export type Stand = "pc" | "werk" | "onbekend";
export type Orientatie = "staand" | "liggend";

export interface Instellingen {
  schermId?: string;
  thuisingang?: string;
  werkingang?: string;
  thuisingangHandmatig?: string;
  werkingangHandmatig?: string;
  orientatie?: Orientatie;
}

export interface Scherm {
  id: string;
  naam: string;
  serie: string;
  huidig: number | null;
  ingangen: number[];
}

/** null = leesfout of scherm niet gevonden */
export type Meting = number | null;
