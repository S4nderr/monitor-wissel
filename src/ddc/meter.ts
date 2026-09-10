import type { DdcBrug } from "./ddc-brug.js";
import type { Meting } from "../domein/types.js";

export type MetingLuisteraar = (meting: Meting) => void;

/** Eén gebundelde meting per interval voor alle zichtbare knoppen; niets als er geen knop zichtbaar is. */
export class Meter {
  private readonly volgers = new Map<string, { schermId: string; luisteraar: MetingLuisteraar }>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private uitgesteld: ReturnType<typeof setTimeout> | undefined;
  private bezig = false;

  constructor(
    private readonly brug: Pick<DdcBrug, "leesIngangen">,
    private readonly intervalMs = 5000,
  ) {}

  volg(context: string, schermId: string, luisteraar: MetingLuisteraar): void {
    this.volgers.set(context, { schermId, luisteraar });
    if (!this.timer) this.timer = setInterval(() => void this.meetNu(), this.intervalMs);
  }

  vergeet(context: string): void {
    this.volgers.delete(context);
    if (this.volgers.size === 0) this.stop();
  }

  meetStraks(vertragingMs: number): void {
    if (this.uitgesteld) clearTimeout(this.uitgesteld);
    this.uitgesteld = setTimeout(() => {
      this.uitgesteld = undefined;
      void this.meetNu();
    }, vertragingMs);
  }

  async meetNu(): Promise<void> {
    if (this.bezig || this.volgers.size === 0) return;
    this.bezig = true;
    try {
      // Momentopname vóór de await: een knop die tijdens deze meting bijkomt hoort er nog niet bij
      // en zou anders een null (= WERK) te zien krijgen die nooit voor hem gemeten is.
      const volgers = [...this.volgers.values()];
      const ids = [...new Set(volgers.map((v) => v.schermId))];
      // Een leesfout telt per ADR-0002 als WERK: elke ingang wordt dan null.
      let metingen: Map<string, Meting>;
      try {
        metingen = await this.brug.leesIngangen(ids);
      } catch {
        metingen = new Map(ids.map((id) => [id, null]));
      }
      for (const { schermId, luisteraar } of volgers) {
        // Eén stukgelopen luisteraar mag de rest niet raken.
        try {
          luisteraar(metingen.get(schermId) ?? null);
        } catch {
          // luisteraarfout wordt bewust genegeerd; deze klasse heeft geen logger.
        }
      }
    } finally {
      this.bezig = false;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.uitgesteld) clearTimeout(this.uitgesteld);
    this.uitgesteld = undefined;
  }
}
