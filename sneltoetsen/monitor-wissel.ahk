#Requires AutoHotkey v2.0
#SingleInstance Force

; Sneltoetsen voor de Stream Deck-plugin Monitor-wissel.
; G1 en G2 staan in Logitech G HUB op F21 en F22 (zelfde opzet als vroeger).
; Elke toets opent een Stream Deck-deeplink; de plugin voert dan de Wissel uit van de
; knop met die Sneltoetsnaam (knopinstelling "Sneltoetsnaam"), mits die knop zichtbaar is.
; ?streamdeck=hidden houdt het Stream Deck-venster op de achtergrond.

F21::Run 'streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp?streamdeck=hidden'
F22::Run 'streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/samsung?streamdeck=hidden'
