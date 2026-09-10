import { describe, it, expect } from "vitest";
import { knopSvg, knopDataUrl } from "../src/weergave/knop-svg.js";

describe("knopSvg", () => {
  it("staand tekent een hoge rechthoek, gecentreerd", () => {
    const svg = knopSvg("pc", "staand");
    expect(svg).toContain('x="42" y="22" width="60" height="100"');
  });
  it("liggend tekent een brede rechthoek, gecentreerd", () => {
    const svg = knopSvg("pc", "liggend");
    expect(svg).toContain('x="22" y="42" width="100" height="60"');
  });
  it("schaalt via de viewBox en heeft geen eigen achtergrond", () => {
    const svg = knopSvg("pc", "staand");
    expect(svg).toContain('viewBox="0 0 144 144"');
    expect(svg).not.toMatch(/<svg[^>]*\swidth=/);
    expect(svg).not.toContain('fill="#000"');
    expect(svg).not.toContain("dominant-baseline");
  });
  it("label en kleur per stand", () => {
    expect(knopSvg("pc", "staand")).toContain(">PC<");
    expect(knopSvg("pc", "staand")).toContain("#2e7d32");
    expect(knopSvg("werk", "staand")).toContain(">WERK<");
    expect(knopSvg("werk", "staand")).toContain("#1565c0");
    expect(knopSvg("onbekend", "staand")).toContain(">?<");
    expect(knopSvg("onbekend", "staand")).toContain("#616161");
  });
  it("WERK past in een staand schermpje: kleiner dan liggend", () => {
    expect(knopSvg("werk", "staand")).toContain('font-size="18"');
    expect(knopSvg("werk", "liggend")).toContain('font-size="24"');
    expect(knopSvg("pc", "staand")).toContain('font-size="32"');
  });
  it("data-url is url-gecodeerd", () => {
    const url = knopDataUrl("pc", "liggend");
    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    expect(url).not.toContain("<");
  });
});
