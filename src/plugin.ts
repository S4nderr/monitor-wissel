import streamDeck from "@elgato/streamdeck";
import path from "node:path";
import { WisselIngang } from "./actions/wissel-ingang.js";
import { PowerShellDdcBrug } from "./ddc/ddc-brug.js";

// LogLevel is in SDK 2.1.2 een string-union (type), geen enum, en wordt niet
// geëxporteerd door @elgato/streamdeck; het niveau geef je als tekst door.
streamDeck.logger.setLevel("info");

// bin/plugin.js → ../ps/ddc.ps1, altijd absoluut (nooit process.cwd()).
const scriptPad = path.resolve(import.meta.dirname, "..", "ps", "ddc.ps1");
const brug = new PowerShellDdcBrug(scriptPad, streamDeck.logger);

streamDeck.actions.registerAction(new WisselIngang(brug));
streamDeck.logger.info(`Monitor-wissel start, ddc-script: ${scriptPad}`);
streamDeck.connect();
