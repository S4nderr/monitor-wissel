import { describe, it, expect, vi, afterEach } from "vitest";
import type { DidReceiveSettingsEvent, KeyDownEvent, SendToPluginEvent, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import type { Instellingen, Meting, Scherm } from "../src/domein/types.js";

// De echte SDK opent bij importeren een verbinding met de Stream Deck-software; voor deze
// tests is alleen nodig dat de decorator en de basisklasse bestaan.
const { sendToPropertyInspector } = vi.hoisted(() => ({ sendToPropertyInspector: vi.fn(async () => {}) }));
vi.mock("@elgato/streamdeck", () => ({
  action: () => (cls: unknown) => cls,
  SingletonAction: class {},
  default: { ui: { sendToPropertyInspector } },
}));

const { WisselIngang } = await import("../src/actions/wissel-ingang.js");
const { Meter } = await import("../src/ddc/meter.js");

const HP: Scherm = { id: "hp", naam: "HP E273q", serie: "6CM81602H4", huidig: 17, ingangen: [15, 17] };
const VOLLEDIG: Instellingen = { schermId: "hp", thuisingang: "17", werkingang: "15", orientatie: "staand" };

function nepBrug(metingen: Record<string, Meting> = { hp: 17 }) {
  return {
    lijstSchermen: vi.fn(async (): Promise<Scherm[]> => [HP]),
    leesIngangen: vi.fn(async (ids: string[]) => new Map<string, Meting>(ids.map((id) => [id, metingen[id] ?? null]))),
    zetIngang: vi.fn(async (): Promise<{ ok: boolean; fout?: string }> => ({ ok: true })),
  };
}

function nepLogger() {
  const regels: string[] = [];
  return { regels, info: (m: string) => regels.push(m), warn: (m: string) => regels.push(m) };
}

function nepKnop(id = "ctx-1") {
  return {
    id,
    isKey: () => true,
    setImage: vi.fn(async () => {}),
    showAlert: vi.fn(async () => {}),
    getSettings: vi.fn(async () => VOLLEDIG),
  };
}

type Knop = ReturnType<typeof nepKnop>;
const verschijn = (action: Knop, settings: Instellingen) => ({ action, payload: { settings } }) as unknown as WillAppearEvent<Instellingen>;
const instellingenEvent = (action: Knop, settings: Instellingen) =>
  ({ action, payload: { settings } }) as unknown as DidReceiveSettingsEvent<Instellingen>;
const druk = (action: Knop, settings: Instellingen) => ({ action, payload: { settings } }) as unknown as KeyDownEvent<Instellingen>;
const verdwijn = (action: Knop) => ({ action, payload: { settings: {} } }) as unknown as WillDisappearEvent<Instellingen>;
const vraag = (action: Knop, event: string) =>
  ({ action, payload: { event, isRefresh: true } }) as unknown as SendToPluginEvent<{ event: string; isRefresh?: boolean }, Instellingen>;

let opruimen: (() => void) | undefined;
function maak(brug: ReturnType<typeof nepBrug>) {
  const logger = nepLogger();
  // Ruime interval: alleen de expliciete meetNu-aanroepen tellen in deze tests.
  const meter = new Meter(brug, 600000);
  opruimen = () => meter.stop();
  return { actie: new WisselIngang(brug, meter, logger), logger, meter };
}

afterEach(() => {
  opruimen?.();
  opruimen = undefined;
  sendToPropertyInspector.mockClear();
});

describe("WisselIngang", () => {
  it("weigert een druk op een knop die niet volledig is ingesteld", async () => {
    const brug = nepBrug();
    const { actie, logger } = maak(brug);
    const knop = nepKnop();
    await actie.onKeyDown(druk(knop, { schermId: "hp" }));
    expect(knop.showAlert).toHaveBeenCalledTimes(1);
    expect(brug.leesIngangen).not.toHaveBeenCalled();
    expect(brug.zetIngang).not.toHaveBeenCalled();
    expect(logger.regels.join("\n")).toContain("niet volledig ingesteld");
  });

  it("gebruikt een verse meting uit de poll en leest niet opnieuw bij een druk", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, logger } = maak(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, VOLLEDIG));
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
    await actie.onKeyDown(druk(knop, VOLLEDIG));
    // Stond op 17 (thuis), dus er gaat 15 (werk) heen; zonder extra leesronde.
    expect(brug.zetIngang).toHaveBeenCalledWith("hp", 15, "hoog");
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
    expect(logger.regels.join("\n")).toContain("bron=cache");
  });

  it("leest vers als er geen verse meting is", async () => {
    const brug = nepBrug({ hp: 15 });
    const { actie, logger } = maak(brug);
    const knop = nepKnop();
    await actie.onKeyDown(druk(knop, VOLLEDIG));
    expect(brug.leesIngangen).toHaveBeenCalledWith(["hp"], "hoog");
    // Stond op 15 (werk), dus terug naar 17 (thuis).
    expect(brug.zetIngang).toHaveBeenCalledWith("hp", 17, "hoog");
    expect(logger.regels.join("\n")).toContain("bron=vers");
  });

  it("negeert een tweede druk zolang de eerste wissel nog loopt", async () => {
    const brug = nepBrug({ hp: 17 });
    let los!: (r: { ok: boolean }) => void;
    brug.zetIngang.mockImplementation(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          los = resolve;
        }),
    );
    const { actie, logger } = maak(brug);
    const knop = nepKnop();
    const eerste = actie.onKeyDown(druk(knop, VOLLEDIG));
    const tweede = actie.onKeyDown(druk(knop, VOLLEDIG));
    await tweede;
    expect(logger.regels.join("\n")).toContain("genegeerd");
    los({ ok: true });
    await eerste;
    expect(brug.zetIngang).toHaveBeenCalledTimes(1);
  });

  it("waarschuwt en tekent niets optimistisch als de zetopdracht mislukt", async () => {
    const brug = nepBrug({ hp: 17 });
    brug.zetIngang.mockResolvedValue({ ok: false, fout: "SetVCPFeature mislukt" });
    const { actie, logger } = maak(brug);
    const knop = nepKnop();
    await actie.onKeyDown(druk(knop, VOLLEDIG));
    expect(knop.showAlert).toHaveBeenCalledTimes(1);
    expect(knop.setImage).not.toHaveBeenCalled();
    expect(logger.regels.join("\n")).toContain("ok=false");
  });

  it("waarschuwt als de brug een fout werpt in plaats van hem af te vangen", async () => {
    const brug = nepBrug({ hp: 17 });
    brug.leesIngangen.mockRejectedValue(new Error("powershell weg"));
    const { actie, logger } = maak(brug);
    const knop = nepKnop();
    await expect(actie.onKeyDown(druk(knop, VOLLEDIG))).resolves.toBeUndefined();
    expect(knop.showAlert).toHaveBeenCalledTimes(1);
    expect(logger.regels.join("\n")).toContain("powershell weg");
  });

  it("stopt de poll voor een knop die verdwijnt", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, meter } = maak(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, VOLLEDIG));
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
    await actie.onWillDisappear(verdwijn(knop));
    await meter.meetNu();
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
  });

  it("meet niet opnieuw als dezelfde instellingen nog eens binnenkomen", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maak(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, VOLLEDIG));
    await actie.onDidReceiveSettings(instellingenEvent(knop, { ...VOLLEDIG }));
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
    // Een echte wijziging mag wél opnieuw meten.
    await actie.onDidReceiveSettings(instellingenEvent(knop, { ...VOLLEDIG, werkingang: "19" }));
    expect(brug.leesIngangen).toHaveBeenCalledTimes(2);
  });

  it("tekent opnieuw bij een herhaalde willAppear met dezelfde configuratie (bv. reconnect)", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maak(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, VOLLEDIG));
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
    knop.setImage.mockClear();
    // Geen willDisappear ertussen: apparaat opnieuw verbonden, knopbeeld kan leeg zijn.
    await actie.onWillAppear(verschijn(knop, VOLLEDIG));
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
    expect(knop.setImage).toHaveBeenCalledTimes(1);
    expect(knop.setImage).toHaveBeenCalledWith(expect.stringContaining("%3EPC%3C"));
  });

  it("waarschuwt als thuis- en werkingang gelijk zijn", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, logger } = maak(brug);
    await actie.onWillAppear(verschijn(nepKnop(), { ...VOLLEDIG, werkingang: "17" }));
    expect(logger.regels.join("\n")).toContain("dezelfde thuis- en werkingang");
  });

  it("vult de ingangenlijst uit de onthouden instellingen, zonder getSettings", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maak(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, VOLLEDIG));
    await actie.onSendToPlugin(vraag(knop, "ingangen"));
    expect(knop.getSettings).not.toHaveBeenCalled();
    expect(sendToPropertyInspector).toHaveBeenCalledWith({
      event: "ingangen",
      items: [
        { value: "15", label: "15 – DisplayPort 1" },
        { value: "17", label: "17 – HDMI 1" },
      ],
    });
  });
});
