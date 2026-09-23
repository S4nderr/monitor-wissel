---
status: accepted
datum: 2026-09-23
---
# Sneltoetsen via een eigen toetsluisteraar in PowerShell

Sander wil de Wissel ook met de G-toetsen van zijn Logitech-toetsenbord doen. Stream Deck kan niet naar toetsen luisteren, en de twee externe routes bleken onbetrouwbaar: een G HUB-macro "Toepassing starten" voerde de opdracht (rundll32, wscript) niet of verminkt uit, en AutoHotkey is een extra programma dat Sander niet wil. Gemeten op 23 september 2026: G HUB stuurt een G-toets wél betrouwbaar als gewone toets (G1 → F21), en een PowerShell-proces dat `GetAsyncKeyState` elke 25 ms bevraagt ziet die toets direct; `RegisterHotKey` met een berichtenlus zag in dezelfde proef niets. We laten de plugin daarom zelf een klein PowerShell-luisteraartje starten (binnen ADR-0001: PowerShell als brug naar Windows) dat de per knop ingestelde toets (F13 t/m F24) bewaakt en de naam van de knop op stdout zet; de plugin voert dan dezelfde Wissel uit als bij een druk op de knop. De deeplink en het AutoHotkey-script blijven bestaan als alternatief voor andere programma's.

## Consequences

- G HUB herhaalt een vastgehouden toets snel; de luisteraar ontdendert (één Wissel per 400 ms per toets).
- Polsen kost verwaarloosbaar CPU, maar het is wel een extra blijvend proces; het stopt zichzelf zodra de plugin verdwijnt.
- F13 t/m F24 zijn gekozen omdat gewone toetsenborden ze niet hebben, zodat de luisteraar nooit een echte toets afvangt; de toets blijft ook voor andere programma's zichtbaar (geen RegisterHotKey-claim).
