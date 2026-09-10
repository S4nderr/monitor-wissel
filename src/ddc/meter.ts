import type { DdcBrug } from "./ddc-brug.js";
import type { Meting } from "../domein/types.js";

export type MetingLuisteraar = (meting: Meting) => void;

/** Eén gebundelde meting per interval voor alle zichtbare knoppen; niets als er geen knop zichtbaar is. */
export class Meter {
  private readonly volgers = new Map<string, { schermId: string; luisteraar: MetingLuisteraar }>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private uitgesteld: ReturnType<typeof setTimeout> | undefined;
  private bezig = false;
  /** Er is om een meting gevraagd terwijl er al één liep; die vraag wordt na afloop ingelost. */
  private herhalen = false;

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
    if (this.volgers.size === 0) return;
    // Loopt er al een meting, dan is de knop die nu bijkomt niet in de momentopname meegenomen
    // (zie hieronder). Zonder herhaling zou hij tot de volgende interval-tik leeg blijven, dus
    // vragen we één extra ronde aan zodra de lopende meting klaar is.
    if (this.bezig) {
      this.herhalen = true;
      return;
    }
    this.bezig = true;
    try {
      // Momentopname vóór de await: een knop die tijdens deze meting bijkomt hoort er nog niet bij
      // en zou anders een null (= WERK) te zien krijgen die nooit voor hem gemeten is.
      const snapshot = [...this.volgers.entries()];
      const ids = [...new Set(snapshot.map(([, v]) => v.schermId))];
      // Een leesfout telt per ADR-0002 als WERK: elke ingang wordt dan null.
      let metingen: Map<string, Meting>;
      try {
        metingen = await this.brug.leesIngangen(ids);
      } catch {
        metingen = new Map(ids.map((id) => [id, null]));
      }
      for (const [context, entry] of snapshot) {
        // Een context die tijdens de meting vergeten of opnieuw gevolgd is (ander
        // entry-object) hoort deze meting niet meer te krijgen: anders lekt een
        // oude luisteraar-closure een verouderde meting of tekent hij na verdwijnen.
        if (this.volgers.get(context) !== entry) continue;
        // Eén stukgelopen luisteraar mag de rest niet raken.
        try {
          entry.luisteraar(metingen.get(entry.schermId) ?? null);
        } catch {
          // luisteraarfout wordt bewust genegeerd; deze klasse heeft geen logger.
        }
      }
    } finally {
      this.bezig = false;
      if (this.herhalen) {
        this.herhalen = false;
        await this.meetNu();
      }
    }
  }

  stop(): void {
    this.herhalen = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.uitgesteld) clearTimeout(this.uitgesteld);
    this.uitgesteld = undefined;
  }
}
