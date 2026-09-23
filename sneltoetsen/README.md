# Sneltoetsen (G-toetsen)

Met `monitor-wissel.ahk` voeren de toetsen G1 en G2 op het toetsenbord dezelfde Wissel uit als een druk op de Stream Deck-knop van de HP en de Samsung. Het script opent een Stream Deck-deeplink; de plugin zoekt de knop met die **Sneltoetsnaam** en wisselt hem, inclusief het geheugen van de Geheugenstand en het bijwerken van het knopbeeld.

| Toets | G HUB stuurt | Deeplink |
|---|---|---|
| G1 | F21 | `streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp?streamdeck=hidden` |
| G2 | F22 | `streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/samsung?streamdeck=hidden` |

`?streamdeck=hidden` zorgt dat het Stream Deck-venster niet naar voren springt.

## 1. Knoppen een Sneltoetsnaam geven

Open in Stream Deck de instellingen van de HP-knop en vul bij **Sneltoetsnaam** `hp` in; bij de Samsung-knop `samsung`. Hoofdletters en spaties eromheen maken niet uit. De knop moet op de pagina staan die de Stream Deck op dat moment toont; een knop op een andere pagina of in een ander profiel reageert niet.

## 2. G HUB controleren

1. Open Logitech G HUB en kies het toetsenbord.
2. Ga naar **Toewijzingen** (Engels: Assignments; het plusteken-icoon) en klik op G1.
3. Controleer dat G1 de toets **F21** stuurt en G2 de toets **F22** (onder "Toetsenbord"). Staat er iets anders, sleep dan F21 en F22 er opnieuw op.
4. Let op: G HUB-toewijzingen horen bij een profiel. Controleer dat het standaardprofiel (of het profiel dat je normaal gebruikt) deze toewijzing heeft.

## 3. Het script starten

AutoHotkey 2.0 staat in `C:\Program Files\AutoHotkey\v2\`. Dubbelklik op `monitor-wissel.ahk`; er verschijnt een groen H-icoon in het systeemvak. Opnieuw dubbelklikken vervangt de lopende versie (`#SingleInstance Force`). Stoppen: rechtsklik op het H-icoon en kies **Exit**.

## 4. Automatisch starten bij aanmelden

1. Druk op Win+R, typ `shell:startup` en druk op Enter.
2. Rechtsklik in die map, kies **Nieuw > Snelkoppeling** en wijs naar `C:\Users\Sander\projects\monitor-wissel\sneltoetsen\monitor-wissel.ahk`.

Het script start dan bij elke aanmelding. Verplaats je de repo, pas dan de snelkoppeling aan.

## Testen zonder toetsenbord

Een deeplink kun je ook in een opdrachtprompt openen:

```
start streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp?streamdeck=hidden
```

Let op: dit wisselt het scherm echt. Een onschuldige proef is een naam die niet bestaat, bijvoorbeeld `.../wissel/bestaatniet`; in het pluginlog (`nl.sander.monitor-wissel.sdPlugin/logs/`) verschijnt dan `sneltoets zonder knop: bestaatniet`.
