# Monitor-wissel: ontwerp

Bevestigd in de ontwerpsessie van 10 september 2026. Begrippen staan in [CONTEXT.md](../CONTEXT.md); de grote besluiten in [docs/adr](adr/).

## Doel

Een eigen Stream Deck-plugin met één actie, **Wissel ingang**. Elke knop hoort bij één Scherm en wisselt dat Scherm tussen de Thuisingang (Thuis-pc) en de Werkingang (Werklaptop), op basis van waar het Scherm nu op staat. De knop toont de Stand (PC of WERK).

## Gemeten feiten (niet opnieuw meten)

| Scherm | Oriëntatie | Thuisingang | Werkingang | Gedrag |
|---|---|---|---|---|
| HP E273q, serie 6CM81602H4 | staand | 17 (HDMI 1) | 15 (DisplayPort) | Meldt over de HDMI-kabel van de thuis-pc altijd 17, ook terwijl hij aantoonbaar de laptop op DisplayPort toont; alleen tijdens het omschakelen is hij circa 4 seconden onleesbaar. Zetopdrachten komen wél aan. Meten is voor dit scherm dus geen waarheid: hij gebruikt de Geheugenstand (ADR-0003). Springt bij ontbrekend signaal vanzelf terug. Meldt ingangen 1, 15, 17, 19. |
| Samsung Odyssey G5 (model "FALCON") | liggend | 15 (DisplayPort) | 5 (HDMI 1) | Eigen codes: 5 = HDMI 1, 6 = HDMI 2, 15 = DisplayPort; negeert de standaardcodes 17 en 18. Altijd leesbaar. Blijft op een ingang zonder signaal staan. Meldt zelf ingangen 1, 3, 4, 15, 16, 17, 18, dus de werkende codes 5 en 6 staan níét in zijn eigen lijst. |

Beide schermen blijven voor Windows aanwezig terwijl ze de laptop tonen. DDC/CI via de Windows-laag `dxva2.dll` (P/Invoke vanuit PowerShell 5.1) werkt op deze pc voor lezen en zetten; `Add-Type` met C# is bewezen.

## Wisselregel

1. Gebruik de laatste meting als die jonger is dan 5 seconden; meet anders opnieuw. Staat de Geheugenstand voor deze knop aan (ADR-0003), dan wordt er niet gemeten en niet gepolld: de Stand is dan wat de knop het laatst succesvol gestuurd heeft, en zonder geheugen is dat ONBEKEND.
2. Stand = PC als de meting gelijk is aan de Thuisingang; WERK als gelijk aan de Werkingang **of als de meting mislukt** (ADR-0002); anders ONBEKEND.
3. Bij een druk: Stand PC → zet Werkingang; elke andere Stand → zet Thuisingang.
4. Meet 2 seconden na een druk opnieuw, zodat de knop bijtrekt (niet bij Geheugenstand).
5. Zolang minstens één knop zichtbaar is: elke 5 seconden één gebundelde meting voor alle zichtbare knoppen samen.

## Instellingen per knop (Property Inspector)

- **Scherm**: keuzelijst van gevonden schermen, getoond als `HP E273q (…02H4)` — de naam plus de laatste vier tekens van het serienummer, puur als label. Intern wordt een Scherm herkend aan zijn Windows-apparaatpad: fabrikantcode plus bus-instantie, bijvoorbeeld `HPN3475#5&10cc6012&0&UID4356`. Dat pad hangt aan de poort waarop de kabel zit; het serienummer speelt in de herkenning geen rol.
- **Thuisingang** en **Werkingang**: keuzelijst met de codes die het Scherm zelf meldt (decimaal met MCCS-naam, bijvoorbeeld `17 – HDMI 1`), plus per ingang een vrij veld "code handmatig" dat de keuzelijst overstemt (nodig voor de Samsung-codes 5 en 6).
- **Oriëntatie**: staand of liggend; bepaalt het icoon.
- **Geheugenstand**: vinkje voor een Scherm dat zijn Ingang niet betrouwbaar meldt (ADR-0003). Aan: de knop meet niet, maar onthoudt de laatst succesvol gestuurde kant in zijn eigen instellingen (dus ook na een herstart) en wisselt op dat geheugen. Uit: gedrag volgens de meting, zoals hierboven.
- **Sneltoets (toets)**: keuzelijst Geen of F13 t/m F24; de toets die de plugin zelf bewaakt (ADR-0004). Zie hieronder.
- **Sneltoetsnaam**: vrij tekstveld (bijv. `hp`) waarmee een extern programma de knop via een deeplink aanspreekt; zie hieronder. Beide sneltoetsvelden horen niet bij de configuratie die meten en tekenen bepaalt, dus wijzigen laat de knop niet opnieuw meten.

## Sneltoetsen

### Route 1: de toets (aanbevolen, ADR-0004)

