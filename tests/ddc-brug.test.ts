import { describe, it, expect } from "vitest";
import { parseLijst, parseMetingen, parseZetResultaat, PrioriteitsWachtrij } from "../src/ddc/ddc-brug.js";

/** Handmatig te lossen belofte, zodat een test bepaalt wanneer een taak klaar is. */
function uitgesteld<T>() {
  let los!: (waarde: T) => void;
  let breek!: (fout: unknown) => void;
  const belofte = new Promise<T>((resolve, reject) => {
    los = resolve;
    breek = reject;
  });
  return { belofte, los, breek };
}

const LIJST = '[{"id":"HPN3475#5&10cc6012&0&UID4356","naam":"HP E273q","serie":"6CM81602H7","huidig":17,"ingangen":[1,15,17,19]},{"id":"SAM7486#5&10cc6012&0&UID4354","naam":"Odyssey G5","serie":"","huidig":null,"ingangen":[]}]';

describe("parseLijst", () => {
  it("leest beide schermen", () => {
    const s = parseLijst(LIJST);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ id: "HPN3475#5&10cc6012&0&UID4356", naam: "HP E273q", serie: "6CM81602H7", huidig: 17, ingangen: [1, 15, 17, 19] });
    expect(s[1].huidig).toBeNull();
  });
  it("lege of kapotte uitvoer geeft een lege lijst", () => {
    expect(parseLijst("")).toEqual([]);
    expect(parseLijst("niet json")).toEqual([]);
  });
});

describe("parseMetingen", () => {
  it("koppelt id aan meting en vult ontbrekende id's met null", () => {
    const m = parseMetingen('{"a":17,"b":null}', ["a", "b", "c"]);
    expect(m.get("a")).toBe(17);
    expect(m.get("b")).toBeNull();
    expect(m.get("c")).toBeNull();
  });
  it("kapotte uitvoer geeft overal null", () => {
    const m = parseMetingen("", ["a"]);
    expect(m.get("a")).toBeNull();
  });
});

describe("parseZetResultaat", () => {
  it("ok", () => expect(parseZetResultaat('{"ok":true}')).toEqual({ ok: true }));
  it("fout met reden", () => expect(parseZetResultaat('{"ok":false,"fout":"x"}')).toEqual({ ok: false, fout: "x" }));
  it("kapotte uitvoer is een fout", () => expect(parseZetResultaat("")).toEqual({ ok: false, fout: "geen geldige uitvoer van ddc.ps1" }));
});

describe("PrioriteitsWachtrij", () => {
  it("draait taken één voor één; twee taken overlappen nooit", async () => {
    const wachtrij = new PrioriteitsWachtrij();
    const a = uitgesteld<string>();
    const b = uitgesteld<string>();
    let actief = 0;
    let meestActief = 0;
    const taak = (bron: { belofte: Promise<string> }) => async () => {
      actief += 1;
      meestActief = Math.max(meestActief, actief);
      const waarde = await bron.belofte;
      actief -= 1;
      return waarde;
    };
    const eerste = wachtrij.voegToe("laag", taak(a));
    const tweede = wachtrij.voegToe("laag", taak(b));
    await Promise.resolve();
    expect(actief).toBe(1);
    a.los("a");
    b.los("b");
    expect(await eerste).toBe("a");
    expect(await tweede).toBe("b");
    expect(meestActief).toBe(1);
  });

  it("een hoog-taak die binnenkomt tijdens een laag-taak gaat vóór de wachtende laag-taken", async () => {
    const wachtrij = new PrioriteitsWachtrij();
    const eersteKlaar = uitgesteld<void>();
    const volgorde: string[] = [];
    const lopend = wachtrij.voegToe("laag", async () => {
      volgorde.push("laag-bezig");
      await eersteKlaar.belofte;
    });
    const laagA = wachtrij.voegToe("laag", async () => void volgorde.push("laag-a"));
    const laagB = wachtrij.voegToe("laag", async () => void volgorde.push("laag-b"));
    const hoog = wachtrij.voegToe("hoog", async () => void volgorde.push("hoog"));
    eersteKlaar.los();
    await Promise.all([lopend, laagA, laagB, hoog]);
    expect(volgorde).toEqual(["laag-bezig", "hoog", "laag-a", "laag-b"]);
  });

  it("een taak die faalt laat de wachtrij niet vastlopen", async () => {
    const wachtrij = new PrioriteitsWachtrij();
    const kapot = wachtrij.voegToe("laag", async () => {
      throw new Error("boem");
    });
    const daarna = wachtrij.voegToe("laag", async () => "gelukt");
    await expect(kapot).rejects.toThrow("boem");
    expect(await daarna).toBe("gelukt");
  });
});
