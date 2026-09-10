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
import { configuratie, ingangItems, schermItems } from "../domein/knop-configuratie.js";
import type { Instellingen, Meting, Stand } from "../domein/types.js";
import { bepaalDoel, bepaalStand } from "../domein/wisselregel.js";
import { knopDataUrl } from "../weergave/knop-svg.js";

/** Wat de Property Inspector vraagt: welke keuzelijst gevuld moet worden. */
type DatasourceVerzoek = { event: string; isRefresh?: boolean; schermId?: string };

@action({ UUID: "nl.sander.monitor-wissel.wissel-ingang" })
export class WisselIngang extends SingletonAction<Instellingen> {
  /** Laatst getekende stand per knop, zodat we niet elke poll opnieuw tekenen. */
  private readonly laatsteStand = new Map<string, Stand>();

  constructor(
    private readonly brug: DdcBrug,
    private readonly meter: Meter,
  ) {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent<Instellingen>): Promise<void> {
    // Alleen toetsen hebben setImage; een draaiknop laten we met rust.
    if (!ev.action.isKey()) return;
    const knop = ev.action;
    await this.herVolg(ev.action.id, ev.payload.settings, (dataUrl) => knop.setImage(dataUrl));
  }

  override async onWillDisappear(ev: WillDisappearEvent<Instellingen>): Promise<void> {
    this.meter.vergeet(ev.action.id);
    this.laatsteStand.delete(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Instellingen>): Promise<void> {
    if (!ev.action.isKey()) return;
    const knop = ev.action;
    await this.herVolg(ev.action.id, ev.payload.settings, (dataUrl) => knop.setImage(dataUrl));
  }

  override async onKeyDown(ev: KeyDownEvent<Instellingen>): Promise<void> {
    const cfg = configuratie(ev.payload.settings);
    if (!cfg) {
      streamDeck.logger.warn(`wissel geweigerd: knop ${ev.action.id} is niet volledig ingesteld`);
      await ev.action.showAlert();
      return;
    }
    const meting = (await this.brug.leesIngangen([cfg.schermId])).get(cfg.schermId) ?? null;
    const stand = bepaalStand(meting, cfg.thuis, cfg.werk);
    const doel = bepaalDoel(stand, cfg.thuis, cfg.werk);
    const resultaat = await this.brug.zetIngang(cfg.schermId, doel);
    streamDeck.logger.info(
      `wissel scherm=${cfg.schermId} meting=${meting ?? "leesfout"} stand=${stand} gestuurd=${doel} ok=${resultaat.ok}${resultaat.fout ? ` fout=${resultaat.fout}` : ""}`,
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
  }

  override async onSendToPlugin(ev: SendToPluginEvent<DatasourceVerzoek, Instellingen>): Promise<void> {
    const { event } = ev.payload;
    if (event === "schermen") {
      const schermen = await this.brug.lijstSchermen();
      if (schermen.length === 0) streamDeck.logger.warn("geen schermen gevonden via ddc.ps1");
      await streamDeck.ui.sendToPropertyInspector({ event, items: schermItems(schermen) });
      return;
    }
    if (event === "ingangen") {
      // De sdpi-select stuurt bij een refresh alleen {event, isRefresh}; het schermId komt
      // dan uit de opgeslagen instellingen. Stuurt de PI het toch mee, dan wint dat (verse waarde).
      const instellingen = await ev.action.getSettings();
      const schermId = typeof ev.payload.schermId === "string" ? ev.payload.schermId : instellingen.schermId;
      const schermen = await this.brug.lijstSchermen();
      const scherm = schermen.find((s) => s.id === schermId);
      await streamDeck.ui.sendToPropertyInspector({ event, items: ingangItems(scherm) });
    }
  }

  /** Registreert de knop bij de meter (of haalt hem eraf als hij onvolledig is) en tekent direct. */
  private async herVolg(context: string, instellingen: Instellingen, teken: (dataUrl: string) => Promise<void>): Promise<void> {
    const cfg = configuratie(instellingen);
    if (!cfg) {
      this.meter.vergeet(context);
      this.laatsteStand.delete(context);
      await teken(knopDataUrl("onbekend", instellingen.orientatie ?? "staand"));
      return;
    }
    // Opnieuw volgen vervangt de vorige luisteraar van deze knop; nooit twee polls voor één knop.
    this.laatsteStand.delete(context);
    this.meter.volg(context, cfg.schermId, (meting: Meting) => {
      const stand = bepaalStand(meting, cfg.thuis, cfg.werk);
      if (this.laatsteStand.get(context) === stand) return;
      this.laatsteStand.set(context, stand);
      void teken(knopDataUrl(stand, cfg.orientatie));
    });
    await this.meter.meetNu();
  }
}
