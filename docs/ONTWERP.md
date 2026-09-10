# Monitor-wissel: ontwerp

Bevestigd in de ontwerpsessie van 10 september 2026. Begrippen staan in [CONTEXT.md](../CONTEXT.md); de twee grote besluiten in [docs/adr](adr/).

## Doel

Een eigen Stream Deck-plugin met één actie, **Wissel ingang**. Elke knop hoort bij één Scherm en wisselt dat Scherm tussen de Thuisingang (Thuis-pc) en de Werkingang (Werklaptop), op basis van waar het Scherm nu op staat. De knop toont de Stand (PC of WERK).

## Gemeten feiten (niet opnieuw meten)

| Scherm | Oriëntatie | Thuisingang | Werkingang | Gedrag |
|---|---|---|---|---|
| HP E273q, serie 6CM81602H4 | staand | 17 (HDMI 1) | 15 (DisplayPort) | Onleesbaar via DDC zodra hij de laptop toont; zetopdrachten komen wél aan. Springt bij ontbrekend signaal vanzelf terug. Meldt ingangen 1, 15, 17, 19. |
| Samsung Odyssey G5 (model "FALCON") | liggend | 15 (DisplayPort) | 5 (HDMI 1) | Eigen codes: 5 = HDMI 1, 6 = HDMI 2, 15 = DisplayPort; negeert de standaardcodes 17 en 18. Altijd leesbaar. Blijft op een ingang zonder signaal staan. Meldt zelf ingangen 1, 3, 4, 15, 16, 17, 18, dus de werkende codes 5 en 6 staan níét in zijn eigen lijst. |

Beide schermen blijven voor Windows aanwezig terwijl ze de laptop tonen. DDC/CI via de Windows-laag `dxva2.dll` (P/Invoke vanuit PowerShell 5.1) werkt op deze pc voor lezen en zetten; `Add-Type` met C# is bewezen.

## Wisselregel

1. Meet de huidige ingang van het Scherm.
2. Stand = PC als de meting gelijk is aan de Thuisingang; WERK als gelijk aan de Werkingang **of als de meting mislukt** (ADR-0002); anders ONBEKEND.
3. Bij een druk: Stand PC → zet Werkingang; elke andere Stand → zet Thuisingang.
4. Meet 2 seconden na een druk opnieuw, zodat de knop bijtrekt.
5. Zolang minstens één knop zichtbaar is: elke 5 seconden één gebundelde meting voor alle zichtbare knoppen samen.

## Instellingen per knop (Property Inspector)

- **Scherm**: keuzelijst van gevonden schermen, getoond als `HP E273q (…02H7)`; intern herkend op model plus serienummer.
- **Thuisingang** en **Werkingang**: keuzelijst met de codes die het Scherm zelf meldt (decimaal met MCCS-naam, bijvoorbeeld `17 – HDMI 1`), plus per ingang een vrij veld "code handmatig" dat de keuzelijst overstemt (nodig voor de Samsung-codes 5 en 6).
- **Oriëntatie**: staand of liggend; bepaalt het icoon.

## Weergave op de knop

De plugin tekent het icoon zelf als SVG: een staand of liggend schermpje met label PC, WERK of ? en een bijpassende kleur. Bij een mislukte zetopdracht toont de knop de standaard Stream Deck-waarschuwing en schrijft de plugin een logregel. Elke Wissel wordt gelogd (welk Scherm, gemeten stand, gestuurde code, resultaat).

## Techniek

- Stream Deck 7.1 of hoger, SDK `@elgato/streamdeck` 2.x, plugin-UUID `nl.sander.monitor-wissel`, actie-UUID `nl.sander.monitor-wissel.wissel-ingang`.
- TypeScript, gebundeld naar `bin/plugin.js`; Stream Deck levert de Node 24-runtime.
- DDC/CI via een gebundeld PowerShell-script `ps/ddc.ps1` in de pluginmap, onzichtbaar gestart (ADR-0001), met JSON-uitvoer.
- Eenheidstests met vitest voor alle logica zonder Stream Deck of schermen; de rest wordt tegen de echte schermen geverifieerd.
- Git-repo in `C:\Users\Sander\projects\monitor-wissel`, openbaar op GitHub als `S4nderr/monitor-wissel`.
- Tijdens ontwikkeling lokaal gekoppeld met de Elgato-CLI; aan het eind verpakt tot een `.streamDeckPlugin`-bestand.

## Buiten scope

Vensters terugzetten na een wissel; een vaste-ingang-actie; Marketplace-publicatie; een blijvend draaiend meetproces (pas als de 5-secondenmeting merkbaar wordt). De vier oude ControlMyMonitor-knoppen (HOME/WORK) worden door Sander uit het profiel verwijderd zodra de nieuwe knoppen werken; ControlMyMonitor zelf blijft staan als handmatig gereedschap.
