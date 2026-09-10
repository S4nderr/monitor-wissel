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
      const ids = [...new Set([...this.volgers.values()].map((v) => v.schermId))];
      const metingen = await this.brug.leesIngangen(ids);
      for (const { schermId, luisteraar } of this.volgers.values()) {
        luisteraar(metingen.get(schermId) ?? null);
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
