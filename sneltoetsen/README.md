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

G HUB kan met een macro een programma starten met een argument. We laten hem `rundll32.exe` starten, dat de deeplink zonder venster aan Stream Deck doorgeeft. (Getest op 23 september 2026: `rundll32` en `cmd /c start` bereiken de plugin; `explorer.exe` met de URL niet.)

1. Open Logitech G HUB, kies het toetsenbord en ga naar **Toewijzingen** (Assignments).
2. Kies **Macro's** en klik op **Macro maken**. Naam: `Monitor-wissel HP`. Kies het type **Geen herhaling**.
3. Klik op **Start nu**, kies **Toepassing starten** (Launch Application) en dan **Nieuwe toepassing** / bewerken. Vul in:
   - Toepassing: `C:\Windows\System32\rundll32.exe`
   - Argument: `url.dll,FileProtocolHandler streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp?streamdeck=hidden`
4. Sla de macro op en sleep hem op **G1**.
5. Herhaal voor `Monitor-wissel Samsung` met het argument `url.dll,FileProtocolHandler streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/samsung?streamdeck=hidden`, en sleep die op **G2**.
6. Let op: G HUB-toewijzingen horen bij een profiel. Zet ze in het standaardprofiel (of het profiel dat je normaal gebruikt).

Testen: druk op G1; de HP wisselt en de Stream Deck-knop kleurt mee. Er verschijnt geen venster.

Achtergrond: `rundll32 url.dll,FileProtocolHandler <url>` is de ingebouwde Windows-manier om een URL aan de geregistreerde handler (hier Stream Deck) te geven, zoals dubbelklikken op een internetsnelkoppeling.

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
