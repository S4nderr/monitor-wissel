import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import type { DdcBrug } from "../ddc/ddc-brug.js";
import { ingangItems, schermItems } from "../domein/knop-configuratie.js";
import type { Instellingen } from "../domein/types.js";

/** Wat de Property Inspector vraagt: welke keuzelijst gevuld moet worden. */
type DatasourceVerzoek = { event: string; isRefresh?: boolean };

@action({ UUID: "nl.sander.monitor-wissel.wissel-ingang" })
export class WisselIngang extends SingletonAction<Instellingen> {
  constructor(private readonly brug: DdcBrug) {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent<Instellingen>): Promise<void> {
    streamDeck.logger.info(`verschijnt: ${ev.action.id} scherm=${ev.payload.settings.schermId ?? "-"}`);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Instellingen>): Promise<void> {
    streamDeck.logger.info(`instellingen: ${ev.action.id} ${JSON.stringify(ev.payload.settings)}`);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<DatasourceVerzoek, Instellingen>): Promise<void> {
    const { event } = ev.payload;
    if (event === "schermen") {
      const schermen = await this.brug.lijstSchermen();
      await streamDeck.ui.sendToPropertyInspector({ event, items: schermItems(schermen) });
      return;
    }
    if (event === "ingangen") {
      const instellingen = await ev.action.getSettings();
      const schermen = await this.brug.lijstSchermen();
      const scherm = schermen.find((s) => s.id === instellingen.schermId);
      await streamDeck.ui.sendToPropertyInspector({ event, items: ingangItems(scherm) });
    }
  }
}
