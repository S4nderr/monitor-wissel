// Opent de Stream Deck-deeplink voor de knop met Sneltoetsnaam "hp", zonder venster.
// Starten met: C:\Windows\System32\wscript.exe C:\Users\Sander\projects\monitor-wissel\sneltoetsen\wissel-hp.js
// Bewust een los bestand zonder argumenten: G HUB geeft meerdere argumenten niet betrouwbaar door.
new ActiveXObject("WScript.Shell").Run("streamdeck://plugins/message/nl.sander.monitor-wissel/wissel/hp?streamdeck=hidden", 0, false);
