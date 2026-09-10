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

  it("een afgewezen leesIngangen levert null aan alle luisteraars en meetNu werpt niet", async () => {
    const leesIngangen = vi.fn(async () => {
      throw new Error("kapot");
    });
    const meter = new Meter({ leesIngangen });
    const l = vi.fn();
    meter.volg("ctx", "hp", l);
    await expect(meter.meetNu()).resolves.toBeUndefined();
    expect(l).toHaveBeenCalledWith(null);
  });

  it("een stukgelopen luisteraar houdt de andere luisteraar niet tegen", async () => {
    const brug = nepBrug({ hp: 17, sam: 5 });
    const meter = new Meter(brug, 5000);
    const stuk = vi.fn(() => {
      throw new Error("boem");
    });
    const goed = vi.fn();
    meter.volg("ctx-a", "hp", stuk);
    meter.volg("ctx-b", "sam", goed);
    await expect(meter.meetNu()).resolves.toBeUndefined();
    expect(goed).toHaveBeenCalledWith(5);
  });

  it("een luisteraar die tijdens een lopende meting bijkomt, krijgt die meting niet", async () => {
    let los!: (m: Map<string, Meting>) => void;
    const antwoord = new Promise<Map<string, Meting>>((resolve) => {
      los = resolve;
    });
    const leesIngangen = vi.fn(() => antwoord);
    const meter = new Meter({ leesIngangen });
    const oud = vi.fn();
    meter.volg("ctx-oud", "hp", oud);
    const lopend = meter.meetNu();
    // Knop komt op terwijl de meting nog onderweg is.
    const nieuw = vi.fn();
    meter.volg("ctx-nieuw", "sam", nieuw);
    los(new Map([["hp", 17]]));
    await lopend;
    expect(leesIngangen).toHaveBeenCalledWith(["hp"]);
    expect(oud).toHaveBeenCalledWith(17);
    expect(nieuw).not.toHaveBeenCalled();
  });

  it("een luisteraar die tijdens een lopende meting vervangen wordt, krijgt die meting niet; de nieuwe ook niet", async () => {
    let los!: (m: Map<string, Meting>) => void;
    const antwoord = new Promise<Map<string, Meting>>((resolve) => {
      los = resolve;
    });
    const leesIngangen = vi.fn(() => antwoord);
    const meter = new Meter({ leesIngangen });
    const oud = vi.fn();
    meter.volg("ctx", "hp", oud);
    const lopend = meter.meetNu();
    // Context wordt tijdens de lopende meting herverbonden op een ander scherm.
    const nieuw = vi.fn();
    meter.volg("ctx", "hp", nieuw);
    los(new Map([["hp", 17]]));
    await lopend;
    expect(oud).not.toHaveBeenCalled();
    expect(nieuw).not.toHaveBeenCalled();
  });

  it("een luisteraar die tijdens een lopende meting vergeten wordt, wordt niet gemeld", async () => {
    let los!: (m: Map<string, Meting>) => void;
    const antwoord = new Promise<Map<string, Meting>>((resolve) => {
      los = resolve;
    });
    const leesIngangen = vi.fn(() => antwoord);
    const meter = new Meter({ leesIngangen });
    const l = vi.fn();
    meter.volg("ctx", "hp", l);
    const lopend = meter.meetNu();
    // Knop verdwijnt (bv. onWillDisappear) terwijl de meting nog onderweg is.
    meter.vergeet("ctx");
    los(new Map([["hp", 17]]));
    await expect(lopend).resolves.toBeUndefined();
    expect(l).not.toHaveBeenCalled();
  });

  it("na een afgewezen meting werkt een volgende meting weer normaal", async () => {
    const leesIngangen = vi
      .fn()
      .mockRejectedValueOnce(new Error("kapot"))
      .mockResolvedValueOnce(new Map([["hp", 17]]));
    const meter = new Meter({ leesIngangen });
    const l = vi.fn();
    meter.volg("ctx", "hp", l);
    await meter.meetNu();
    expect(l).toHaveBeenCalledWith(null);
    await meter.meetNu();
    expect(l).toHaveBeenCalledWith(17);
  });
});
