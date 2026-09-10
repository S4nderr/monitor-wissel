import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SchermenCache } from "../src/ddc/schermen-cache.js";
import type { Scherm } from "../src/domein/types.js";

const HP: Scherm = { id: "hp", naam: "HP E273q", serie: "6CM81602H4", huidig: 17, ingangen: [1, 15, 17, 19] };

/** Handmatig te lossen belofte, zodat een test bepaalt wanneer de brug antwoordt. */
function uitgesteld<T>() {
  let los!: (waarde: T) => void;
  const belofte = new Promise<T>((resolve) => {
    los = resolve;
  });
  return { belofte, los };
}

describe("SchermenCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("twee gelijktijdige aanvragen delen één brug-aanroep", async () => {
    const traag = uitgesteld<Scherm[]>();
    const lijstSchermen = vi.fn(() => traag.belofte);
    const cache = new SchermenCache({ lijstSchermen }, 60000);
    const eerste = cache.haal();
    const tweede = cache.haal();
    traag.los([HP]);
    expect(await eerste).toEqual([HP]);
    expect(await tweede).toEqual([HP]);
    expect(lijstSchermen).toHaveBeenCalledTimes(1);
  });

  it("binnen de ttl komt het antwoord uit de cache", async () => {
    const lijstSchermen = vi.fn(async () => [HP]);
    const cache = new SchermenCache({ lijstSchermen }, 60000);
    expect(await cache.haal()).toEqual([HP]);
    await vi.advanceTimersByTimeAsync(59999);
    expect(await cache.haal()).toEqual([HP]);
    expect(lijstSchermen).toHaveBeenCalledTimes(1);
  });

  it("na de ttl vraagt hij de brug opnieuw", async () => {
    const lijstSchermen = vi.fn(async () => [HP]);
    const cache = new SchermenCache({ lijstSchermen }, 60000);
    await cache.haal();
    await vi.advanceTimersByTimeAsync(60000);
    await cache.haal();
    expect(lijstSchermen).toHaveBeenCalledTimes(2);
  });

  it("vergeet dwingt een verse aanroep af", async () => {
    const lijstSchermen = vi.fn(async () => [HP]);
    const cache = new SchermenCache({ lijstSchermen }, 60000);
    await cache.haal();
    cache.vergeet();
    await cache.haal();
    expect(lijstSchermen).toHaveBeenCalledTimes(2);
  });

  it("een lege lijst wordt niet onthouden; de volgende aanvraag probeert opnieuw", async () => {
    const lijstSchermen = vi
      .fn(async (): Promise<Scherm[]> => [])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([HP]);
    const cache = new SchermenCache({ lijstSchermen }, 60000);
    expect(await cache.haal()).toEqual([]);
    expect(await cache.haal()).toEqual([HP]);
    expect(lijstSchermen).toHaveBeenCalledTimes(2);
  });

  it("een fout van de brug komt door en blokkeert de volgende aanvraag niet", async () => {
    const lijstSchermen = vi.fn().mockRejectedValueOnce(new Error("kapot")).mockResolvedValueOnce([HP]);
    const cache = new SchermenCache({ lijstSchermen }, 60000);
    await expect(cache.haal()).rejects.toThrow("kapot");
    expect(await cache.haal()).toEqual([HP]);
  });
});
