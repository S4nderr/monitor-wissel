import type { DdcBrug } from "./ddc-brug.js";
import type { Scherm } from "../domein/types.js";

/**
 * Onthoudt de schermlijst (`ddc.ps1 list`, ~4 s) een tijdje en bundelt gelijktijdige aanvragen.
 * De Property Inspector vraagt bij openen drie datasources tegelijk; die delen zo één aanroep.
 */
export class SchermenCache {
  private schermen: Scherm[] | undefined;
  private gemetenOp = 0;
  private lopend: Promise<Scherm[]> | undefined;

  constructor(
    private readonly brug: Pick<DdcBrug, "lijstSchermen">,
    private readonly ttlMs = 60000,
  ) {}

  async haal(): Promise<Scherm[]> {
    if (this.schermen && Date.now() - this.gemetenOp < this.ttlMs) return this.schermen;
    // Loopt er al een aanvraag, dan wacht deze aanroeper op datzelfde antwoord.
    if (this.lopend) return this.lopend;
    this.lopend = this.brug
      .lijstSchermen()
      .then((schermen) => {
        // Een lege lijst is bijna altijd een hik van ddc.ps1; die onthouden we bewust niet.
        if (schermen.length > 0) {
          this.schermen = schermen;
          this.gemetenOp = Date.now();
        }
        return schermen;
      })
      .finally(() => {
        this.lopend = undefined;
      });
    return this.lopend;
  }

  vergeet(): void {
    this.schermen = undefined;
    this.gemetenOp = 0;
  }
}
