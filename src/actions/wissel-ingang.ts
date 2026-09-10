import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
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
import { knopDataUrl } from "../weergave/knop-svg.js";

/** Wat de Property Inspector vraagt: welke keuzelijst gevuld moet worden. */
type DatasourceVerzoek = { event: string; isRefresh?: boolean };

/** Alleen wat deze actie van de logger nodig heeft, zodat de tests hem kunnen vervangen. */
export type Logger = { info(bericht: string): void; warn(bericht: string): void };

/** Zo oud mag de laatste meting zijn om bij een knopdruk hergebruikt te worden: één pollronde. */
const MEETVERSHEID_MS = 5000;

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

  constructor(
    private readonly brug: DdcBrug,
    private readonly meter: Meter,
    private readonly logger: Logger,
  ) {
    super();
    this.schermenCache = new SchermenCache(brug, 60000);
  }

  override async onWillAppear(ev: WillAppearEvent<Instellingen>): Promise<void> {
    // isKey() versmalt de unie action naar KeyAction; een draaiknop laten we met rust.
    if (!ev.action.isKey()) return;
    const knop = ev.action;
    this.instellingen.set(ev.action.id, ev.payload.settings);
    await this.herVolg(ev.action.id, ev.payload.settings, (dataUrl) => knop.setImage(dataUrl));
  }

  override async onWillDisappear(ev: WillDisappearEvent<Instellingen>): Promise<void> {
    this.meter.vergeet(ev.action.id);
    this.laatsteStand.delete(ev.action.id);
    this.laatsteMeting.delete(ev.action.id);
    this.instellingen.delete(ev.action.id);
    this.gevolgdeConfiguratie.delete(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Instellingen>): Promise<void> {
    if (!ev.action.isKey()) return;
    const knop = ev.action;
    this.instellingen.set(ev.action.id, ev.payload.settings);
    await this.herVolg(ev.action.id, ev.payload.settings, (dataUrl) => knop.setImage(dataUrl));
  }

  override async onKeyDown(ev: KeyDownEvent<Instellingen>): Promise<void> {
    const cfg = configuratie(ev.payload.settings);
    if (!cfg) {
      this.logger.warn(`wissel geweigerd: knop ${ev.action.id} is niet volledig ingesteld`);
      await ev.action.showAlert();
      return;
    }
    // Drukt iemand tien keer in zeven seconden, dan wisselen we niet tien keer: de druk die
    // binnenkomt terwijl de vorige wissel nog loopt vervalt zonder DDC-aanroep.
    if (this.wisselBezig.has(ev.action.id)) {
      this.logger.info(`wissel genegeerd: vorige loopt nog (${ev.action.id})`);
      return;
    }
    this.wisselBezig.add(ev.action.id);
    try {
      if (cfg.geheugenstand) {
        await this.wisselUitGeheugen(ev, cfg);
        return;
      }
      // De poll meet elke 5 s; is die meting nog vers, dan slaan we de leesronde (~0,8 s) over.
      const bekend = this.laatsteMeting.get(ev.action.id);
      const versGenoeg = bekend !== undefined && Date.now() - bekend.tijd < MEETVERSHEID_MS;
      const bron = versGenoeg ? "cache" : "vers";
      const meting = versGenoeg ? bekend.meting : ((await this.brug.leesIngangen([cfg.schermId], "hoog")).get(cfg.schermId) ?? null);
      const stand = bepaalStand(meting, cfg.thuis, cfg.werk);
      const doel = bepaalDoel(stand, cfg.thuis, cfg.werk);
      const resultaat = await this.brug.zetIngang(cfg.schermId, doel, "hoog");
      // Geslaagd of niet: na een zetopdracht weten we niet meer op welke ingang het scherm staat,
      // dus gaat de onthouden meting weg; de hermeting na 2 s vult hem opnieuw.
      this.laatsteMeting.delete(ev.action.id);
      this.logger.info(
        `wissel scherm=${cfg.schermId} meting=${meting ?? "leesfout"} stand=${stand} gestuurd=${doel} ok=${resultaat.ok}${resultaat.fout ? ` fout=${resultaat.fout}` : ""} bron=${bron}`,
      );
      if (!resultaat.ok) {
        await ev.action.showAlert();
        return;
      }
      // Optimistisch tonen; de hermeting na 2 s corrigeert als het scherm niet is gewisseld.
      const nieuweStand: Stand = stand === "pc" ? "werk" : "pc";
      this.laatsteStand.set(ev.action.id, nieuweStand);
      await ev.action.setImage(knopDataUrl(nieuweStand, cfg.orientatie));
      this.meter.meetStraks(2000);
    } catch (fout) {
      // De brug vangt zijn eigen fouten af, maar een toekomstige versie mag deze knop niet slopen.
      this.logger.warn(`wissel mislukt: ${fout instanceof Error ? fout.message : String(fout)} (${ev.action.id})`);
      await ev.action.showAlert();
    } finally {
      this.wisselBezig.delete(ev.action.id);
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
  private async wisselUitGeheugen(ev: KeyDownEvent<Instellingen>, cfg: KnopConfiguratie): Promise<void> {
    // De onthouden instellingen lopen nooit achter op de payload: wij schrijven ze hieronder zelf bij.
    const huidigeInstellingen = this.instellingen.get(ev.action.id) ?? ev.payload.settings;
    const stand = standUitGeheugen(huidigeInstellingen.onthoudenStand);
    const doel = bepaalDoel(stand, cfg.thuis, cfg.werk);
    const resultaat = await this.brug.zetIngang(cfg.schermId, doel, "hoog");
    this.logger.info(
      `wissel scherm=${cfg.schermId} meting=geheugen stand=${stand} gestuurd=${doel} ok=${resultaat.ok}${resultaat.fout ? ` fout=${resultaat.fout}` : ""} bron=geheugen`,
    );
    if (!resultaat.ok) {
      // Mislukt: het geheugen blijft staan, zodat de volgende druk dezelfde kant opnieuw probeert.
      await ev.action.showAlert();
      return;
    }
    const onthoudenStand = onthoudNaZet(doel, cfg.werk);
    // Samenvoegen, nooit vervangen: setSettings schrijft de hele instellingenset van de knop.
    const nieuweInstellingen: Instellingen = { ...huidigeInstellingen, onthoudenStand };
    this.instellingen.set(ev.action.id, nieuweInstellingen);
    this.laatsteStand.set(ev.action.id, onthoudenStand);
    await ev.action.setSettings(nieuweInstellingen);
    await ev.action.setImage(knopDataUrl(onthoudenStand, cfg.orientatie));
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
    if (cfg.thuis === cfg.werk) {
      this.logger.warn(`knop ${context} heeft dezelfde thuis- en werkingang (${cfg.thuis}); wisselen doet dan niets`);
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
