import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Meter } from "../src/ddc/meter.js";
import type { Meting } from "../src/domein/types.js";

function nepBrug(antwoord: Record<string, Meting>) {
  const leesIngangen = vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, antwoord[id] ?? null])));
  return { leesIngangen };
}

describe("Meter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("meet niets zolang er geen knop gevolgd wordt", async () => {
    const brug = nepBrug({});
    new Meter(brug, 5000);
    await vi.advanceTimersByTimeAsync(20000);
    expect(brug.leesIngangen).not.toHaveBeenCalled();
  });

  it("bundelt twee knoppen op hetzelfde scherm in één meting en meldt beide", async () => {
    const brug = nepBrug({ hp: 17 });
    const meter = new Meter(brug, 5000);
    const a = vi.fn(); const b = vi.fn();
    meter.volg("ctx-a", "hp", a);
    meter.volg("ctx-b", "hp", b);
    await meter.meetNu();
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
    expect(brug.leesIngangen).toHaveBeenCalledWith(["hp"]);
    expect(a).toHaveBeenCalledWith(17);
    expect(b).toHaveBeenCalledWith(17);
  });

  it("polt elke interval en stopt als de laatste knop verdwijnt", async () => {
    const brug = nepBrug({ hp: 17 });
    const meter = new Meter(brug, 5000);
    meter.volg("ctx-a", "hp", vi.fn());
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    const n = brug.leesIngangen.mock.calls.length;
    expect(n).toBeGreaterThanOrEqual(2);
    meter.vergeet("ctx-a");
    await vi.advanceTimersByTimeAsync(20000);
    expect(brug.leesIngangen.mock.calls.length).toBe(n);
  });

  it("meetStraks meet één keer na de vertraging", async () => {
    const brug = nepBrug({ sam: 5 });
    const meter = new Meter(brug, 60000);
    const l = vi.fn();
    meter.volg("ctx", "sam", l);
    meter.meetStraks(2000);
    await vi.advanceTimersByTimeAsync(1999);
    expect(l).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(l).toHaveBeenCalledWith(5);
  });

  it("een leesfout komt als null bij de luisteraar", async () => {
    const brug = nepBrug({});
    const meter = new Meter(brug, 5000);
    const l = vi.fn();
    meter.volg("ctx", "weg", l);
    await meter.meetNu();
    expect(l).toHaveBeenCalledWith(null);
  });
});
