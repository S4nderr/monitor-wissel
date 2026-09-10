import { describe, it, expect } from "vitest";
import { parseLijst, parseMetingen, parseZetResultaat } from "../src/ddc/ddc-brug.js";

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
