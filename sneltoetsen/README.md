# Sneltoetsen (G-toetsen)

De toetsen G1 en G2 op het toetsenbord kunnen dezelfde Wissel uitvoeren als een druk op de Stream Deck-knop van de HP en de Samsung, inclusief het geheugen van de Geheugenstand en het bijwerken van het knopbeeld. De knop moet op de pagina staan die de Stream Deck op dat moment toont; een knop op een andere pagina of in een ander profiel reageert niet.

**Variant A** heeft geen extra software nodig en is de aanbevolen route. **Variant B** (deeplink, bijvoorbeeld met AutoHotkey) is er voor andere programma's.

## Variant A: Sneltoets (toets), alleen G HUB

G HUB: tab Toetsen, sleep F21 op G1 en F22 op G2; in de knopinstellingen Sneltoets (toets) F21 resp. F22 kiezen; klaar.

Stap voor stap:

1. Open Logitech G HUB, kies het toetsenbord en ga naar **Toewijzingen** (Assignments), tab **Toetsen** (Keys).
2. Sleep **F21** op **G1** en **F22** op **G2**. G HUB-toewijzingen horen bij een profiel: zet ze in het profiel dat je normaal gebruikt.
3. Open in Stream Deck de instellingen van de HP-knop en kies bij **Sneltoets (toets)** `F21`; bij de Samsung-knop `F22`.

Testen: druk op G1; de HP wisselt en de Stream Deck-knop kleurt mee. In het pluginlog (`nl.sander.monitor-wissel.sdPlugin/logs/`) staat na het instellen `sneltoets-luisteraar gestart (toetsen: F21, F22)` en na een druk `sneltoets F21: knop <id> gewisseld`.

Hoe het werkt (ADR-0004): de plugin start zelf een onzichtbaar PowerShell-proces (`ps/sneltoets-luisteraar.ps1`) dat de ingestelde toetsen F13 t/m F24 bewaakt. Een G-toets vasthouden geeft één Wissel (G HUB herhaalt de toets, de luisteraar ontdendert 400 ms). Heeft geen enkele zichtbare knop een toets, dan draait er ook geen luisteraar. Geef twee knoppen niet dezelfde toets: dan reageert alleen de eerste en meldt het log een conflict.

Laat AutoHotkey (variant B) niet tegelijk op dezelfde F-toets luisteren: dan wisselt het scherm twee keer.

## Variant B: deeplink, bijvoorbeeld met AutoHotkey 2.0

Elk programma kan een knop laten wisselen door een Stream Deck-deeplink te openen. Geef de knop daarvoor in zijn instellingen een **Sneltoetsnaam**: `hp` voor de HP-knop, `samsung` voor de Samsung-knop (hoofdletters en spaties eromheen maken niet uit).

| Knop | Deeplink |
|---|---|
| HP | `streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp?streamdeck=hidden` |
| Samsung | `streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/samsung?streamdeck=hidden` |

`?streamdeck=hidden` zorgt dat het Stream Deck-venster niet naar voren springt.

Een G HUB-macro "Toepassing starten" die deze deeplink opent (via rundll32 of wscript) werkt niet betrouwbaar; gebruik voor G-toetsen dus variant A.

### Met AutoHotkey 2.0

`monitor-wissel.ahk` koppelt F21 en F22 aan de deeplinks van `hp` en `samsung`. G HUB moet G1/G2 dan op F21/F22 zetten, net als bij variant A, maar de knoppen krijgen dan géén Sneltoets (toets).

AutoHotkey 2.0 staat in `C:\Program Files\AutoHotkey\v2\`. Dubbelklik op `monitor-wissel.ahk`; er verschijnt een groen H-icoon in het systeemvak. Opnieuw dubbelklikken vervangt de lopende versie (`#SingleInstance Force`). Stoppen: rechtsklik op het H-icoon en kies **Exit**.

Automatisch starten bij aanmelden:

1. Druk op Win+R, typ `shell:startup` en druk op Enter.
2. Rechtsklik in die map, kies **Nieuw > Snelkoppeling** en wijs naar `C:\Users\Sander\projects\monitor-wissel\sneltoetsen\monitor-wissel.ahk`.

Verplaats je de repo, pas dan de snelkoppeling aan.

### Testen zonder toetsenbord

Een deeplink kun je ook in een opdrachtprompt openen:

```
start streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp?streamdeck=hidden
```

Let op: dit wisselt het scherm echt. Een onschuldige proef is een naam die niet bestaat, bijvoorbeeld `.../wissel/bestaatniet`; in het pluginlog verschijnt dan `sneltoets zonder knop: bestaatniet`.
