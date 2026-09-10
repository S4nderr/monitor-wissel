# Monitor-wissel

Stream Deck-plugin die per knop één scherm wisselt tussen de thuis-pc en de werklaptop via DDC/CI, en de stand (PC of WERK) op de knop toont. Begrippen: [CONTEXT.md](CONTEXT.md). Ontwerp: [docs/ONTWERP.md](docs/ONTWERP.md). Besluiten: [docs/adr](docs/adr).

## Vereisten

- Windows 10/11, Stream Deck-software 7.1 of hoger (levert zelf Node 24 voor de plugin).
- Schermen die DDC/CI ondersteunen (meestal aan te zetten in het schermmenu).
- Om te bouwen: Node 24, `npm install`.

## Gebruik

1. Installeer de plugin (dubbelklik op het `.streamDeckPlugin`-bestand) of koppel de ontwikkelversie: `npx streamdeck link nl.sander.monitor-wissel.sdPlugin`.
2. Sleep "Wissel ingang" op een knop. Kies scherm, thuisingang, werkingang en oriëntatie.
3. Codes zijn decimaal: 17 = HDMI 1, 15 = DisplayPort. Samsung-schermen gebruiken eigen codes (5 = HDMI 1, 6 = HDMI 2); vul die in het veld "code handmatig".

De regel: staat het scherm op de thuisingang, dan naar de werkingang; in elk ander geval (werk, onbekend, niet leesbaar) naar de thuisingang.

## Gedrag

- De Property Inspector vraagt de schermlijst één keer op (~4 s, één `ddc.ps1 list`) en bewaart die 60 s; de keuzelijsten voor scherm en ingang openen daarna meteen.
- Een knopdruk gaat voor op de achtergrondpoll: de DDC-aanroep voor een druk wordt altijd eerder uitgevoerd dan een lopende of wachtende poll.
- Is de laatste meting van een knop jonger dan 5 s, dan gebruikt een druk die meting meteen in plaats van eerst opnieuw te meten.
- Komt een tweede druk binnen terwijl de wissel van de vorige druk nog loopt, dan wordt die genegeerd; er gaat geen dubbele DDC-opdracht uit.

## Ontwikkelen

- `npm test` – eenheidstests (vitest).
- `npm run restart` – bouwen en de plugin in Stream Deck herstarten.
- `npm run validate` – manifest en map controleren.
- `npm run pack` – `.streamDeckPlugin`-bestand maken.
- Logs: `nl.sander.monitor-wissel.sdPlugin/logs/`. Het DDC-script los draaien: `powershell -ExecutionPolicy Bypass -File nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1 list`.

## Bekende eigenschappen van Sanders schermen

- HP E273q (serie 6CM81602H4): thuis 17, werk 15; onleesbaar zodra hij de laptop toont (de knop toont dan WERK); springt bij ontbrekend signaal zelf terug.
- Samsung Odyssey G5: thuis 15, werk 5; altijd leesbaar; blijft op een lege ingang staan.
