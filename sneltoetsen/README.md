# Sneltoetsen (G-toetsen)

De toetsen G1 en G2 op het toetsenbord kunnen dezelfde Wissel uitvoeren als een druk op de Stream Deck-knop van de HP en de Samsung. De toets opent een Stream Deck-deeplink; de plugin zoekt de knop met die **Sneltoetsnaam** en wisselt hem, inclusief het geheugen van de Geheugenstand en het bijwerken van het knopbeeld.

| Toets | Deeplink |
|---|---|
| G1 | `streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp?streamdeck=hidden` |
| G2 | `streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/samsung?streamdeck=hidden` |

`?streamdeck=hidden` zorgt dat het Stream Deck-venster niet naar voren springt.

Er zijn twee manieren om de toets aan de deeplink te koppelen. **Variant A** heeft geen extra software nodig en is de aanbevolen route; **variant B** is de oude opzet met AutoHotkey.

## Stap 1 (altijd): knoppen een Sneltoetsnaam geven

Open in Stream Deck de instellingen van de HP-knop en vul bij **Sneltoetsnaam** `hp` in; bij de Samsung-knop `samsung`. Hoofdletters en spaties eromheen maken niet uit. De knop moet op de pagina staan die de Stream Deck op dat moment toont; een knop op een andere pagina of in een ander profiel reageert niet.

## Variant A: alleen G HUB (geen AutoHotkey)

G HUB kan met een macro een programma starten met een argument. We laten hem `wscript.exe` starten met één van de twee kleine scriptbestanden in deze map (`wissel-hp.js`, `wissel-samsung.js`); dat script opent de deeplink zonder venster.

Waarom een los bestand: G HUB geeft meerdere argumenten niet betrouwbaar door (getest op 23 september 2026: met `rundll32.exe url.dll,FileProtocolHandler <url>` startte G HUB rundll32 wel, maar de deeplink kwam nooit aan; met één argument zonder spaties werkt het). `explorer.exe <url>` werkt ook niet.

1. Open Logitech G HUB, kies het toetsenbord en ga naar **Toewijzingen** (Assignments).
2. Kies **Macro's** en klik op **Macro maken**. Naam: `Monitor-wissel HP`. Kies het type **Geen herhaling**.
3. Klik op **Start nu**, kies **Toepassing starten** (Launch Application) en dan **Nieuwe toepassing** / bewerken. Vul in:
   - Naam: `wscript`
   - Bestandspad: `C:\Windows\System32\wscript.exe`
   - Argumenten: `C:\Users\Sander\projects\monitor-wissel\sneltoetsen\wissel-hp.js` (één argument, geen spaties)
4. Sla de macro op en sleep hem op **G1**.
5. Herhaal voor `Monitor-wissel Samsung` met het argument `C:\Users\Sander\projects\monitor-wissel\sneltoetsen\wissel-samsung.js`, en sleep die op **G2**.
6. Let op: G HUB-toewijzingen horen bij een profiel. Zet ze in het standaardprofiel (of het profiel dat je normaal gebruikt).

Testen: druk op G1; de HP wisselt en de Stream Deck-knop kleurt mee. Er verschijnt geen venster. Verplaats je de repo, pas dan het pad in de macro's aan.

Achtergrond: het script roept `WScript.Shell.Run` aan met de deeplink; Windows geeft die aan de geregistreerde handler (Stream Deck), zoals bij dubbelklikken op een internetsnelkoppeling. Hetzelfde kun je vanuit een opdrachtprompt doen met `rundll32 url.dll,FileProtocolHandler <url>` of `start <url>`.

## Variant B: AutoHotkey 2.0

### B1. G HUB controleren

1. Open Logitech G HUB en kies het toetsenbord.
2. Ga naar **Toewijzingen** (Assignments) en klik op G1.
3. Controleer dat G1 de toets **F21** stuurt en G2 de toets **F22** (onder "Toetsenbord"). Staat er iets anders, sleep dan F21 en F22 er opnieuw op.
4. Let op: G HUB-toewijzingen horen bij een profiel.

### B2. Het script starten

AutoHotkey 2.0 staat in `C:\Program Files\AutoHotkey\v2\`. Dubbelklik op `monitor-wissel.ahk`; er verschijnt een groen H-icoon in het systeemvak. Opnieuw dubbelklikken vervangt de lopende versie (`#SingleInstance Force`). Stoppen: rechtsklik op het H-icoon en kies **Exit**.

### B3. Automatisch starten bij aanmelden

1. Druk op Win+R, typ `shell:startup` en druk op Enter.
2. Rechtsklik in die map, kies **Nieuw > Snelkoppeling** en wijs naar `C:\Users\Sander\projects\monitor-wissel\sneltoetsen\monitor-wissel.ahk`.

Het script start dan bij elke aanmelding. Verplaats je de repo, pas dan de snelkoppeling aan.

## Testen zonder toetsenbord

Een deeplink kun je ook in een opdrachtprompt openen:

```
start streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp?streamdeck=hidden
```

Of precies zoals variant A het doet:

```
rundll32 url.dll,FileProtocolHandler streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp?streamdeck=hidden
```

Let op: dit wisselt het scherm echt. Een onschuldige proef is een naam die niet bestaat, bijvoorbeeld `.../wissel/bestaatniet`; in het pluginlog (`nl.sander.monitor-wissel.sdPlugin/logs/`) verschijnt dan `sneltoets zonder knop: bestaatniet`.
