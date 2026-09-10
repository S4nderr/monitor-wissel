---
status: accepted
datum: 2026-09-10
---
# Onleesbaar telt als werk, de thuisingang is het vangnet

De HP E273q antwoordt niet meer op DDC/CI-leesopdrachten zodra hij de werklaptop toont, terwijl zetopdrachten wél aankomen; de Samsung Odyssey G5 blijft altijd leesbaar. We behandelen een leesfout daarom als "scherm staat op de werkingang": de knop toont WERK en een wissel stuurt naar de thuisingang. Algemener: alleen als het scherm aantoonbaar op de thuisingang staat gaat een wissel naar de werkingang; in elke andere toestand (werk, onbekende ingang, leesfout, scherm niet gevonden) gaat hij naar de thuisingang. Zo heeft één knop altijd een voorspelbare uitkomst en brengt hij een scheve toestand terug naar de pc waar de Stream Deck aan hangt.

## Consequences

- Een echt kapotte DDC-verbinding is op de knop niet te onderscheiden van "werk"; het logbestand is dan de plek om te kijken.
- Schermen die bij ontbrekend signaal vanzelf terugspringen (de HP) maskeren een druk op de knop terwijl de laptop uit staat; dat is aanvaard gedrag.
