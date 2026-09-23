import streamDeck from "@elgato/streamdeck";
import path from "node:path";
import { WisselIngang } from "./actions/wissel-ingang.js";
import { PowerShellDdcBrug } from "./ddc/ddc-brug.js";
import { Meter } from "./ddc/meter.js";
import { verwerkDeepLink } from "./sneltoets.js";

// LogLevel is in SDK 2.1.2 een string-union (type), geen enum, en wordt niet
// geëxporteerd door @elgato/streamdeck; het niveau geef je als tekst door.
streamDeck.logger.setLevel("info");

// bin/plugin.js → ../ps/ddc.ps1, altijd absoluut (nooit process.cwd()).
const scriptPad = path.resolve(import.meta.dirname, "..", "ps", "ddc.ps1");
const brug = new PowerShellDdcBrug(scriptPad, streamDeck.logger);
// Eén gebundelde meting per 5 s voor alle zichtbare knoppen.
const meter = new Meter(brug, 5000);

const wisselIngang = new WisselIngang(brug, meter, streamDeck.logger);
streamDeck.actions.registerAction(wisselIngang);
// Sneltoets: streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/<naam> komt hier binnen
// als pad "/wissel/<naam>" en voert de Wissel uit van de zichtbare knop met die Sneltoetsnaam.
streamDeck.system.onDidReceiveDeepLink((ev) => void verwerkDeepLink(ev.url.path, wisselIngang, streamDeck.logger));
streamDeck.logger.info(`Monitor-wissel start, ddc-script: ${scriptPad}`);
streamDeck.connect();
