import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyAction,
  type KeyDownEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { DdcBrug } from "../ddc/ddc-brug.js";
import type { Meter } from "../ddc/meter.js";
import { SchermenCache } from "../ddc/schermen-cache.js";
import { configuratie, ingangItems, schermItems, type KnopConfiguratie } from "../domein/knop-configuratie.js";
import type { Instellingen, Meting, Stand } from "../domein/types.js";
import { bepaalDoel, bepaalStand, onthoudNaZet, standUitGeheugen } from "../domein/wisselregel.js";
import { normaliseerSneltoetsnaam } from "../sneltoets.js";
import { normaliseerToets } from "../sneltoets-luisteraar.js";
import { knopDataUrl } from "../weergave/knop-svg.js";

/** Wat de Property Inspector vraagt: welke keuzelijst gevuld moet worden. */
type DatasourceVerzoek = { event: string; isRefresh?: boolean };

/** Alleen wat deze actie van de logger nodig heeft, zodat de tests hem kunnen vervangen. */
export type Logger = { info(bericht: string): void; warn(bericht: string): void };

/** Het deel van de SneltoetsLuisteraar dat deze actie gebruikt; tests geven een nepluisteraar. */
export type ToetsLuisteraar = {
  stel(mapping: ReadonlyMap<string, string>): void;
  bijToets(callback: (context: string) => void): void;
};

/** Zo oud mag de laatste meting zijn om bij een knopdruk hergebruikt te worden: één pollronde. */
const MEETVERSHEID_MS = 5000;

/**
 * Bundelduur voor stelSneltoetsen(): bij het verschijnen van meerdere knoppen (bv. bij het
 * opstarten) komt er per knop een apart appear/settings-event binnen. Riep elk daarvan meteen
 * luisteraar.stel() aan, dan herstart het PowerShell-proces (spawn + Add-Type compileren, ~1-2 s)
 * telkens opnieuw. Pas na deze stilte gaat de verzamelde mapping in één keer weg.
 */
const SNELTOETSEN_BUNDEL_MS = 50;

/** Twee configuraties zijn gelijk als alles wat de knop laat doen en tonen gelijk is. */
function zelfdeConfiguratie(a: KnopConfiguratie | undefined, b: KnopConfiguratie): boolean {
  return (
    a !== undefined &&
    a.schermId === b.schermId &&
    a.thuis === b.thuis &&
    a.werk === b.werk &&
    a.orientatie === b.orientatie &&
    a.geheugenstand === b.geheugenstand
  );
}

