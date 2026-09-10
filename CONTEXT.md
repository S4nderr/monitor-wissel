# Monitor-wissel

Twee Stream Deck-knoppen, één per scherm, die dat scherm laten wisselen tussen de thuis-pc en de werklaptop op basis van waar het scherm nu op staat.

## Language

**Thuis-pc**:
De altijd-aan privé-pc waar de Stream Deck aan hangt en die de wissel uitvoert.
_Avoid_: pc, computer, host

**Werklaptop**:
De laptop van het werk die op dezelfde twee schermen is aangesloten.
_Avoid_: laptop, werk-pc, gast

**Scherm**:
Eén van de twee monitoren: de HP E273q of de Samsung Odyssey G5. Elk Scherm heeft zijn eigen knop en wisselt los van het andere.
_Avoid_: monitor, display

**Ingang**:
Een fysieke aansluiting van een Scherm waaruit het beeld haalt (HDMI, DisplayPort, VGA, USB-C).
_Avoid_: input, bron, source

**Thuisingang**:
De Ingang van een Scherm waarop de Thuis-pc is aangesloten. Elke Wissel vanaf een onbekende of onleesbare Ingang eindigt hier.
_Avoid_: pc-ingang, standaard, home

**Werkingang**:
De Ingang van een Scherm waarop de Werklaptop is aangesloten.
_Avoid_: DVI, gastingang, andere ingang, work

**Wissel**:
Eén druk op de knop van een Scherm: staat het op de Thuisingang, dan naar de Werkingang; in alle andere gevallen naar de Thuisingang.
_Avoid_: toggle, switch, omschakelen

**Stand**:
Wat de knop van een Scherm toont: PC (Thuisingang gemeten), WERK (Werkingang gemeten, of niet leesbaar) of ONBEKEND (een andere Ingang gemeten, of de knop is nog niet volledig ingesteld).
_Avoid_: status, state

**Geheugenstand**:
Keuze per knop voor een Scherm dat zijn Ingang niet betrouwbaar meldt: de Stand is dan wat de knop het laatst succesvol gestuurd heeft, niet wat gemeten is.
_Avoid_: memory mode, onthouden stand, blind wisselen
