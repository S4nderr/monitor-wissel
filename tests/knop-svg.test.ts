import { describe, it, expect } from "vitest";
import { knopSvg, knopDataUrl } from "../src/weergave/knop-svg.js";

describe("knopSvg", () => {
  it("staand tekent een hoge rechthoek", () => {
    const svg = knopSvg("pc", "staand");
    expect(svg).toContain('width="56" height="96"');
  });
  it("liggend tekent een brede rechthoek", () => {
    const svg = knopSvg("pc", "liggend");
    expect(svg).toContain('width="96" height="56"');
  });
  it("label en kleur per stand", () => {
    expect(knopSvg("pc", "staand")).toContain(">PC<");
    expect(knopSvg("pc", "staand")).toContain("#2e7d32");
    expect(knopSvg("werk", "staand")).toContain(">WERK<");
    expect(knopSvg("werk", "staand")).toContain("#1565c0");
    expect(knopSvg("onbekend", "staand")).toContain(">?<");
    expect(knopSvg("onbekend", "staand")).toContain("#616161");
  });
  it("data-url is url-gecodeerd", () => {
    const url = knopDataUrl("pc", "liggend");
    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    expect(url).not.toContain("<");
  });
});