@action({ UUID: "nl.sander.monitor-wissel.wissel-ingang" })
export class WisselIngang extends SingletonAction<Instellingen> {
  /** Laatst getekende stand per knop, zodat we niet elke poll opnieuw tekenen. */
  private readonly laatsteStand = new Map<string, Stand>();
  /** Laatste meting per knop met het tijdstip, zodat een knopdruk vaak geen verse leesronde kost. */
  private readonly laatsteMeting = new Map<string, { meting: Meting; tijd: number }>();
  /** Knoppen waarvoor nu een wissel loopt; een tweede druk daarop wordt genegeerd. */
  private readonly wisselBezig = new Set<string>();
  /**
   * Laatst ontvangen instellingen per knop. De Property Inspector vraagt zijn keuzelijsten op met
   * sendToPlugin; getSettings() daar zou een didReceiveSettings uitlokken die weer bij
   * onDidReceiveSettings uitkomt (de SDK routeert dat altijd naar de handler), met een overbodige
   * hermeting per PI-opening tot gevolg. Daarom lezen we het schermId hieruit.
   */
  private readonly instellingen = new Map<string, Instellingen>();
  /** Configuratie waarmee deze knop nu bij de meter staat; gelijk = niets te doen. */
  private readonly gevolgdeConfiguratie = new Map<string, KnopConfiguratie>();
  /** De schermlijst kost ~4 s; één antwoord bedient beide keuzelijsten van de Property Inspector. */
  private readonly schermenCache: SchermenCache;
  /** Toetsconflicten ("F21 ctx") die al gemeld zijn, zodat het log er niet bij elke wijziging vol van loopt. */
  private readonly gemeldeToetsconflicten = new Set<string>();
  /** Lopende bundeltimer voor stelSneltoetsen(); een nieuwe wijziging verzet hem in plaats van er nog een te starten. */
  private sneltoetsenTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly brug: DdcBrug,
    private readonly meter: Meter,
    private readonly logger: Logger,
    private readonly luisteraar?: ToetsLuisteraar,
  ) {
    super();
    this.schermenCache = new SchermenCache(brug, 60000);
    // ADR-0004: de luisteraar meldt de context van de knop waarvan de Sneltoets ingedrukt is.
    luisteraar?.bijToets((context) => void this.wisselViaToets(context));
  }

  override async onWillAppear(ev: WillAppearEvent<Instellingen>): Promise<void> {
    // isKey() versmalt de unie action naar KeyAction; een draaiknop laten we met rust.
    if (!ev.action.isKey()) return;
    const knop = ev.action;
    this.instellingen.set(ev.action.id, ev.payload.settings);
    this.stelSneltoetsen();
    await this.herVolg(ev.action.id, ev.payload.settings, (dataUrl) => knop.setImage(dataUrl));
  }

  override async onWillDisappear(ev: WillDisappearEvent<Instellingen>): Promise<void> {
    this.meter.vergeet(ev.action.id);
    this.laatsteStand.delete(ev.action.id);
    this.laatsteMeting.delete(ev.action.id);
    this.instellingen.delete(ev.action.id);
    this.gevolgdeConfiguratie.delete(ev.action.id);
    this.stelSneltoetsen();
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Instellingen>): Promise<void> {
    if (!ev.action.isKey()) return;
    const knop = ev.action;
    this.instellingen.set(ev.action.id, ev.payload.settings);
    this.stelSneltoetsen();
    await this.herVolg(ev.action.id, ev.payload.settings, (dataUrl) => knop.setImage(dataUrl));
  }

  override async onKeyDown(ev: KeyDownEvent<Instellingen>): Promise<void> {
    await this.voerWisselUit(ev.action, ev.payload.settings);
  }

  /**
   * Sneltoets: voert de Wissel uit van elke zichtbare knop met deze Sneltoetsnaam, precies zoals
   * een druk op die knop. Geeft terug hoeveel knoppen er aangesproken zijn (normaal één).
   */
  async wisselViaSneltoets(naam: string): Promise<number> {
    const gezocht = normaliseerSneltoetsnaam(naam);
    if (gezocht === "") {
      this.logger.warn("sneltoets zonder naam genegeerd");
      return 0;
    }
    const treffers: { knop: KeyAction<Instellingen>; instellingen: Instellingen }[] = [];
    for (const knop of this.zichtbareKnoppen()) {
      // De onthouden instellingen, niet getSettings(): die zouden een didReceiveSettings uitlokken.
      const instellingen = this.instellingen.get(knop.id);
      if (instellingen && normaliseerSneltoetsnaam(instellingen.sneltoetsnaam) === gezocht) {
        treffers.push({ knop, instellingen });
      }
    }
    if (treffers.length === 0) {
      this.logger.warn(`sneltoets zonder knop: ${gezocht}`);
      return 0;
    }
    await Promise.all(
      treffers.map(async ({ knop, instellingen }) => {
        const gewisseld = await this.voerWisselUit(knop, instellingen);
        if (gewisseld) {
          this.logger.info(`sneltoets ${gezocht}: knop ${knop.id} gewisseld`);
        } else {
          this.logger.info(`sneltoets ${gezocht}: knop ${knop.id} niet gewisseld (bezig of onvolledig)`);
        }
      }),
    );
    return treffers.length;
  }

  /**
   * Sneltoets (toets), ADR-0004: de luisteraar zag de toets van de knop met deze context. Voert
   * dezelfde Wissel uit als een druk op die knop; gooit nooit, want hij draait los van elke knopdruk.
   */
  async wisselViaToets(context: string): Promise<void> {
    const instellingen = this.instellingen.get(context);
    const toets = normaliseerToets(instellingen?.sneltoetsToets) ?? "?";
    try {
      // De opzoeking staat bewust in deze try: zichtbareKnoppen() leest this.actions uit het
      // SDK-register en mag deze functie, die los van elke knopdruk draait, nooit laten gooien.
      const knop = instellingen ? [...this.zichtbareKnoppen()].find((k) => k.id === context) : undefined;
      if (!knop || !instellingen) {
        this.logger.warn(`sneltoets ${toets} zonder zichtbare knop: ${context}`);
        return;
      }
      const gewisseld = await this.voerWisselUit(knop, instellingen);
      if (gewisseld) {
        this.logger.info(`sneltoets ${toets}: knop ${context} gewisseld`);
      } else {
        this.logger.info(`sneltoets ${toets}: knop ${context} niet gewisseld (bezig of onvolledig)`);
      }
    } catch (fout) {
      this.logger.warn(`sneltoets ${toets} mislukt: ${fout instanceof Error ? fout.message : String(fout)}`);
    }
  }

  /**
   * Vraagt een (gebundelde) doorgifte van de toetsen aan de luisteraar aan. Meerdere appear/
   * disappear/settings-events kort na elkaar (bv. bij het opstarten) leveren zo één stel()-aanroep
   * op in plaats van spawn -> kill -> spawn per knop.
   */
  private stelSneltoetsen(): void {
    if (!this.luisteraar) return;
    if (this.sneltoetsenTimer) clearTimeout(this.sneltoetsenTimer);
    this.sneltoetsenTimer = setTimeout(() => {
      this.sneltoetsenTimer = undefined;
      this.stelSneltoetsenNu();
    }, SNELTOETSEN_BUNDEL_MS);
  }

  /**
   * Geeft de luisteraar de toetsen van alle zichtbare knoppen (toets -> context). De instellingen-map
   * bevat precies de verschenen knoppen, in volgorde van verschijnen; hebben twee knoppen dezelfde
   * toets, dan wint de eerste en melden we het conflict één keer.
   */
  private stelSneltoetsenNu(): void {
    if (!this.luisteraar) return;
    const mapping = new Map<string, string>();
    for (const [context, instellingen] of this.instellingen) {
      const toets = normaliseerToets(instellingen.sneltoetsToets);
      if (toets === undefined) continue;
      const eerste = mapping.get(toets);
      if (eerste === undefined) {
        mapping.set(toets, context);
        continue;
      }
      const conflict = `${toets} ${context}`;
      if (!this.gemeldeToetsconflicten.has(conflict)) {
        this.gemeldeToetsconflicten.add(conflict);
        this.logger.warn(`sneltoets ${toets} staat op meer knoppen; alleen knop ${eerste} reageert, ${context} niet`);
      }
    }
    // Een conflict dat opgelost is, mag later opnieuw gemeld worden.
    for (const conflict of this.gemeldeToetsconflicten) {
      const [toets, context] = conflict.split(" ");
      if (normaliseerToets(this.instellingen.get(context)?.sneltoetsToets) !== toets) this.gemeldeToetsconflicten.delete(conflict);
    }
    this.luisteraar.stel(mapping);
  }

  /** De knoppen van deze actie die nu op een Stream Deck-pagina zichtbaar zijn; tests vervangen dit. */
  protected zichtbareKnoppen(): Iterable<KeyAction<Instellingen>> {
    return this.actions.toArray().filter((a): a is KeyAction<Instellingen> => a.isKey());
  }

  /**
   * De Wissel van één knop; gedeeld door een knopdruk en een Sneltoets. Geeft terug of er
   * daadwerkelijk een zetopdracht is verstuurd én geslaagd, zodat de aanroeper eerlijk kan loggen
   * (bezig/onvolledig/mislukt logt hier zelf al, maar telt niet als "gewisseld").
   */
  private async voerWisselUit(knop: KeyAction<Instellingen>, instellingen: Instellingen): Promise<boolean> {
    const cfg = configuratie(instellingen);
    if (!cfg) {
      this.logger.warn(`wissel geweigerd: knop ${knop.id} is niet volledig ingesteld`);
      await knop.showAlert();
      return false;
    }
    // Drukt iemand tien keer in zeven seconden, dan wisselen we niet tien keer: de druk die
    // binnenkomt terwijl de vorige wissel nog loopt vervalt zonder DDC-aanroep.
    if (this.wisselBezig.has(knop.id)) {
      this.logger.info(`wissel genegeerd: vorige loopt nog (${knop.id})`);
      return false;
    }
    this.wisselBezig.add(knop.id);
    try {
      if (cfg.geheugenstand) {
        return await this.wisselUitGeheugen(knop, instellingen, cfg);
      }
      // De poll meet elke 5 s; is die meting nog vers, dan slaan we de leesronde (~0,8 s) over.
      const bekend = this.laatsteMeting.get(knop.id);
      const versGenoeg = bekend !== undefined && Date.now() - bekend.tijd < MEETVERSHEID_MS;
      const bron = versGenoeg ? "cache" : "vers";
      const meting = versGenoeg ? bekend.meting : ((await this.brug.leesIngangen([cfg.schermId], "hoog")).get(cfg.schermId) ?? null);
      const stand = bepaalStand(meting, cfg.thuis, cfg.werk);
      const doel = bepaalDoel(stand, cfg.thuis, cfg.werk);
      const resultaat = await this.brug.zetIngang(cfg.schermId, doel, "hoog");
      // Geslaagd of niet: na een zetopdracht weten we niet meer op welke ingang het scherm staat,
      // dus gaat de onthouden meting weg; de hermeting na 2 s vult hem opnieuw.
      this.laatsteMeting.delete(knop.id);
      this.logger.info(
        `wissel scherm=${cfg.schermId} meting=${meting ?? "leesfout"} stand=${stand} gestuurd=${doel} ok=${resultaat.ok}${resultaat.fout ? ` fout=${resultaat.fout}` : ""} bron=${bron}`,
      );
      if (!resultaat.ok) {
        await knop.showAlert();
        return false;
      }
      // Optimistisch tonen; de hermeting na 2 s corrigeert als het scherm niet is gewisseld.
      const nieuweStand: Stand = stand === "pc" ? "werk" : "pc";
      this.laatsteStand.set(knop.id, nieuweStand);
      await knop.setImage(knopDataUrl(nieuweStand, cfg.orientatie));
      this.meter.meetStraks(2000);
      return true;
    } catch (fout) {
      // De brug vangt zijn eigen fouten af, maar een toekomstige versie mag deze knop niet slopen.
      this.logger.warn(`wissel mislukt: ${fout instanceof Error ? fout.message : String(fout)} (${knop.id})`);
      await knop.showAlert();
      return false;
    } finally {
      this.wisselBezig.delete(knop.id);
    }
  }

  override async onSendToPlugin(ev: SendToPluginEvent<DatasourceVerzoek, Instellingen>): Promise<void> {
    const { event } = ev.payload;
    if (event === "schermen") {
      const schermen = await this.schermenCache.haal();
      if (schermen.length === 0) this.logger.warn("geen schermen gevonden via ddc.ps1");
      await streamDeck.ui.sendToPropertyInspector({ event, items: schermItems(schermen) });
      return;
    }
    if (event === "ingangen") {
      // De sdpi-select stuurt bij een refresh alleen {event, isRefresh}; het schermId komt uit de
      // instellingen die we bij onWillAppear/onDidReceiveSettings hebben onthouden. Dat loopt niet
      // achter: de PI stuurt zijn setSettings over dezelfde socket vóór de sendToPlugin, dus het
      // didReceiveSettings met de nieuwe waarde is hier altijd al binnen.
      const schermId = this.instellingen.get(ev.action.id)?.schermId;
      const schermen = await this.schermenCache.haal();
      const scherm = schermen.find((s) => s.id === schermId);
      await streamDeck.ui.sendToPropertyInspector({ event, items: ingangItems(scherm) });
    }
  }

  /**
   * ADR-0003: wisselen zonder te meten. De stand komt uit het geheugen in de knopinstellingen en
   * de nieuwe kant wordt daar na een geslaagde zetopdracht weer in bewaard, dus ook na een herstart.
   */
  private async wisselUitGeheugen(knop: KeyAction<Instellingen>, instellingen: Instellingen, cfg: KnopConfiguratie): Promise<boolean> {
    // De onthouden instellingen lopen nooit achter op de payload: wij schrijven ze hieronder zelf bij.
    const huidigeInstellingen = this.instellingen.get(knop.id) ?? instellingen;
    const stand = standUitGeheugen(huidigeInstellingen.onthoudenStand);
    const doel = bepaalDoel(stand, cfg.thuis, cfg.werk);
    const resultaat = await this.brug.zetIngang(cfg.schermId, doel, "hoog");
    this.logger.info(
      `wissel scherm=${cfg.schermId} meting=geheugen stand=${stand} gestuurd=${doel} ok=${resultaat.ok}${resultaat.fout ? ` fout=${resultaat.fout}` : ""} bron=geheugen`,
    );
    if (!resultaat.ok) {
      // Mislukt: het geheugen blijft staan, zodat de volgende druk dezelfde kant opnieuw probeert.
      await knop.showAlert();
      return false;
    }
    const onthoudenStand = onthoudNaZet(doel, cfg.werk);
    // Samenvoegen, nooit vervangen: setSettings schrijft de hele instellingenset van de knop.
    const nieuweInstellingen: Instellingen = { ...huidigeInstellingen, onthoudenStand };
    this.instellingen.set(knop.id, nieuweInstellingen);
    this.laatsteStand.set(knop.id, onthoudenStand);
    await knop.setSettings(nieuweInstellingen);
    await knop.setImage(knopDataUrl(onthoudenStand, cfg.orientatie));
    return true;
  }

  /** Registreert de knop bij de meter (of haalt hem eraf als hij onvolledig is) en tekent direct. */
  private async herVolg(context: string, instellingen: Instellingen, teken: (dataUrl: string) => Promise<void>): Promise<void> {
    const cfg = configuratie(instellingen);
    if (!cfg) {
      this.meter.vergeet(context);
      this.laatsteStand.delete(context);
      this.laatsteMeting.delete(context);
      this.gevolgdeConfiguratie.delete(context);
      await teken(knopDataUrl("onbekend", instellingen.orientatie ?? "staand"));
      return;
    }
    if (cfg.thuis === cfg.werk) {
      this.logger.warn(`knop ${context} heeft dezelfde thuis- en werkingang (${cfg.thuis}); wisselen doet dan niets`);
    }
    if (cfg.geheugenstand) {
      // ADR-0003: dit scherm meldt zijn ingang niet betrouwbaar, dus niet meten en niet pollen;
      // de knop toont wat hij het laatst gestuurd heeft. Deze tak staat vóór de
      // gelijke-configuratie-controle, want na elke druk komt hier een setSettings binnen en dan
      // moet juist het verse geheugen op de knop komen, niet de laatst getekende stand.
      this.meter.vergeet(context);
      this.laatsteMeting.delete(context);
      this.gevolgdeConfiguratie.set(context, cfg);
      const stand = standUitGeheugen(instellingen.onthoudenStand);
      this.laatsteStand.set(context, stand);
      await teken(knopDataUrl(stand, cfg.orientatie));
      return;
    }
    // Dezelfde configuratie opnieuw volgen zou alleen de verse meting weggooien en een extra
    // leesronde kosten; de knop staat dan al goed bij de meter.
    if (zelfdeConfiguratie(this.gevolgdeConfiguratie.get(context), cfg)) {
      // Niet opnieuw meten, wel tekenen: een tweede willAppear (apparaat opnieuw
      // verbonden) kan een leeg knopbeeld betekenen.
      await teken(knopDataUrl(this.laatsteStand.get(context) ?? "onbekend", cfg.orientatie));
      return;
    }
    this.gevolgdeConfiguratie.set(context, cfg);
    // Opnieuw volgen vervangt de vorige luisteraar van deze knop; nooit twee polls voor één knop.
    this.laatsteStand.delete(context);
    this.laatsteMeting.delete(context);
    this.meter.volg(context, cfg.schermId, (meting: Meting) => {
      // Elke poll ververst de meting die een knopdruk mag hergebruiken, ook als het beeld gelijk blijft.
      this.laatsteMeting.set(context, { meting, tijd: Date.now() });
      const stand = bepaalStand(meting, cfg.thuis, cfg.werk);
      if (this.laatsteStand.get(context) === stand) return;
      this.laatsteStand.set(context, stand);
      void teken(knopDataUrl(stand, cfg.orientatie));
    });
    await this.meter.meetNu();
  }
}
