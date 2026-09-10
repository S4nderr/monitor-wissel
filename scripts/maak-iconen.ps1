Add-Type -AssemblyName System.Drawing
$root = Join-Path $PSScriptRoot "..\nl.sander.monitor-wissel.sdPlugin\imgs"
function Teken($pad, $maat, $liggend) {
  $dir = Split-Path $pad; if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $bmp = New-Object System.Drawing.Bitmap $maat, $maat
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), ([Math]::Max(2, $maat / 16))
  $b = $maat * 0.18
  if ($liggend) { $g.DrawRectangle($pen, $b, $maat * 0.28, $maat - 2 * $b, $maat * 0.44) }
  else          { $g.DrawRectangle($pen, $maat * 0.28, $b, $maat * 0.44, $maat - 2 * $b) }
  $bmp.Save($pad, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}
Teken "$root\plugin\marketplace.png"      256 $true
Teken "$root\plugin\marketplace@2x.png"   512 $true
Teken "$root\plugin\category-icon.png"     28 $true
Teken "$root\plugin\category-icon@2x.png"  56 $true
Teken "$root\actions\wissel-ingang\icon.png"     20 $false
Teken "$root\actions\wissel-ingang\icon@2x.png"  40 $false
Teken "$root\actions\wissel-ingang\key.png"      72 $false
Teken "$root\actions\wissel-ingang\key@2x.png"  144 $false
"iconen geschreven naar $root"
