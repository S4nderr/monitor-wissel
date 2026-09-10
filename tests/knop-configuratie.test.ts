import { describe, it, expect } from "vitest";
import { configuratie, ingangItems, ingangLabel, schermItems, schermLabel } from "../src/domein/knop-configuratie.js";
import type { Scherm } from "../src/domein/types.js";

const hp: Scherm = { id: "HP-1", naam: "HP E273q", serie: "6CM81602H4", huidig: 17, ingangen: [1, 15, 17, 19] };
const naamloos: Scherm = { id: "SAM-1", naam: "Odyssey G5", serie: "", huidig: null, ingangen: [] };

describe("ingangLabel", () => {
  it("bekende code krijgt zijn naam", () => expect(ingangLabel(17)).toBe("17 – HDMI 1"));
  it("onbekende code blijft leesbaar", () => expect(ingangLabel(99)).toContain("onbekend"));
});

describe("schermLabel", () => {
  it("toont de laatste vier tekens van het serienummer", () => expect(schermLabel(hp)).toBe("HP E273q (…02H4)"));
  it("laat de staart weg zonder serienummer", () => expect(schermLabel(naamloos)).toBe("Odyssey G5"));
});

describe("schermItems", () => {
  it("zet schermen om in waarde-en-label-paren", () =>
    expect(schermItems([hp, naamloos])).toEqual([
      { value: "HP-1", label: "HP E273q (…02H4)" },
      { value: "SAM-1", label: "Odyssey G5" },
    ]));
  it("lege lijst blijft leeg", () => expect(schermItems([])).toEqual([]));
});

describe("ingangItems", () => {
  it("zet de ingangen van een scherm om", () =>
    expect(ingangItems(hp)).toEqual([
      { value: "1", label: "1 – VGA 1" },
      { value: "15", label: "15 – DisplayPort 1" },
      { value: "17", label: "17 – HDMI 1" },
      { value: "19", label: "19 – HDMI 3 / USB-C" },
    ]));
  it("geen scherm geeft een lege lijst", () => expect(ingangItems(undefined)).toEqual([]));
});

describe("configuratie", () => {
  it("onvolledig is undefined", () => {
    expect(configuratie({})).toBeUndefined();
    expect(configuratie({ schermId: "x", thuisingang: "17" })).toBeUndefined();
  });
  it("volledig met handmatige code", () => {
    expect(configuratie({ schermId: "x", thuisingang: "15", werkingang: "17", werkingangHandmatig: "5", orientatie: "liggend" })).toEqual({
      schermId: "x",
      thuis: 15,
      werk: 5,
      orientatie: "liggend",
      geheugenstand: false,
    });
  });
  it("oriëntatie is standaard staand", () => {
    expect(configuratie({ schermId: "x", thuisingang: "17", werkingang: "15" })?.orientatie).toBe("staand");
  });
  it("geheugenstand staat standaard uit en komt mee als hij aanstaat", () => {
    expect(configuratie({ schermId: "x", thuisingang: "17", werkingang: "15" })?.geheugenstand).toBe(false);
    expect(configuratie({ schermId: "x", thuisingang: "17", werkingang: "15", geheugenstand: true })?.geheugenstand).toBe(true);
  });
  it("de onthouden stand hoort niet bij de configuratie", () => {
    expect(configuratie({ schermId: "x", thuisingang: "17", werkingang: "15", onthoudenStand: "werk" })).toEqual(
      configuratie({ schermId: "x", thuisingang: "17", werkingang: "15" }),
    );
  });
});