G HUB laat een G-toets een functietoets sturen (G1 → F21, G2 → F22; tab Toetsen). In de knopinstellingen kies je bij **Sneltoets (toets)** dezelfde toets. De plugin houdt bij welke zichtbare knop welke toets heeft (toets → context van de knop) en start daarvoor één onzichtbaar PowerShell-proces, `ps/sneltoets-luisteraar.ps1`, met als argumenten de eigen pid en paren `F21=<context>`. Het script bevraagt die toetsen elke 25 ms met `GetAsyncKeyState` (gemeten: `RegisterHotKey` zag de toets van G HUB niet), meldt bij het starten `klaar` en zet bij elke druk de context als regel op stdout. De plugin voert voor die knop precies dezelfde Wissel uit als een knopdruk, inclusief Geheugenstand, dubbeldruk-bescherming en knopbeeld.

- **Ontdenderen**: G HUB herhaalt een vastgehouden G-toets als los/in, ongeveer zes keer per seconde. Elke nieuwe indruk schuift een venster van 400 ms op; pas na 400 ms stilte telt een druk weer. Vasthouden is dus één Wissel.
- **Levensduur**: zonder toetsen draait er geen proces. Veranderen de toetsen (knop verschijnt, verdwijnt of krijgt een andere toets), dan stopt het oude proces en start er een nieuw. Het script stopt zelf binnen 2 seconden nadat de plugin weg is (het kijkt naar de ouder-pid); stopt de plugin netjes, dan doodt hij het kind zelf. Stopt het script onverwacht, dan staat dat in het log en start het bij de volgende wijziging opnieuw.
- **Conflict**: hebben twee zichtbare knoppen dezelfde toets, dan reageert alleen de knop die het eerst verscheen; het log meldt dat één keer.
- De toets wordt niet geclaimd: andere programma's zien F21 ook. F13 t/m F24 zitten op gewone toetsenborden niet, dus er wordt nooit een echte toets afgevangen.

### Route 2: de deeplink (voor andere programma's)

Een extern programma (bijvoorbeeld AutoHotkey) opent de Stream Deck-deeplink `streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/<sneltoetsnaam>?streamdeck=hidden`. Stream Deck geeft het pad `/wissel/<naam>` door aan de plugin (`onDidReceiveDeepLink`); daar hoeft niets voor in het manifest. De plugin zoekt onder de zichtbare knoppen van deze actie die met dezelfde Sneltoetsnaam (vergeleken zonder hoofdletters en spaties eromheen) en voert voor elk precies dezelfde Wissel uit als een knopdruk, inclusief Geheugenstand, dubbeldruk-bescherming en knopbeeld. Alleen knoppen op de pagina die de Stream Deck nu toont, reageren: de instellingen van andere knoppen kent de plugin niet. Geen treffer of een onherkenbaar pad levert alleen een logregel op. `?streamdeck=hidden` (passieve deeplink, Stream Deck 7.0+) voorkomt dat het Stream Deck-venster naar voren komt.

## Weergave op de knop

De plugin tekent het icoon zelf als SVG: een staand of liggend schermpje met label PC, WERK of ? en een bijpassende kleur. Bij een mislukte zetopdracht toont de knop de standaard Stream Deck-waarschuwing en schrijft de plugin een logregel. Elke Wissel wordt gelogd (welk Scherm, gemeten of onthouden stand, gestuurde code, resultaat).

## Techniek

- Stream Deck 7.1 of hoger, SDK `@elgato/streamdeck` 2.x, plugin-UUID `nl.sander.monitor-wissel`, actie-UUID `nl.sander.monitor-wissel.wissel-ingang`.
- TypeScript, gebundeld naar `bin/plugin.js`; Stream Deck levert de Node 24-runtime.
- DDC/CI via een gebundeld PowerShell-script `ps/ddc.ps1` in de pluginmap, onzichtbaar gestart (ADR-0001), met JSON-uitvoer. De Sneltoets-luisteraar `ps/sneltoets-luisteraar.ps1` is het enige blijvende hulpproces, en alleen zolang een zichtbare knop een toets heeft (ADR-0004).
- Eén PowerShell-aanroep tegelijk via een prioriteitswachtrij: een knopdruk (lezen en zetten) gaat vóór polls en schermlijsten, en de schermlijst wordt 60 seconden onthouden zodat de Property Inspector niet drie keer `list` afwacht.
- Eenheidstests met vitest voor alle logica zonder Stream Deck of schermen; de rest wordt tegen de echte schermen geverifieerd.
- Git-repo in `C:\Users\Sander\projects\monitor-wissel`, openbaar op GitHub als `S4nderr/monitor-wissel`.
- Tijdens ontwikkeling lokaal gekoppeld met de Elgato-CLI; aan het eind verpakt tot een `.streamDeckPlugin`-bestand.

## Buiten scope

Vensters terugzetten na een wissel; een vaste-ingang-actie; Marketplace-publicatie; een blijvend draaiend meetproces (pas als de 5-secondenmeting merkbaar wordt). De vier oude ControlMyMonitor-knoppen (HOME/WORK) worden door Sander uit het profiel verwijderd zodra de nieuwe knoppen werken; ControlMyMonitor zelf blijft staan als handmatig gereedschap.
