# DDC/CI-brug voor Monitor-wissel (ADR-0001). Uitvoer altijd JSON op stdout.
param(
  [Parameter(Position = 0)][string]$Commando = "list",
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ErrorActionPreference = "Stop"
# New-Object i.p.v. [System.Text.Encoding]::UTF8: die laatste zet een BOM op de eerste byte
# van stdout in Windows PowerShell 5.1, wat de JSON-parser aan de andere kant breekt.
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Ddc {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct PHYSICAL_MONITOR { public IntPtr hPhysicalMonitor; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string szPhysicalMonitorDescription; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int left, top, right, bottom; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct MONITORINFOEX { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string szDevice; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DISPLAY_DEVICE { public int cb; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString; public int StateFlags; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID; [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey; }
  public delegate bool MonitorEnumProc(IntPtr hMonitor, IntPtr hdc, IntPtr lprcMonitor, IntPtr dwData);
  [DllImport("user32.dll")] public static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr lprcClip, MonitorEnumProc lpfnEnum, IntPtr dwData);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFOEX lpmi);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern bool EnumDisplayDevices(string lpDevice, uint iDevNum, ref DISPLAY_DEVICE lpDisplayDevice, uint dwFlags);
  [DllImport("dxva2.dll")] public static extern bool GetNumberOfPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, out uint n);
  [DllImport("dxva2.dll")] public static extern bool GetPhysicalMonitorsFromHMONITOR(IntPtr hMonitor, uint n, [Out] PHYSICAL_MONITOR[] arr);
  [DllImport("dxva2.dll")] public static extern bool GetVCPFeatureAndVCPFeatureReply(IntPtr h, byte code, out uint type, out uint current, out uint max);
  [DllImport("dxva2.dll")] public static extern bool SetVCPFeature(IntPtr h, byte code, uint value);
  [DllImport("dxva2.dll")] public static extern bool GetCapabilitiesStringLength(IntPtr h, out uint len);
  [DllImport("dxva2.dll")] public static extern bool CapabilitiesRequestAndCapabilitiesReply(IntPtr h, StringBuilder sb, uint len);
  [DllImport("dxva2.dll")] public static extern bool DestroyPhysicalMonitor(IntPtr h);
  public static System.Collections.Generic.List<IntPtr> Handles() {
    var list = new System.Collections.Generic.List<IntPtr>();
    EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (hm, hdc, rc, d) => { list.Add(hm); return true; }, IntPtr.Zero);
    return list;
  }
}
"@

function Get-SchermId([IntPtr]$hm) {
  # \\.\DISPLAY3 -> device-interface-pad \\?\DISPLAY#HPN3475#5&10cc6012&0&UID4356#{...} -> "HPN3475#5&10cc6012&0&UID4356"
  $mi = New-Object Ddc+MONITORINFOEX
  $mi.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($mi)
  if (-not [Ddc]::GetMonitorInfo($hm, [ref]$mi)) { return $null }
  $dd = New-Object Ddc+DISPLAY_DEVICE
  $dd.cb = [System.Runtime.InteropServices.Marshal]::SizeOf($dd)
  if (-not [Ddc]::EnumDisplayDevices($mi.szDevice, 0, [ref]$dd, 1)) { return $null }
  if ($dd.DeviceID -match '\\\\\?\\DISPLAY#([^#]+)#([^#]+)#') { return "$($Matches[1])#$($Matches[2])" }
  return $null
}

function Get-EdidInfo() {
  $tabel = @{}
  foreach ($m in (Get-CimInstance -Namespace root/wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue)) {
    # InstanceName: DISPLAY\HPN3475\5&10cc6012&0&UID4356_0
    if ($m.InstanceName -match '^DISPLAY\\([^\\]+)\\(.+?)_\d+$') {
      $id = "$($Matches[1])#$($Matches[2])"
      $naam = ([char[]]($m.UserFriendlyName | Where-Object { $_ -ne 0 })) -join ''
      $serie = ([char[]]($m.SerialNumberID | Where-Object { $_ -ne 0 })) -join ''
      $tabel[$id] = @{ naam = $naam.Trim(); serie = $serie.Trim() }
    }
  }
  return $tabel
}

