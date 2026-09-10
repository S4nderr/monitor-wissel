---
status: accepted
datum: 2026-09-10
---
# Geheugenstand voor schermen die hun ingang niet melden

Op 10 september 2026 is gemeten dat de HP E273q over de HDMI-kabel van de thuis-pc altijd "17" (HDMI 1) meldt, ook terwijl hij aantoonbaar een halve minuut de werklaptop op DisplayPort toonde; alleen tijdens het omschakelen is hij circa vier seconden onleesbaar. De meting is voor dit scherm dus geen bruikbare waarheid, en de wisselregel uit ADR-0002 stuurt dan eindeloos naar de werkingang. We voegen per knop een keuze toe: **Geheugenstand**. Staat die aan, dan onthoudt de knop de laatst succesvol gestuurde ingang (bewaard in de knopinstellingen, dus ook na een herstart), wisselt op basis van dat geheugen en meet niet meer. Zonder geheugen geldt ADR-0002 onverkort: onbekend telt als werk en de eerste druk gaat naar de thuisingang. Gekozen boven automatische detectie, omdat "meting blijft 17 na een zetopdracht" niet te onderscheiden is van "scherm negeerde de opdracht".

## Consequences

- Wisselt Sander een Geheugenstand-scherm met de knopjes op het scherm zelf, dan loopt het geheugen achter; de eerstvolgende druk stuurt dan de verkeerde kant op en de tweede druk herstelt het.
- De Samsung Odyssey G5 meldt zijn ingang wél correct en blijft op meting werken; het vinkje staat daar uit.
