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
const GEHEUGEN: Instellingen = { ...VOLLEDIG, geheugenstand: true };

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
    setSettings: vi.fn(async () => {}),
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

  it("meet opnieuw zodra het vinkje Geheugenstand weer uitgaat", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maak(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, GEHEUGEN));
    expect(brug.leesIngangen).not.toHaveBeenCalled();
    await actie.onDidReceiveSettings(instellingenEvent(knop, VOLLEDIG));
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
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

describe("WisselIngang met Geheugenstand (ADR-0003)", () => {
  it("stuurt zonder geheugen naar de thuisingang en onthoudt pc, zonder te meten", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, logger } = maak(brug);
    const knop = nepKnop();
    await actie.onKeyDown(druk(knop, GEHEUGEN));
    expect(brug.leesIngangen).not.toHaveBeenCalled();
    expect(brug.zetIngang).toHaveBeenCalledWith("hp", 17, "hoog");
    expect(knop.setSettings).toHaveBeenCalledWith({ ...GEHEUGEN, onthoudenStand: "pc" });
    expect(knop.setImage).toHaveBeenCalledWith(expect.stringContaining("%3EPC%3C"));
    expect(logger.regels.join("\n")).toContain("bron=geheugen");
    expect(logger.regels.join("\n")).toContain("meting=geheugen");
  });

  it("stuurt vanuit onthouden pc naar de werkingang en onthoudt werk", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maak(brug);
    const knop = nepKnop();
    await actie.onKeyDown(druk(knop, { ...GEHEUGEN, onthoudenStand: "pc" }));
    expect(brug.leesIngangen).not.toHaveBeenCalled();
    expect(brug.zetIngang).toHaveBeenCalledWith("hp", 15, "hoog");
    expect(knop.setSettings).toHaveBeenCalledWith({ ...GEHEUGEN, onthoudenStand: "werk" });
    expect(knop.setImage).toHaveBeenCalledWith(expect.stringContaining("%3EWERK%3C"));
  });

  it("stuurt vanuit onthouden werk terug naar de thuisingang", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maak(brug);
    const knop = nepKnop();
    await actie.onKeyDown(druk(knop, { ...GEHEUGEN, onthoudenStand: "werk" }));
    expect(brug.zetIngang).toHaveBeenCalledWith("hp", 17, "hoog");
    expect(knop.setSettings).toHaveBeenCalledWith({ ...GEHEUGEN, onthoudenStand: "pc" });
  });

  it("laat het geheugen staan als de zetopdracht mislukt", async () => {
    const brug = nepBrug({ hp: 17 });
    brug.zetIngang.mockResolvedValue({ ok: false, fout: "SetVCPFeature mislukt" });
    const { actie, logger } = maak(brug);
    const knop = nepKnop();
    await actie.onKeyDown(druk(knop, { ...GEHEUGEN, onthoudenStand: "pc" }));
    expect(knop.showAlert).toHaveBeenCalledTimes(1);
    expect(knop.setSettings).not.toHaveBeenCalled();
    expect(knop.setImage).not.toHaveBeenCalled();
    expect(logger.regels.join("\n")).toContain("ok=false");
  });

  it("volgt de knop niet bij de meter en tekent uit het geheugen", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, meter } = maak(brug);
    const volg = vi.spyOn(meter, "volg");
    const vergeet = vi.spyOn(meter, "vergeet");
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, { ...GEHEUGEN, onthoudenStand: "werk" }));
    expect(volg).not.toHaveBeenCalled();
    expect(vergeet).toHaveBeenCalledWith(knop.id);
    expect(brug.leesIngangen).not.toHaveBeenCalled();
    expect(knop.setImage).toHaveBeenCalledWith(expect.stringContaining("%3EWERK%3C"));
  });

  it("toont een vraagteken zolang er niets onthouden is", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maak(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, GEHEUGEN));
    expect(knop.setImage).toHaveBeenCalledWith(expect.stringContaining("%3E%3F%3C"));
  });

  it("tekent bij de setSettings-echo het verse geheugen, niet de vorige stand", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maak(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, { ...GEHEUGEN, onthoudenStand: "werk" }));
    expect(knop.setImage).toHaveBeenCalledWith(expect.stringContaining("%3EWERK%3C"));
    knop.setImage.mockClear();
    // Zo komt een instellingenschrijving van buiten het drukpad binnen: gelijke configuratie
    // (geheugenstand verandert niet), alleen het onthoudenStand-veld is vers. Zou de
    // geheugenstand-tak na de gelijke-configuratie-controle staan, dan zou dit gewoon de vorige
    // (WERK) stand herhalen in plaats van het verse geheugen (PC) te tekenen.
    await actie.onDidReceiveSettings(instellingenEvent(knop, { ...GEHEUGEN, onthoudenStand: "pc" }));
    expect(knop.setImage).toHaveBeenCalledWith(expect.stringContaining("%3EPC%3C"));
    expect(brug.leesIngangen).not.toHaveBeenCalled();
    expect(brug.zetIngang).not.toHaveBeenCalled();
  });

  it("laat de onthouden instellingen winnen van een verouderde payload bij een tweede druk", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maak(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, GEHEUGEN));
    // Beide drukken sturen dezelfde (verouderde) payload zonder onthoudenStand mee; alleen de
    // instellingen-map die de eerste druk zelf bijwerkt kent het verse geheugen.
    await actie.onKeyDown(druk(knop, GEHEUGEN));
    expect(brug.zetIngang).toHaveBeenNthCalledWith(1, "hp", 17, "hoog");
    await actie.onKeyDown(druk(knop, GEHEUGEN));
    expect(brug.zetIngang).toHaveBeenNthCalledWith(2, "hp", 15, "hoog");
  });
});

