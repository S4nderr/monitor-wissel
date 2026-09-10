import streamDeck from "@elgato/streamdeck";

// LogLevel is in SDK 2.1.2 een string-union (type), geen enum, en wordt niet
// geëxporteerd door @elgato/streamdeck; het niveau geef je als tekst door.
streamDeck.logger.setLevel("info");
streamDeck.logger.info("Monitor-wissel start");
streamDeck.connect();
