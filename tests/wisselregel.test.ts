import { describe, it, expect } from "vitest";
import { bepaalStand, bepaalDoel, effectieveCode, onthoudNaZet, standUitGeheugen } from "../src/domein/wisselregel.js";

describe("bepaalStand", () => {
  it("meting gelijk aan thuisingang is pc", () => expect(bepaalStand(17, 17, 15)).toBe("pc"));
  it("meting gelijk aan werkingang is werk", () => expect(bepaalStand(15, 17, 15)).toBe("werk"));
  it("leesfout telt als werk (ADR-0002)", () => expect(bepaalStand(null, 17, 15)).toBe("werk"));
  it("andere ingang is onbekend", () => expect(bepaalStand(1, 17, 15)).toBe("onbekend"));
});

describe("bepaalDoel", () => {
  it("vanuit pc naar werkingang", () => expect(bepaalDoel("pc", 17, 15)).toBe(15));
  it("vanuit werk naar thuisingang", () => expect(bepaalDoel("werk", 17, 15)).toBe(17));
  it("vanuit onbekend naar thuisingang", () => expect(bepaalDoel("onbekend", 17, 15)).toBe(17));
});

describe("effectieveCode", () => {
  it("handmatige code wint van de keuzelijst", () => expect(effectieveCode("15", "5")).toBe(5));
  it("lege handmatige code valt terug op de keuzelijst", () => expect(effectieveCode("15", "")).toBe(15));
  it("niets ingevuld geeft undefined", () => expect(effectieveCode(undefined, undefined)).toBeUndefined());
  it("onzin is undefined", () => expect(effectieveCode("abc", " ")).toBeUndefined());
});

describe("standUitGeheugen", () => {
  it("zonder geheugen is de stand onbekend", () => expect(standUitGeheugen(undefined)).toBe("onbekend"));
  it("onthouden pc blijft pc", () => expect(standUitGeheugen("pc")).toBe("pc"));
  it("onthouden werk blijft werk", () => expect(standUitGeheugen("werk")).toBe("werk"));
  it("zonder geheugen gaat de eerste druk naar de thuisingang", () =>
    expect(bepaalDoel(standUitGeheugen(undefined), 17, 15)).toBe(17));
});

describe("onthoudNaZet", () => {
  it("naar de werkingang gestuurd is werk", () => expect(onthoudNaZet(15, 15)).toBe("werk"));
  it("naar de thuisingang gestuurd is pc", () => expect(onthoudNaZet(17, 15)).toBe("pc"));
});