describe("WisselIngang via een Sneltoets", () => {
  // De echte zichtbareKnoppen() leest this.actions uit het SDK-register; hier geven we de
  // nepknoppen zelf op, zoals ze op de huidige Stream Deck-pagina zouden staan.
  class MetZichtbareKnoppen extends WisselIngang {
    zichtbaar: Knop[] = [];
    protected override zichtbareKnoppen() {
      return this.zichtbaar as never;
    }
  }
  function maakMetKnoppen(brug: ReturnType<typeof nepBrug>) {
    const logger = nepLogger();
    const meter = new Meter(brug, 600000);
    opruimen = () => meter.stop();
    return { actie: new MetZichtbareKnoppen(brug, meter, logger), logger };
  }

  it("wisselt de knop met die naam, ongeacht hoofdletters en spaties eromheen", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maakMetKnoppen(brug);
    const hp = nepKnop("ctx-hp");
    const ander = nepKnop("ctx-ander");
    actie.zichtbaar = [hp, ander];
    await actie.onWillAppear(verschijn(hp, { ...VOLLEDIG, sneltoetsnaam: "HP " }));
    await actie.onWillAppear(verschijn(ander, { ...VOLLEDIG, sneltoetsnaam: "samsung" }));
    hp.setImage.mockClear();
    ander.setImage.mockClear();
    expect(await actie.wisselViaSneltoets("hp")).toBe(1);
    // Zelfde pad als een druk: verse poll-meting 17 (thuis), dus 15 (werk) erheen.
    expect(brug.zetIngang).toHaveBeenCalledTimes(1);
    expect(brug.zetIngang).toHaveBeenCalledWith("hp", 15, "hoog");
    expect(hp.setImage).toHaveBeenCalledWith(expect.stringContaining("%3EWERK%3C"));
    expect(ander.setImage).not.toHaveBeenCalled();
  });

  it("geeft 0 en waarschuwt bij een onbekende naam, zonder DDC-opdracht", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, logger } = maakMetKnoppen(brug);
    const hp = nepKnop("ctx-hp");
    actie.zichtbaar = [hp];
    await actie.onWillAppear(verschijn(hp, { ...GEHEUGEN, sneltoetsnaam: "hp" }));
    expect(await actie.wisselViaSneltoets("bestaatniet")).toBe(0);
    expect(logger.regels.join("\n")).toContain("sneltoets zonder knop: bestaatniet");
    expect(brug.leesIngangen).not.toHaveBeenCalled();
    expect(brug.zetIngang).not.toHaveBeenCalled();
    expect(hp.showAlert).not.toHaveBeenCalled();
  });

  it("spreekt een knop die niet zichtbaar is niet aan", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, logger } = maakMetKnoppen(brug);
    const hp = nepKnop("ctx-hp");
    await actie.onWillAppear(verschijn(hp, { ...GEHEUGEN, sneltoetsnaam: "hp" }));
    actie.zichtbaar = [];
    expect(await actie.wisselViaSneltoets("hp")).toBe(0);
    expect(brug.zetIngang).not.toHaveBeenCalled();
    expect(logger.regels.join("\n")).toContain("sneltoets zonder knop: hp");
  });

  it("werkt het geheugen precies zo bij als een druk op de knop", async () => {
    const start: Instellingen = { ...GEHEUGEN, onthoudenStand: "pc", sneltoetsnaam: "hp" };

    const brugDruk = nepBrug({ hp: 17 });
    const { actie: viaDruk } = maakMetKnoppen(brugDruk);
    const knopDruk = nepKnop("ctx-hp");
    await viaDruk.onWillAppear(verschijn(knopDruk, start));
    knopDruk.setImage.mockClear();
    await viaDruk.onKeyDown(druk(knopDruk, start));
    opruimen?.();

    const brugToets = nepBrug({ hp: 17 });
    const { actie: viaToets } = maakMetKnoppen(brugToets);
    const knopToets = nepKnop("ctx-hp");
    viaToets.zichtbaar = [knopToets];
    await viaToets.onWillAppear(verschijn(knopToets, start));
    knopToets.setImage.mockClear();
    expect(await viaToets.wisselViaSneltoets("HP")).toBe(1);

    expect(brugToets.zetIngang.mock.calls).toEqual(brugDruk.zetIngang.mock.calls);
    expect(brugToets.zetIngang).toHaveBeenCalledWith("hp", 15, "hoog");
    expect(knopToets.setSettings.mock.calls).toEqual(knopDruk.setSettings.mock.calls);
    expect(knopToets.setSettings).toHaveBeenCalledWith({ ...start, onthoudenStand: "werk" });
    expect(knopToets.setImage.mock.calls).toEqual(knopDruk.setImage.mock.calls);
    expect(brugToets.leesIngangen).not.toHaveBeenCalled();

    // En de volgende sneltoets leest dat verse geheugen: terug naar de thuisingang.
    await viaToets.wisselViaSneltoets("hp");
    expect(brugToets.zetIngang).toHaveBeenLastCalledWith("hp", 17, "hoog");
  });

  it("meet niet opnieuw als alleen de sneltoetsnaam verandert", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maakMetKnoppen(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, VOLLEDIG));
    await actie.onDidReceiveSettings(instellingenEvent(knop, { ...VOLLEDIG, sneltoetsnaam: "hp" }));
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
  });
});

