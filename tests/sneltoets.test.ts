import { describe, it, expect, vi } from "vitest";
import { normaliseerSneltoetsnaam, sneltoetsUitPad, verwerkDeepLink } from "../src/sneltoets.js";

function nepLogger() {
  const regels: string[] = [];
  return { regels, info: (m: string) => regels.push(m), warn: (m: string) => regels.push(m) };
}

describe("normaliseerSneltoetsnaam", () => {
  it("haalt spaties eromheen weg en maakt kleine letters", () => {
    expect(normaliseerSneltoetsnaam("  HP ")).toBe("hp");
    expect(normaliseerSneltoetsnaam(undefined)).toBe("");
  });
});

describe("sneltoetsUitPad", () => {
  it("haalt de naam uit /wissel/<naam>", () => {
    expect(sneltoetsUitPad("/wissel/hp")).toBe("hp");
    expect(sneltoetsUitPad("/wissel/Samsung/")).toBe("samsung");
    expect(sneltoetsUitPad("/Wissel/hp")).toBe("hp");
    expect(sneltoetsUitPad("/wissel/mijn%20scherm")).toBe("mijn scherm");
  });

  it("accepteert het pad ook zonder beginschuine streep", () => {
    expect(sneltoetsUitPad("wissel/hp")).toBe("hp");
  });

  it("weigert paden die geen sneltoets zijn", () => {
    expect(sneltoetsUitPad("/wissel")).toBeUndefined();
    expect(sneltoetsUitPad("/wissel/")).toBeUndefined();
    expect(sneltoetsUitPad("/wissel/hp/extra")).toBeUndefined();
    expect(sneltoetsUitPad("/iets/hp")).toBeUndefined();
    expect(sneltoetsUitPad("/wissel/%20")).toBeUndefined();
    expect(sneltoetsUitPad("/wissel/%E0%A4%A")).toBeUndefined();
  });
});

describe("verwerkDeepLink", () => {
  it("geeft de naam door aan de actie", async () => {
    const doel = { wisselViaSneltoets: vi.fn(async () => 1) };
    const logger = nepLogger();
    await verwerkDeepLink("/wissel/HP", doel, logger);
    expect(doel.wisselViaSneltoets).toHaveBeenCalledWith("hp");
    expect(logger.regels.join("\n")).toContain("sneltoets hp: 1 knop(pen) gewisseld");
  });

  it("waarschuwt bij een onherkenbaar pad zonder de actie aan te spreken", async () => {
    const doel = { wisselViaSneltoets: vi.fn(async () => 1) };
    const logger = nepLogger();
    await verwerkDeepLink("/onzin", doel, logger);
    expect(doel.wisselViaSneltoets).not.toHaveBeenCalled();
    expect(logger.regels.join("\n")).toContain("deeplink niet herkend: /onzin");
  });

  it("gooit niet als de actie een fout werpt", async () => {
    const doel = { wisselViaSneltoets: vi.fn(async () => Promise.reject(new Error("kapot"))) };
    const logger = nepLogger();
    await expect(verwerkDeepLink("/wissel/hp", doel, logger)).resolves.toBeUndefined();
    expect(logger.regels.join("\n")).toContain("sneltoets hp mislukt: kapot");
  });
});
