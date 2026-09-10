---
status: accepted
datum: 2026-09-10
---
# DDC/CI via een gebundeld PowerShell-script

De plugin draait op de Node-runtime van Stream Deck en Node kan zelf geen DDC/CI. We laten de plugin een PowerShell-script uit de eigen pluginmap onzichtbaar starten dat via de Windows-DDC-laag (dxva2) de schermen opsomt, de huidige ingang leest en een ingang zet. Gekozen boven ControlMyMonitor (afhankelijkheid op een losse map, geen capabilities-lijst, geen serienummer) en boven een native Node-module (compilerketen, breekbaar bij Node-updates). Het script leverde in de ontwerpsessie alle metingen, dus het is bewezen op precies deze schermen.

## Consequences

- Elke meting kost een PowerShell-start; daarom meet de plugin alle zichtbare knoppen in één keer per interval. Een blijvend hulpproces is de volgende stap als dat merkbaar wordt.
- Het script wordt gestart met `-ExecutionPolicy Bypass`; een Group Policy die dat verbiedt breekt de plugin.