describe("WisselIngang via een Sneltoets (toets, ADR-0004)", () => {
  class MetZichtbareKnoppen extends WisselIngang {
    zichtbaar: Knop[] = [];
    protected override zichtbareKnoppen() {
      return this.zichtbaar as never;
    }
  }
  function nepLuisteraar() {
    let bijDruk: (context: string) => void = () => {};
    return {
      stel: vi.fn((_mapping: ReadonlyMap<string, string>) => {}),
      bijToets: (cb: (context: string) => void) => {
        bijDruk = cb;
      },
      druk: (context: string) => bijDruk(context),
    };
  }
  function maakMetLuisteraar(brug: ReturnType<typeof nepBrug>) {
    const logger = nepLogger();
    const meter = new Meter(brug, 600000);
    opruimen = () => meter.stop();
    const luisteraar = nepLuisteraar();
    return { actie: new MetZichtbareKnoppen(brug, meter, logger, luisteraar), logger, luisteraar };
  }
  const laatsteMapping = (l: ReturnType<typeof nepLuisteraar>) => l.stel.mock.calls.at(-1)?.[0];

  it("geeft de toets van een verschenen knop door aan de luisteraar", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, luisteraar } = maakMetLuisteraar(brug);
    const hp = nepKnop("ctx-hp");
    await actie.onWillAppear(verschijn(hp, { ...VOLLEDIG, sneltoetsToets: "F21" }));
    expect(laatsteMapping(luisteraar)).toEqual(new Map([["F21", "ctx-hp"]]));
  });

  it("wisselt bij een toetsdruk precies zoals bij een druk op de knop", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, luisteraar, logger } = maakMetLuisteraar(brug);
    const hp = nepKnop("ctx-hp");
    actie.zichtbaar = [hp];
    await actie.onWillAppear(verschijn(hp, { ...VOLLEDIG, sneltoetsToets: "F21" }));
    hp.setImage.mockClear();
    luisteraar.druk("ctx-hp");
    await vi.waitFor(() => expect(logger.regels.join("\n")).toContain("sneltoets F21: knop ctx-hp gewisseld"));
    // Verse poll-meting 17 (thuis), dus 15 (werk) erheen; zelfde logregel als een knopdruk.
    expect(brug.zetIngang).toHaveBeenCalledWith("hp", 15, "hoog");
    expect(hp.setImage).toHaveBeenCalledWith(expect.stringContaining("%3EWERK%3C"));
    expect(logger.regels.join("\n")).toContain("wissel scherm=hp meting=17 stand=pc gestuurd=15 ok=true bron=cache");
  });

  it("haalt een verdwenen knop uit de toetsen", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, luisteraar } = maakMetLuisteraar(brug);
    const hp = nepKnop("ctx-hp");
    const samsung = nepKnop("ctx-samsung");
    await actie.onWillAppear(verschijn(hp, { ...GEHEUGEN, sneltoetsToets: "F21" }));
    await actie.onWillAppear(verschijn(samsung, { ...GEHEUGEN, sneltoetsToets: "F22" }));
    expect(laatsteMapping(luisteraar)).toEqual(new Map([["F21", "ctx-hp"], ["F22", "ctx-samsung"]]));
    await actie.onWillDisappear(verdwijn(hp));
    expect(laatsteMapping(luisteraar)).toEqual(new Map([["F22", "ctx-samsung"]]));
  });

  it("volgt een gewijzigde of gewiste toets in de instellingen", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, luisteraar } = maakMetLuisteraar(brug);
    const hp = nepKnop("ctx-hp");
    await actie.onWillAppear(verschijn(hp, GEHEUGEN));
    expect(laatsteMapping(luisteraar)).toEqual(new Map());
    await actie.onDidReceiveSettings(instellingenEvent(hp, { ...GEHEUGEN, sneltoetsToets: "F23" }));
    expect(laatsteMapping(luisteraar)).toEqual(new Map([["F23", "ctx-hp"]]));
    await actie.onDidReceiveSettings(instellingenEvent(hp, { ...GEHEUGEN, sneltoetsToets: "" }));
    expect(laatsteMapping(luisteraar)).toEqual(new Map());
  });

  it("laat bij twee knoppen met dezelfde toets de eerste winnen en waarschuwt één keer", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, luisteraar, logger } = maakMetLuisteraar(brug);
    const hp = nepKnop("ctx-hp");
    const samsung = nepKnop("ctx-samsung");
    await actie.onWillAppear(verschijn(hp, { ...GEHEUGEN, sneltoetsToets: "F21" }));
    await actie.onWillAppear(verschijn(samsung, { ...GEHEUGEN, sneltoetsToets: "F21" }));
    await actie.onDidReceiveSettings(instellingenEvent(hp, { ...GEHEUGEN, sneltoetsToets: "F21", orientatie: "liggend" }));
    expect(laatsteMapping(luisteraar)).toEqual(new Map([["F21", "ctx-hp"]]));
    const meldingen = logger.regels.filter((r) => r.includes("staat op meer knoppen"));
    expect(meldingen).toEqual(["sneltoets F21 staat op meer knoppen; alleen knop ctx-hp reageert, ctx-samsung niet"]);
  });

  it("meet niet opnieuw als alleen de sneltoets-toets verandert", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie } = maakMetLuisteraar(brug);
    const knop = nepKnop();
    await actie.onWillAppear(verschijn(knop, VOLLEDIG));
    await actie.onDidReceiveSettings(instellingenEvent(knop, { ...VOLLEDIG, sneltoetsToets: "F21" }));
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
  });

  it("waarschuwt bij een toets voor een knop die niet (meer) zichtbaar is, zonder DDC-opdracht", async () => {
    const brug = nepBrug({ hp: 17 });
    const { actie, luisteraar, logger } = maakMetLuisteraar(brug);
    luisteraar.druk("ctx-weg");
    await vi.waitFor(() => expect(logger.regels.join("\n")).toContain("zonder zichtbare knop: ctx-weg"));
    expect(brug.zetIngang).not.toHaveBeenCalled();
  });
});