function Get-Fysiek([IntPtr]$hm) {
  # Let op: een fysiek scherm-handle kan zelf de waarde 0 hebben (het is geen NT-kernelhandle
  # maar een opeenvolgend driverhandle) - $null is hier het "niet gevonden"-sentinel, niet [IntPtr]::Zero.
  $n = 0; [void][Ddc]::GetNumberOfPhysicalMonitorsFromHMONITOR($hm, [ref]$n)
  if ($n -lt 1) { return $null }
  $arr = New-Object Ddc+PHYSICAL_MONITOR[] $n
  if (-not [Ddc]::GetPhysicalMonitorsFromHMONITOR($hm, $n, $arr)) { return $null }
  # Eén HMONITOR kan meerdere fysieke monitoren opleveren (bv. via een KVM/splitter);
  # we gebruiken alleen index 0, dus de overige handles moeten meteen vernietigd worden
  # om een handle-lek te voorkomen.
  for ($i = 1; $i -lt $arr.Length; $i++) { [void][Ddc]::DestroyPhysicalMonitor($arr[$i].hPhysicalMonitor) }
  return $arr[0].hPhysicalMonitor
}

function Lees-Ingang([IntPtr]$h) {
  $t = 0; $c = 0; $m = 0
  if ([Ddc]::GetVCPFeatureAndVCPFeatureReply($h, 0x60, [ref]$t, [ref]$c, [ref]$m)) { return [int]$c }
  return $null
}

function Lees-Ingangen([IntPtr]$h) {
  # Elk return-pad gebruikt de unaire komma (,@(...)) zodat PowerShell het array niet
  # "uitrolt": zonder komma wordt een leeg array op de pipeline-uitvoer $null (intern
  # AutomationNull), en dat serialiseert via ConvertTo-Json tot {} in plaats van [].
  $len = 0
  if (-not [Ddc]::GetCapabilitiesStringLength($h, [ref]$len)) { return ,@() }
  $sb = New-Object System.Text.StringBuilder ([int]$len)
  if (-not [Ddc]::CapabilitiesRequestAndCapabilitiesReply($h, $sb, $len)) { return ,@() }
  if ($sb.ToString() -match '60\(([0-9A-Fa-f ]+)\)') {
    return ,@($Matches[1].Trim() -split '\s+' | ForEach-Object { [Convert]::ToInt32($_, 16) } | Sort-Object -Unique)
  }
  return ,@()
}

function Alle-Schermen() {
  $lijst = @()
  foreach ($hm in [Ddc]::Handles()) {
    $id = Get-SchermId $hm
    if ($id) { $lijst += @{ id = $id; hm = $hm } }
  }
  return $lijst
}

switch ($Commando) {
  "list" {
    $edid = Get-EdidInfo
    $uit = @()
    foreach ($s in Alle-Schermen) {
      $h = Get-Fysiek $s.hm
      $info = $edid[$s.id]
      $uit += [ordered]@{
        id = $s.id
        naam = if ($info) { $info.naam } else { $s.id }
        serie = if ($info) { $info.serie } else { "" }
        huidig = if ($null -ne $h) { Lees-Ingang $h } else { $null }
        ingangen = if ($null -ne $h) { Lees-Ingangen $h } else { ,@() }
      }
      if ($null -ne $h) { [void][Ddc]::DestroyPhysicalMonitor($h) }
    }
    ConvertTo-Json -InputObject @($uit) -Compress -Depth 4
  }
  "get" {
    $uit = [ordered]@{}
    foreach ($id in $Rest) { $uit[$id] = $null }
    foreach ($s in Alle-Schermen) {
      if ($Rest -contains $s.id) {
        $h = Get-Fysiek $s.hm
        if ($null -ne $h) { $uit[$s.id] = Lees-Ingang $h; [void][Ddc]::DestroyPhysicalMonitor($h) }
      }
    }
    ConvertTo-Json -InputObject $uit -Compress
  }
  "set" {
    if ($Rest.Count -lt 2) { ConvertTo-Json @{ ok = $false; fout = "gebruik: set <id> <code>" } -Compress; exit 0 }
    $doelId = $Rest[0]; $codeRuw = $Rest[1]
    if ($codeRuw -notmatch '^\d{1,3}$' -or [int]$codeRuw -gt 255) {
      ConvertTo-Json -InputObject @{ ok = $false; fout = "ongeldige code: $codeRuw" } -Compress
      exit 0
    }
    $code = [int]$codeRuw
    $resultaat = @{ ok = $false; fout = "scherm niet gevonden: $doelId" }
    foreach ($s in Alle-Schermen) {
      if ($s.id -eq $doelId) {
        $h = Get-Fysiek $s.hm
        if ($null -eq $h) { $resultaat = @{ ok = $false; fout = "geen fysiek scherm-handle" }; break }
        $ok = [Ddc]::SetVCPFeature($h, 0x60, [uint32]$code)
        [void][Ddc]::DestroyPhysicalMonitor($h)
        $resultaat = if ($ok) { @{ ok = $true } } else { @{ ok = $false; fout = "SetVCPFeature mislukt" } }
        break
      }
    }
    ConvertTo-Json -InputObject $resultaat -Compress
  }
  default {
    ConvertTo-Json -InputObject @{ ok = $false; fout = "onbekend commando: $Commando" } -Compress
  }
}
