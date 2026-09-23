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
4. Zet **Geheugenstand** aan als het scherm zijn ingang niet betrouwbaar meldt: als het over de pc-kabel altijd dezelfde ingang meldt, ook terwijl het de laptop toont (zoals de HP E273q). De knop meet dan niet meer, maar onthoudt de laatst gestuurde kant in zijn instellingen en wisselt daarop. Meldt het scherm zijn ingang wél correct (zoals de Samsung), laat het vinkje dan uit.

De regel: staat het scherm op de thuisingang, dan naar de werkingang; in elk ander geval (werk, onbekend, niet leesbaar) naar de thuisingang.

## Gedrag

- De Property Inspector vraagt de schermlijst één keer op (~4 s, één `ddc.ps1 list`) en bewaart die 60 s; de keuzelijsten voor scherm en ingang openen daarna meteen.
- Een knopdruk gaat voor op wachtende achtergrondpolls: die schuiven achteraan de rij. Een poll die al bezig is wordt niet onderbroken, dus een druk kan daar nog even op wachten.
- Is de laatste meting van een knop jonger dan 5 s, dan gebruikt een druk die meting meteen in plaats van eerst opnieuw te meten.
- Komt een tweede druk binnen terwijl de wissel van de vorige druk nog loopt, dan wordt die genegeerd; er gaat geen dubbele DDC-opdracht uit.

## Sneltoetsen (G-toetsen)

Een knop kan ook van buiten Stream Deck wisselen, bijvoorbeeld met G1/G2 op het toetsenbord. Geef de knop in zijn instellingen een **Sneltoetsnaam** (bijv. `hp` of `samsung`; hoofdletters en spaties eromheen tellen niet). Elk programma dat deze deeplink opent, voert dan dezelfde Wissel uit als een druk op die knop, inclusief Geheugenstand en knopbeeld:

```
streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/<sneltoetsnaam>?streamdeck=hidden
```

- `?streamdeck=hidden` houdt het Stream Deck-venster op de achtergrond (Stream Deck 7.0 of hoger); zonder die toevoeging springt het venster naar voren.
- Alleen knoppen op de pagina die de Stream Deck nu toont, reageren. Geen knop met die naam: niets gebeurt en het log meldt `sneltoets zonder knop: <naam>`.
- Proberen vanuit een opdrachtprompt: `start streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp` (wisselt het scherm echt; gebruik een niet-bestaande naam voor een droge proef).
- G1/G2 koppelen: zie [sneltoetsen/README.md](sneltoetsen/README.md). Zonder extra software: een G HUB-macro "Toepassing starten" met `C:\Windows\System32\rundll32.exe` en argument `url.dll,FileProtocolHandler <deeplink>` (geen venster). Alternatief: AutoHotkey 2.0 met `sneltoetsen/monitor-wissel.ahk` (G HUB zet G1/G2 op F21/F22).

## Ontwikkelen

- `npm test` – eenheidstests (vitest).
- `npm run typecheck` – TypeScript controleren (`tsc --noEmit`); zit ook vóór `restart` en `pack`.
- `npm run restart` – bouwen en de plugin in Stream Deck herstarten.
- `npm run validate` – manifest en map controleren.
- `npm run pack` – `.streamDeckPlugin`-bestand maken.
- Logs: `nl.sander.monitor-wissel.sdPlugin/logs/`. Het DDC-script los draaien: `powershell -ExecutionPolicy Bypass -File nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1 list`.

## Bekende eigenschappen van Sanders schermen

- HP E273q (serie 6CM81602H4): thuis 17, werk 15; meldt over de pc-kabel altijd 17, ook terwijl hij de laptop toont, en is alleen tijdens het omschakelen circa 4 s onleesbaar. Meten helpt hier dus niet: deze knop staat op Geheugenstand. Springt bij ontbrekend signaal zelf terug. Wissel je dit scherm via de knopjes op het scherm zelf, dan loopt het geheugen achter: de eerstvolgende druk stuurt de verkeerde kant op en de tweede druk zet het weer recht.
- Samsung Odyssey G5: thuis 15, werk 5; altijd leesbaar; blijft op een lege ingang staan.
- Een scherm wordt herkend aan zijn Windows-apparaatpad, en dat hangt aan de poort. Verhuist de kabel naar een andere aansluiting van de pc, dan vindt de knop "zijn" scherm niet meer: hij toont WERK en waarschuwt bij een druk (in het log staat dan "scherm niet gevonden"). Kies het scherm dan opnieuw in de knopinstellingen.
