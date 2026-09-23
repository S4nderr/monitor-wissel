# Sneltoets-luisteraar voor Monitor-wissel (ADR-0004). Bewaakt de toetsen F13 t/m F24 die
# de plugin opgeeft en zet bij elke druk het bijbehorende id als een regel op stdout.
#
# Aanroep: sneltoets-luisteraar.ps1 <pid van de plugin> F21=<id> [F22=<id> ...]
# Uitvoer: een regel "klaar" zodra het luisteren begint, daarna per druk een regel <id>.
# Fouten gaan naar stderr. Het script stopt zelf zodra de plugin (de ouder-pid) weg is.
#
# Waarom polsen met GetAsyncKeyState: gemeten op 23 september 2026 ziet dit de F21 die
# G HUB voor G1 stuurt direct, terwijl RegisterHotKey met een berichtenlus niets zag.
# We claimen de toets dus niet; andere programma's blijven hem ook zien.
#
# Dit bestand moet strikt ASCII blijven (geen enkele byte boven 0x7F): Windows PowerShell 5.1
# leest een .ps1 zonder BOM als ANSI, dus accenten in commentaar of tekst worden dan verminkt.
param(
  [Parameter(Position = 0)][int]$OuderPid = 0,
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Paren
)
$ErrorActionPreference = "Stop"
# Zonder BOM: anders begint de eerste regel ("klaar") aan de plugin-kant met een onzichtbaar teken.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

# Om de hoeveel ms we de toetsen bevragen, hoe lang een toets na een druk stil moet zijn
# voordat een nieuwe druk weer telt, en om de hoeveel ms we kijken of de plugin nog leeft.
$PolsMs = 25
$OntdenderMs = 400
$OuderCheckMs = 2000

function Schrijf-Fout([string]$Bericht) {
  try { [Console]::Error.WriteLine($Bericht); [Console]::Error.Flush() } catch { }
}

function Schrijf-Regel([string]$Tekst) {
  # Lukt schrijven niet meer (de plugin heeft de pijp gesloten), dan heeft luisteren geen zin.
  try { [Console]::Out.WriteLine($Tekst); [Console]::Out.Flush() } catch { exit 0 }
}

try {
  # Virtuele toetscodes: F13 = 0x7C ... F24 = 0x87.
  $vkPerToets = @{}
  for ($n = 13; $n -le 24; $n++) { $vkPerToets["F$n"] = 0x7C + ($n - 13) }

  $idPerVk = @{}
  foreach ($paar in $Paren) {
    $deel = $paar.Split("=", 2)
    $toets = $deel[0].Trim().ToUpperInvariant()
    if ($deel.Count -ne 2 -or $deel[1].Trim() -eq "" -or -not $vkPerToets.ContainsKey($toets)) {
      Schrijf-Fout "ongeldig argument genegeerd: $paar (verwacht F13..F24=<id>)"
      continue
    }
    $idPerVk[[int]$vkPerToets[$toets]] = $deel[1].Trim()
  }
  if ($idPerVk.Count -eq 0) {
    Schrijf-Fout "geen toetsen om te bewaken"
    exit 1
  }

  # De ouder een keer opzoeken en daarna HasExited vragen: zo zien we ook dat hij weg is als
  # Windows zijn pid al aan een ander proces heeft gegeven.
  $ouder = $null
  if ($OuderPid -gt 0) {
    try { $ouder = [System.Diagnostics.Process]::GetProcessById($OuderPid) }
    catch { Schrijf-Fout "ouderproces $OuderPid bestaat niet"; exit 1 }
  }

  Add-Type @"
using System.Runtime.InteropServices;
public static class SneltoetsToetsen {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vk);
}
"@

  $vks = @($idPerVk.Keys)
  $wasIngedrukt = @{}
  $laatsteDruk = @{}
  foreach ($vk in $vks) {
    # Beginstand meten, zodat een toets die bij het starten al ingedrukt is niet als druk telt.
    $wasIngedrukt[$vk] = ([SneltoetsToetsen]::GetAsyncKeyState($vk) -band 0x8000) -ne 0
    $laatsteDruk[$vk] = [DateTime]::MinValue
  }

  Schrijf-Regel "klaar"
  $volgendeOuderCheck = [DateTime]::UtcNow.AddMilliseconds($OuderCheckMs)
  while ($true) {
    $nu = [DateTime]::UtcNow
    foreach ($vk in $vks) {
      $ingedrukt = ([SneltoetsToetsen]::GetAsyncKeyState($vk) -band 0x8000) -ne 0
      if ($ingedrukt -and -not $wasIngedrukt[$vk]) {
        # G HUB herhaalt een vastgehouden G-toets als los/in (~6 per seconde). Elke nieuwe
        # indruk schuift het venster op, dus vasthouden geeft precies een melding; pas na
        # 400 ms stilte telt een druk weer.
        if (($nu - $laatsteDruk[$vk]).TotalMilliseconds -ge $OntdenderMs) {
          Schrijf-Regel $idPerVk[$vk]
        }
        $laatsteDruk[$vk] = $nu
      }
      $wasIngedrukt[$vk] = $ingedrukt
    }
    if ($nu -ge $volgendeOuderCheck) {
      $volgendeOuderCheck = $nu.AddMilliseconds($OuderCheckMs)
      if ($null -ne $ouder) {
        $ouder.Refresh()
        if ($ouder.HasExited) { exit 0 }
      }
    }
    Start-Sleep -Milliseconds $PolsMs
  }
}
catch {
  Schrijf-Fout "sneltoets-luisteraar: $($_.Exception.Message)"
  exit 1
}
