# Monitor-wissel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een Stream Deck-plugin met één actie "Wissel ingang" die per knop één scherm via DDC/CI wisselt tussen thuis-pc en werklaptop en de huidige stand op de knop toont.

**Architecture:** TypeScript-plugin op de Node 24-runtime van Stream Deck (SDK `@elgato/streamdeck` 2.x). Alle scherm-I/O loopt via één gebundeld PowerShell-script (`ps/ddc.ps1`) dat JSON teruggeeft; de plugin spawnt het onzichtbaar. Domeinlogica (wisselregel, SVG-icoon, poll-bundeling) staat in pure modules zonder Stream Deck-afhankelijkheid en wordt met vitest getest; de actieklasse is een dunne lijm-laag.

**Tech Stack:** TypeScript 5, `@elgato/streamdeck` ^2.1.2, `@elgato/cli` (link/restart/validate/pack), esbuild (bundelen), vitest (tests), PowerShell 5.1 + `dxva2.dll` P/Invoke, sdpi-components v4 (Property Inspector).

**Spec:** `docs/ONTWERP.md` (plus `CONTEXT.md` voor begrippen en `docs/adr/0001`, `docs/adr/0002` voor de twee vaste besluiten). Lees die eerst.

## Global Constraints

- Stream Deck-software 7.1 of hoger; manifest `Software.MinimumVersion: "7.1"`, `Nodejs.Version: "24"`, `SDKVersion: 3`.
- Plugin-UUID `nl.sander.monitor-wissel`; actie-UUID `nl.sander.monitor-wissel.wissel-ingang`; pluginmap `nl.sander.monitor-wissel.sdPlugin`.
- Alleen Windows. Alle paden naar de pluginmap absoluut, afgeleid van `import.meta.dirname` (nooit `process.cwd()`).
- Ingangscodes zijn decimale getallen in instellingen, logs en JSON (17 = HDMI 1, 15 = DisplayPort, 5 = Samsung HDMI 1).
- Leesfout telt als WERK; elke wissel vanuit een stand die niet PC is gaat naar de Thuisingang (ADR-0002). Nooit "slim" maken.
- DDC/CI alleen via `ps/ddc.ps1` (ADR-0001). Geen ControlMyMonitor, geen native module.
- Poll: één gebundelde meting per 5 s voor alle zichtbare knoppen, hermeting 2 s na een druk. Geen meting als er geen knop zichtbaar is.
- Nederlandse namen in code en UI (begrippen uit `CONTEXT.md`: Scherm, Ingang, Thuisingang, Werkingang, Wissel, Stand). Engelse SDK-identifiers blijven Engels.
- Commit na elke taak; commit-berichten in het Nederlands, Conventional-Commits-prefix (`feat:`, `test:`, `chore:`, `docs:`).
- Voer `npm test` en `npm run build` uit vóór elke commit.

---

## Bestandsstructuur

```
monitor-wissel/
├── CONTEXT.md                          (bestaat)
├── docs/ONTWERP.md, docs/adr/          (bestaan)
├── package.json, tsconfig.json, vitest.config.ts, .gitignore
├── scripts/
│   ├── build.mjs                       esbuild-bundel naar de pluginmap + bin/package.json
│   └── maak-iconen.ps1                 genereert alle PNG-iconen (System.Drawing)
├── src/
│   ├── plugin.ts                       registreert de actie en verbindt met Stream Deck
│   ├── domein/
│   │   ├── types.ts                    Instellingen, Stand, Scherm, Meting
│   │   └── wisselregel.ts              bepaalStand(), bepaalDoel(), effectieveCode()
│   ├── weergave/
│   │   └── knop-svg.ts                 knopSvg(stand, orientatie) → SVG-string
│   ├── ddc/
│   │   ├── ddc-brug.ts                 spawnt ddc.ps1: lijstSchermen(), leesIngangen(), zetIngang()
│   │   └── meter.ts                    Meter: bundelt polls voor zichtbare knoppen
│   └── actions/
│       └── wissel-ingang.ts            SingletonAction: events → domein/brug/weergave
├── tests/
│   ├── wisselregel.test.ts
│   ├── knop-svg.test.ts
│   ├── ddc-brug.test.ts                parser met vaste voorbeeld-JSON
│   └── meter.test.ts                   met nep-brug en nep-timers
└── nl.sander.monitor-wissel.sdPlugin/
    ├── manifest.json
    ├── bin/plugin.js, bin/package.json (build-uitvoer, in .gitignore)
    ├── ps/ddc.ps1
    ├── ui/wissel-ingang.html, ui/sdpi-components.js
    ├── imgs/plugin/{marketplace,marketplace@2x,category-icon,category-icon@2x}.png
    └── imgs/actions/wissel-ingang/{icon,icon@2x,key,key@2x}.png
```

---

### Task 1: Projectskelet, manifest, build en koppeling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `scripts/build.mjs`, `scripts/maak-iconen.ps1`, `src/plugin.ts`, `nl.sander.monitor-wissel.sdPlugin/manifest.json`
- Create (gegenereerd): alle PNG's onder `nl.sander.monitor-wissel.sdPlugin/imgs/`

**Interfaces:**
- Produces: `npm run build` (bundelt `src/plugin.ts` → `nl.sander.monitor-wissel.sdPlugin/bin/plugin.js`), `npm test` (vitest), `npm run restart` (herstart de plugin in Stream Deck), `npm run validate`.

- [ ] **Step 1: Controleer de omgeving**

Run:
```bash
node --version && npm --version && git --version
```
Expected: Node `v24.x`, npm 10 of hoger. Controleer ook de Stream Deck-versie:
```bash
powershell -NoProfile -Command "(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'Stream Deck' }).DisplayVersion"
```
Expected: `7.1` of hoger. Is dat niet zo, stop en meld het: de SDK werkt dan niet.

- [ ] **Step 2: Git-repo en .gitignore**

Run in `C:\Users\Sander\projects\monitor-wissel`:
```bash
git init -b main
```
Create `.gitignore`:
```
node_modules/
nl.sander.monitor-wissel.sdPlugin/bin/
nl.sander.monitor-wissel.sdPlugin/logs/
*.streamDeckPlugin
*.log
```

- [ ] **Step 3: package.json en tsconfig**

Create `package.json`:
```json
{
  "name": "monitor-wissel",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "Stream Deck-plugin die per scherm wisselt tussen thuis-pc en werklaptop via DDC/CI",
  "scripts": {
    "build": "node scripts/build.mjs",
    "watch": "node scripts/build.mjs --watch",
    "test": "vitest run",
    "restart": "npm run build && streamdeck restart nl.sander.monitor-wissel",
    "validate": "streamdeck validate nl.sander.monitor-wissel.sdPlugin",
    "pack": "npm run build && streamdeck pack nl.sander.monitor-wissel.sdPlugin --force"
  },
  "dependencies": {
    "@elgato/streamdeck": "^2.1.2"
  },
  "devDependencies": {
    "@elgato/cli": "^1.9.0",
    "@types/node": "^24.0.0",
    "esbuild": "^0.25.0",
    "typescript": "^5.6.0",
    "vitest": "^3.0.0"
  }
}
```

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "experimentalDecorators": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "scripts"]
}
```

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
```

Run:
```bash
npm install
```
Expected: installatie zonder fouten; `node_modules/@elgato/streamdeck/package.json` bevat versie 2.x.

- [ ] **Step 4: Lees de SDK-typen voordat je de actie schrijft**

Run:
```bash
grep -n "export declare class SingletonAction\|onWillAppear\|onWillDisappear\|onKeyDown\|onDidReceiveSettings\|onSendToPlugin\|sendToPropertyInspector\|setImage\|showAlert\|registerAction\|connect()" node_modules/@elgato/streamdeck/dist/index.d.ts | head -40
```
Noteer de exacte namen. De rest van dit plan gaat uit van: `SingletonAction<T>`, events `onWillAppear`, `onWillDisappear`, `onKeyDown`, `onDidReceiveSettings`, `onSendToPlugin`; `ev.action.setImage(dataUrl)`, `ev.action.setTitle(text)`, `ev.action.showAlert()`, `ev.action.getSettings()`; `streamDeck.ui.current?.sendToPropertyInspector(payload)`; `streamDeck.actions.registerAction(...)`; `streamDeck.connect()`; `streamDeck.logger`. Wijkt een naam af, gebruik dan de naam uit de d.ts en pas de code in Task 7 en 8 daarop aan.

- [ ] **Step 5: Build-script met esbuild**

Create `scripts/build.mjs`:
```js
import { build, context } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";

const uit = "nl.sander.monitor-wissel.sdPlugin/bin";
mkdirSync(uit, { recursive: true });
writeFileSync(`${uit}/package.json`, JSON.stringify({ type: "module" }));

const opties = {
  entryPoints: ["src/plugin.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  outfile: `${uit}/plugin.js`,
  external: ["bufferutil", "utf-8-validate"],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  sourcemap: false,
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await context(opties);
  await ctx.watch();
} else {
  await build(opties);
}
```

- [ ] **Step 6: Minimale plugin.ts**

Create `src/plugin.ts`:
```ts
import streamDeck, { LogLevel } from "@elgato/streamdeck";

streamDeck.logger.setLevel(LogLevel.INFO);
streamDeck.logger.info("Monitor-wissel start");
streamDeck.connect();
```

Run:
```bash
npm run build
```
Expected: `nl.sander.monitor-wissel.sdPlugin/bin/plugin.js` bestaat en is groter dan 50 kB (SDK gebundeld).

- [ ] **Step 7: Iconen genereren**

Create `scripts/maak-iconen.ps1`:
```powershell
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
```

Run:
```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/maak-iconen.ps1
```
Expected: 8 PNG-bestanden onder `nl.sander.monitor-wissel.sdPlugin/imgs/`.

- [ ] **Step 8: Manifest**

Create `nl.sander.monitor-wissel.sdPlugin/manifest.json`:
```json
{
  "Name": "Monitor-wissel",
  "Version": "0.1.0.0",
  "Author": "Sander",
  "Description": "Wisselt per scherm tussen thuis-pc en werklaptop via DDC/CI en toont de stand op de knop.",
  "Category": "Monitor-wissel",
  "CategoryIcon": "imgs/plugin/category-icon",
  "Icon": "imgs/plugin/marketplace",
  "CodePath": "bin/plugin.js",
  "SDKVersion": 3,
  "Software": { "MinimumVersion": "7.1" },
  "OS": [{ "Platform": "windows", "MinimumVersion": "10" }],
  "Nodejs": { "Version": "24", "Debug": "enabled" },
  "UUID": "nl.sander.monitor-wissel",
  "Actions": [
    {
      "Name": "Wissel ingang",
      "UUID": "nl.sander.monitor-wissel.wissel-ingang",
      "Icon": "imgs/actions/wissel-ingang/icon",
      "Tooltip": "Wisselt één scherm tussen thuisingang en werkingang op basis van de huidige stand.",
      "PropertyInspectorPath": "ui/wissel-ingang.html",
      "Controllers": ["Keypad"],
      "UserTitleEnabled": false,
      "States": [{ "Image": "imgs/actions/wissel-ingang/key" }]
    }
  ]
}
```

- [ ] **Step 9: Valideren en koppelen**

Run:
```bash
npx streamdeck validate nl.sander.monitor-wissel.sdPlugin
```
Expected: geen fouten (waarschuwingen over ontbrekende `ui/wissel-ingang.html` zijn nu nog toegestaan; maak anders een leeg bestand `ui/wissel-ingang.html` met `<!doctype html><html><body></body></html>`).

Run:
```bash
npx streamdeck dev
npx streamdeck link nl.sander.monitor-wissel.sdPlugin
npx streamdeck restart nl.sander.monitor-wissel
```
Expected: in de Stream Deck-app verschijnt de categorie "Monitor-wissel" met de actie "Wissel ingang". Controleer het pluginlog:
```bash
ls nl.sander.monitor-wissel.sdPlugin/logs/ && tail -n 5 nl.sander.monitor-wissel.sdPlugin/logs/*.log
```
Expected: een regel `Monitor-wissel start`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: projectskelet, manifest, build en koppeling met Stream Deck"
```

---

### Task 2: Wisselregel (puur domein, TDD)

**Files:**
- Create: `src/domein/types.ts`, `src/domein/wisselregel.ts`
- Test: `tests/wisselregel.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Stand = "pc" | "werk" | "onbekend";
  export type Orientatie = "staand" | "liggend";
  export interface Instellingen { schermId?: string; thuisingang?: string; werkingang?: string; thuisingangHandmatig?: string; werkingangHandmatig?: string; orientatie?: Orientatie; }
  export interface Scherm { id: string; naam: string; serie: string; huidig: number | null; ingangen: number[]; }
  export type Meting = number | null;   // null = leesfout of niet gevonden
  export function effectieveCode(keuze: string | undefined, handmatig: string | undefined): number | undefined;
  export function bepaalStand(meting: Meting, thuis: number, werk: number): Stand;
  export function bepaalDoel(stand: Stand, thuis: number, werk: number): number;
  ```

- [ ] **Step 1: Schrijf de falende tests**

Create `tests/wisselregel.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { bepaalStand, bepaalDoel, effectieveCode } from "../src/domein/wisselregel.js";

describe("bepaalStand", () => {
  it("meting gelijk aan thuisingang is pc", () => expect(bepaalStand(17, 17, 15)).toBe("pc"));
  it("meting gelijk aan werkingang is werk", () => expect(bepaalStand(15, 17, 15)).toBe("werk"));
  it("leesfout telt als werk (ADR-0002)", () => expect(bepaalStand(null, 17, 15)).toBe("werk"));
  it("andere ingang is onbekend", () => expect(bepaalStand(1, 17, 15)).toBe("onbekend"));
});

describe("bepaalDoel", () => {
  it("vanuit pc naar werkingang", () => expect(bepaalDoel("pc", 17, 15)).toBe(15));
  it("vanuit werk naar thuisingang", () => expect(bepaalDoel("werk", 17, 15)).toBe(17));
  it("vanuit onbekend naar thuisingang", () => expect(bepaalDoel("onbekend", 17, 15)).toBe(17));
});

describe("effectieveCode", () => {
  it("handmatige code wint van de keuzelijst", () => expect(effectieveCode("15", "5")).toBe(5));
  it("lege handmatige code valt terug op de keuzelijst", () => expect(effectieveCode("15", "")).toBe(15));
  it("niets ingevuld geeft undefined", () => expect(effectieveCode(undefined, undefined)).toBeUndefined());
  it("onzin is undefined", () => expect(effectieveCode("abc", " ")).toBeUndefined());
});
```

- [ ] **Step 2: Draai de tests, verwacht falen**

Run: `npm test`
Expected: FAIL, module `../src/domein/wisselregel.js` niet gevonden.

- [ ] **Step 3: Implementeer**

Create `src/domein/types.ts`:
```ts
export type Stand = "pc" | "werk" | "onbekend";
export type Orientatie = "staand" | "liggend";

export interface Instellingen {
  schermId?: string;
  thuisingang?: string;
  werkingang?: string;
  thuisingangHandmatig?: string;
  werkingangHandmatig?: string;
  orientatie?: Orientatie;
}

export interface Scherm {
  id: string;
  naam: string;
  serie: string;
  huidig: number | null;
  ingangen: number[];
}

/** null = leesfout of scherm niet gevonden */
export type Meting = number | null;
```

Create `src/domein/wisselregel.ts`:
```ts
import type { Meting, Stand } from "./types.js";

/** Handmatige code overstemt de keuzelijst; alleen gehele getallen 0-255 tellen. */
export function effectieveCode(keuze: string | undefined, handmatig: string | undefined): number | undefined {
  for (const kandidaat of [handmatig, keuze]) {
    const tekst = kandidaat?.trim();
    if (!tekst) continue;
    if (!/^\d{1,3}$/.test(tekst)) return undefined;
    const n = Number(tekst);
    return n <= 255 ? n : undefined;
  }
  return undefined;
}

/** ADR-0002: een leesfout telt als werk. */
export function bepaalStand(meting: Meting, thuis: number, werk: number): Stand {
  if (meting === null) return "werk";
  if (meting === thuis) return "pc";
  if (meting === werk) return "werk";
  return "onbekend";
}

/** ADR-0002: alleen vanuit pc naar werk; alles anders gaat naar de thuisingang. */
export function bepaalDoel(stand: Stand, thuis: number, werk: number): number {
  return stand === "pc" ? werk : thuis;
}
```

- [ ] **Step 4: Draai de tests, verwacht slagen**

Run: `npm test`
Expected: 11 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domein tests/wisselregel.test.ts
git commit -m "feat: wisselregel en instellingentypen"
```

---

### Task 3: Knop-icoon als SVG (TDD)

**Files:**
- Create: `src/weergave/knop-svg.ts`
- Test: `tests/knop-svg.test.ts`

**Interfaces:**
- Consumes: `Stand`, `Orientatie` uit `src/domein/types.ts`.
- Produces: `export function knopSvg(stand: Stand, orientatie: Orientatie): string` (volledige SVG-tekst, 144×144) en `export function knopDataUrl(stand: Stand, orientatie: Orientatie): string` (`data:image/svg+xml,...`).

- [ ] **Step 1: Schrijf de falende tests**

Create `tests/knop-svg.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { knopSvg, knopDataUrl } from "../src/weergave/knop-svg.js";

describe("knopSvg", () => {
  it("staand tekent een hoge rechthoek", () => {
    const svg = knopSvg("pc", "staand");
    expect(svg).toContain('width="56" height="96"');
  });
  it("liggend tekent een brede rechthoek", () => {
    const svg = knopSvg("pc", "liggend");
    expect(svg).toContain('width="96" height="56"');
  });
  it("label en kleur per stand", () => {
    expect(knopSvg("pc", "staand")).toContain(">PC<");
    expect(knopSvg("pc", "staand")).toContain("#2e7d32");
    expect(knopSvg("werk", "staand")).toContain(">WERK<");
    expect(knopSvg("werk", "staand")).toContain("#1565c0");
    expect(knopSvg("onbekend", "staand")).toContain(">?<");
    expect(knopSvg("onbekend", "staand")).toContain("#616161");
  });
  it("data-url is url-gecodeerd", () => {
    const url = knopDataUrl("pc", "liggend");
    expect(url.startsWith("data:image/svg+xml,")).toBe(true);
    expect(url).not.toContain("<");
  });
});
```

- [ ] **Step 2: Draai de tests, verwacht falen**

Run: `npm test`
Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer**

Create `src/weergave/knop-svg.ts`:
```ts
import type { Orientatie, Stand } from "../domein/types.js";

const KLEUR: Record<Stand, string> = { pc: "#2e7d32", werk: "#1565c0", onbekend: "#616161" };
const LABEL: Record<Stand, string> = { pc: "PC", werk: "WERK", onbekend: "?" };

/** 144×144 SVG: staand of liggend schermpje in de kleur van de stand, label in het midden. */
export function knopSvg(stand: Stand, orientatie: Orientatie): string {
  const breed = orientatie === "liggend" ? 96 : 56;
  const hoog = orientatie === "liggend" ? 56 : 96;
  const x = (144 - breed) / 2;
  const y = (144 - hoog) / 2;
  const tekstgrootte = stand === "werk" ? 22 : 30;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 144 144" width="144" height="144">` +
    `<rect width="144" height="144" rx="16" fill="#000"/>` +
    `<rect x="${x}" y="${y}" width="${breed}" height="${hoog}" rx="6" fill="${KLEUR[stand]}" stroke="#fff" stroke-width="4"/>` +
    `<text x="72" y="72" text-anchor="middle" dominant-baseline="central" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${tekstgrootte}" fill="#fff">${LABEL[stand]}</text>` +
    `</svg>`
  );
}

export function knopDataUrl(stand: Stand, orientatie: Orientatie): string {
  return `data:image/svg+xml,${encodeURIComponent(knopSvg(stand, orientatie))}`;
}
```

- [ ] **Step 4: Draai de tests, verwacht slagen**

Run: `npm test`
Expected: alle tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/weergave tests/knop-svg.test.ts
git commit -m "feat: knop-icoon als svg per stand en oriëntatie"
```

---

### Task 4: PowerShell-script ddc.ps1 (list / get / set)

**Files:**
- Create: `nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1`

**Interfaces:**
- Produces een commandoregel-script, altijd met JSON op stdout, exitcode 0 (ook bij een functionele fout; de fout staat in de JSON):
  - `ddc.ps1 list` → `[{"id":"HPN3475#5&10cc6012&0&UID4356","naam":"HP E273q","serie":"6CM81602H7","huidig":17,"ingangen":[1,15,17,19]}, ...]`
  - `ddc.ps1 get <id> [<id> ...]` → `{"<id>":17,"<id2>":null}` (null = leesfout of niet gevonden)
  - `ddc.ps1 set <id> <code>` → `{"ok":true}` of `{"ok":false,"fout":"..."}`
- `id` = het deel `FABRIKANT#instantie` uit het device-interface-pad van Windows; stabiel zolang de kabel in dezelfde poort blijft. `serie` komt uit de EDID via WMI (`WmiMonitorID.SerialNumberID`).

- [ ] **Step 1: Schrijf het script**

Create `nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1`:
```powershell
# DDC/CI-brug voor Monitor-wissel (ADR-0001). Uitvoer altijd JSON op stdout.
param(
  [Parameter(Position = 0)][ValidateSet("list", "get", "set")][string]$Commando = "list",
  [Parameter(Position = 1, ValueFromRemainingArguments = $true)][string[]]$Rest
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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
  $n = 0; [void][Ddc]::GetNumberOfPhysicalMonitorsFromHMONITOR($hm, [ref]$n)
  if ($n -lt 1) { return [IntPtr]::Zero }
  $arr = New-Object Ddc+PHYSICAL_MONITOR[] $n
  [void][Ddc]::GetPhysicalMonitorsFromHMONITOR($hm, $n, $arr)
  return $arr[0].hPhysicalMonitor
}

function Lees-Ingang([IntPtr]$h) {
  $t = 0; $c = 0; $m = 0
  if ([Ddc]::GetVCPFeatureAndVCPFeatureReply($h, 0x60, [ref]$t, [ref]$c, [ref]$m)) { return [int]$c }
  return $null
}

function Lees-Ingangen([IntPtr]$h) {
  $len = 0
  if (-not [Ddc]::GetCapabilitiesStringLength($h, [ref]$len)) { return @() }
  $sb = New-Object System.Text.StringBuilder ([int]$len)
  if (-not [Ddc]::CapabilitiesRequestAndCapabilitiesReply($h, $sb, $len)) { return @() }
  if ($sb.ToString() -match '60\(([0-9A-Fa-f ]+)\)') {
    return @($Matches[1].Trim() -split '\s+' | ForEach-Object { [Convert]::ToInt32($_, 16) } | Sort-Object -Unique)
  }
  return @()
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
        huidig = if ($h -ne [IntPtr]::Zero) { Lees-Ingang $h } else { $null }
        ingangen = if ($h -ne [IntPtr]::Zero) { Lees-Ingangen $h } else { @() }
      }
      if ($h -ne [IntPtr]::Zero) { [void][Ddc]::DestroyPhysicalMonitor($h) }
    }
    ConvertTo-Json -InputObject @($uit) -Compress -Depth 4
  }
  "get" {
    $uit = [ordered]@{}
    foreach ($id in $Rest) { $uit[$id] = $null }
    foreach ($s in Alle-Schermen) {
      if ($Rest -contains $s.id) {
        $h = Get-Fysiek $s.hm
        if ($h -ne [IntPtr]::Zero) { $uit[$s.id] = Lees-Ingang $h; [void][Ddc]::DestroyPhysicalMonitor($h) }
      }
    }
    ConvertTo-Json -InputObject $uit -Compress
  }
  "set" {
    if ($Rest.Count -lt 2) { ConvertTo-Json @{ ok = $false; fout = "gebruik: set <id> <code>" } -Compress; exit 0 }
    $doelId = $Rest[0]; $code = [int]$Rest[1]
    $resultaat = @{ ok = $false; fout = "scherm niet gevonden: $doelId" }
    foreach ($s in Alle-Schermen) {
      if ($s.id -eq $doelId) {
        $h = Get-Fysiek $s.hm
        if ($h -eq [IntPtr]::Zero) { $resultaat = @{ ok = $false; fout = "geen fysiek scherm-handle" }; break }
        $ok = [Ddc]::SetVCPFeature($h, 0x60, [uint32]$code)
        [void][Ddc]::DestroyPhysicalMonitor($h)
        $resultaat = if ($ok) { @{ ok = $true } } else { @{ ok = $false; fout = "SetVCPFeature mislukt" } }
        break
      }
    }
    ConvertTo-Json -InputObject $resultaat -Compress
  }
}
```

- [ ] **Step 2: Test `list` tegen de echte schermen**

Run:
```bash
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1 list
```
Expected: een JSON-array met twee objecten: één met `naam` "HP E273q", `serie` "6CM81602H7", `huidig` 17 en `ingangen` `[1,15,17,19]`; één met `naam` "Odyssey G5" en `ingangen` `[1,3,4,15,16,17,18]`. Noteer beide `id`-waarden; je hebt ze in Step 3 en 4 nodig.

- [ ] **Step 3: Test `get` met beide id's en één onzin-id**

Run (vervang de id's):
```bash
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1 get "HPN3475#5&10cc6012&0&UID4356" "SAM7486#5&10cc6012&0&UID4354" "BESTAAT#NIET"
```
Expected: `{"HPN3475#...":17,"SAM7486#...":<5 of 15>,"BESTAAT#NIET":null}`.

- [ ] **Step 4: Test `set` heen en terug op de Samsung**

De Samsung blijft altijd leesbaar, dus dit is de veilige rondgang. Run (vervang de id):
```bash
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1 set "SAM7486#5&10cc6012&0&UID4354" 5
sleep 5
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1 get "SAM7486#5&10cc6012&0&UID4354"
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1 set "SAM7486#5&10cc6012&0&UID4354" 15
sleep 5
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1 get "SAM7486#5&10cc6012&0&UID4354"
```
Expected: `{"ok":true}`, daarna `5`, daarna `{"ok":true}`, daarna `15`. Test ook een fout: `set "BESTAAT#NIET" 17` → `{"ok":false,"fout":"scherm niet gevonden: BESTAAT#NIET"}`.

- [ ] **Step 5: Meet de duur van één `get`**

Run:
```bash
powershell -NoProfile -Command "Measure-Command { & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1 get 'HPN3475#5&10cc6012&0&UID4356' | Out-Null } | Select-Object -ExpandProperty TotalMilliseconds"
```
Expected: onder 2000 ms. Noteer de waarde in de commit-boodschap; boven 2000 ms wordt de 5-secondenpoll in Task 6 op 10 s gezet.

- [ ] **Step 6: Commit**

```bash
git add nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1
git commit -m "feat: ddc.ps1 brug met list/get/set (get duurt ~N ms)"
```

---

### Task 5: DDC-brug in TypeScript (spawn + parse, TDD op de parser)

**Files:**
- Create: `src/ddc/ddc-brug.ts`
- Test: `tests/ddc-brug.test.ts`

**Interfaces:**
- Consumes: `Scherm`, `Meting` uit `src/domein/types.ts`; `ps/ddc.ps1` uit Task 4.
- Produces:
  ```ts
  export interface DdcBrug {
    lijstSchermen(): Promise<Scherm[]>;
    leesIngangen(ids: string[]): Promise<Map<string, Meting>>;
    zetIngang(id: string, code: number): Promise<{ ok: boolean; fout?: string }>;
  }
  export function parseLijst(json: string): Scherm[];
  export function parseMetingen(json: string, ids: string[]): Map<string, Meting>;
  export function parseZetResultaat(json: string): { ok: boolean; fout?: string };
  export class PowerShellDdcBrug implements DdcBrug { constructor(scriptPad: string, logger: { warn(msg: string): void }); }
  ```

- [ ] **Step 1: Schrijf de falende parser-tests**

Create `tests/ddc-brug.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseLijst, parseMetingen, parseZetResultaat } from "../src/ddc/ddc-brug.js";

const LIJST = '[{"id":"HPN3475#5&10cc6012&0&UID4356","naam":"HP E273q","serie":"6CM81602H7","huidig":17,"ingangen":[1,15,17,19]},{"id":"SAM7486#5&10cc6012&0&UID4354","naam":"Odyssey G5","serie":"","huidig":null,"ingangen":[]}]';

describe("parseLijst", () => {
  it("leest beide schermen", () => {
    const s = parseLijst(LIJST);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({ id: "HPN3475#5&10cc6012&0&UID4356", naam: "HP E273q", serie: "6CM81602H7", huidig: 17, ingangen: [1, 15, 17, 19] });
    expect(s[1].huidig).toBeNull();
  });
  it("lege of kapotte uitvoer geeft een lege lijst", () => {
    expect(parseLijst("")).toEqual([]);
    expect(parseLijst("niet json")).toEqual([]);
  });
});

describe("parseMetingen", () => {
  it("koppelt id aan meting en vult ontbrekende id's met null", () => {
    const m = parseMetingen('{"a":17,"b":null}', ["a", "b", "c"]);
    expect(m.get("a")).toBe(17);
    expect(m.get("b")).toBeNull();
    expect(m.get("c")).toBeNull();
  });
  it("kapotte uitvoer geeft overal null", () => {
    const m = parseMetingen("", ["a"]);
    expect(m.get("a")).toBeNull();
  });
});

describe("parseZetResultaat", () => {
  it("ok", () => expect(parseZetResultaat('{"ok":true}')).toEqual({ ok: true }));
  it("fout met reden", () => expect(parseZetResultaat('{"ok":false,"fout":"x"}')).toEqual({ ok: false, fout: "x" }));
  it("kapotte uitvoer is een fout", () => expect(parseZetResultaat("")).toEqual({ ok: false, fout: "geen geldige uitvoer van ddc.ps1" }));
});
```

- [ ] **Step 2: Draai de tests, verwacht falen**

Run: `npm test`
Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer**

Create `src/ddc/ddc-brug.ts`:
```ts
import { execFile } from "node:child_process";
import type { Meting, Scherm } from "../domein/types.js";

export interface DdcBrug {
  lijstSchermen(): Promise<Scherm[]>;
  leesIngangen(ids: string[]): Promise<Map<string, Meting>>;
  zetIngang(id: string, code: number): Promise<{ ok: boolean; fout?: string }>;
}

function veiligJson(tekst: string): unknown {
  try {
    return tekst.trim() ? JSON.parse(tekst) : undefined;
  } catch {
    return undefined;
  }
}

export function parseLijst(json: string): Scherm[] {
  const data = veiligJson(json);
  if (!Array.isArray(data)) return [];
  return data
    .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null && typeof (r as Record<string, unknown>).id === "string")
    .map((r) => ({
      id: String(r.id),
      naam: typeof r.naam === "string" && r.naam ? r.naam : String(r.id),
      serie: typeof r.serie === "string" ? r.serie : "",
      huidig: typeof r.huidig === "number" ? r.huidig : null,
      ingangen: Array.isArray(r.ingangen) ? r.ingangen.filter((n): n is number => typeof n === "number") : [],
    }));
}

export function parseMetingen(json: string, ids: string[]): Map<string, Meting> {
  const data = veiligJson(json) as Record<string, unknown> | undefined;
  const uit = new Map<string, Meting>();
  for (const id of ids) {
    const w = data && typeof data === "object" ? data[id] : undefined;
    uit.set(id, typeof w === "number" ? w : null);
  }
  return uit;
}

export function parseZetResultaat(json: string): { ok: boolean; fout?: string } {
  const data = veiligJson(json) as Record<string, unknown> | undefined;
  if (!data || typeof data.ok !== "boolean") return { ok: false, fout: "geen geldige uitvoer van ddc.ps1" };
  return data.ok ? { ok: true } : { ok: false, fout: typeof data.fout === "string" ? data.fout : "onbekende fout" };
}

/** Spawnt ps/ddc.ps1 onzichtbaar (ADR-0001). Eén aanroep per commando; nooit twee tegelijk (DDC verdraagt dat slecht). */
export class PowerShellDdcBrug implements DdcBrug {
  private wachtrij: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly scriptPad: string,
    private readonly logger: { warn(msg: string): void },
  ) {}

  private draai(args: string[]): Promise<string> {
    const taak = this.wachtrij.then(
      () =>
        new Promise<string>((resolve) => {
          execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", this.scriptPad, ...args],
            { windowsHide: true, timeout: 15000, maxBuffer: 1024 * 1024 },
            (fout, stdout, stderr) => {
              if (fout) this.logger.warn(`ddc.ps1 ${args[0]}: ${fout.message} ${stderr}`.trim());
              resolve(stdout ?? "");
            },
          );
        }),
    );
    this.wachtrij = taak.catch(() => undefined);
    return taak;
  }

  async lijstSchermen(): Promise<Scherm[]> {
    return parseLijst(await this.draai(["list"]));
  }

  async leesIngangen(ids: string[]): Promise<Map<string, Meting>> {
    if (ids.length === 0) return new Map();
    return parseMetingen(await this.draai(["get", ...ids]), ids);
  }

  async zetIngang(id: string, code: number): Promise<{ ok: boolean; fout?: string }> {
    return parseZetResultaat(await this.draai(["set", id, String(code)]));
  }
}
```

- [ ] **Step 4: Draai de tests, verwacht slagen**

Run: `npm test`
Expected: alle tests PASS.

- [ ] **Step 5: Rooktest van de echte brug**

Create tijdelijk `scripts/rook-brug.mts`:
```ts
import { PowerShellDdcBrug } from "../src/ddc/ddc-brug.js";
const brug = new PowerShellDdcBrug("nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1", console);
const schermen = await brug.lijstSchermen();
console.log(schermen);
console.log(await brug.leesIngangen(schermen.map((s) => s.id)));
```
Run:
```bash
npx tsx scripts/rook-brug.mts || npx --yes tsx scripts/rook-brug.mts
```
Expected: dezelfde twee schermen als in Task 4 en een Map met hun huidige ingang. Verwijder daarna `scripts/rook-brug.mts`.

- [ ] **Step 6: Commit**

```bash
git add src/ddc/ddc-brug.ts tests/ddc-brug.test.ts
git commit -m "feat: ddc-brug die ddc.ps1 spawnt en de json parseert"
```

---

### Task 6: Meter (gebundelde poll voor zichtbare knoppen, TDD)

**Files:**
- Create: `src/ddc/meter.ts`
- Test: `tests/meter.test.ts`

**Interfaces:**
- Consumes: `DdcBrug`, `Meting`.
- Produces:
  ```ts
  export type MetingLuisteraar = (meting: Meting) => void;
  export class Meter {
    constructor(brug: Pick<DdcBrug, "leesIngangen">, intervalMs?: number);   // standaard 5000
    volg(context: string, schermId: string, luisteraar: MetingLuisteraar): void;  // knop zichtbaar / instellingen gewijzigd
    vergeet(context: string): void;                                              // knop onzichtbaar
    meetNu(): Promise<void>;                                                      // één gebundelde meting, direct
    meetStraks(vertragingMs: number): void;                                       // hermeting na een druk
    stop(): void;
  }
  ```

- [ ] **Step 1: Schrijf de falende tests**

Create `tests/meter.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Meter } from "../src/ddc/meter.js";
import type { Meting } from "../src/domein/types.js";

function nepBrug(antwoord: Record<string, Meting>) {
  const leesIngangen = vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, antwoord[id] ?? null])));
  return { leesIngangen };
}

describe("Meter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("meet niets zolang er geen knop gevolgd wordt", async () => {
    const brug = nepBrug({});
    new Meter(brug, 5000);
    await vi.advanceTimersByTimeAsync(20000);
    expect(brug.leesIngangen).not.toHaveBeenCalled();
  });

  it("bundelt twee knoppen op hetzelfde scherm in één meting en meldt beide", async () => {
    const brug = nepBrug({ hp: 17 });
    const meter = new Meter(brug, 5000);
    const a = vi.fn(); const b = vi.fn();
    meter.volg("ctx-a", "hp", a);
    meter.volg("ctx-b", "hp", b);
    await meter.meetNu();
    expect(brug.leesIngangen).toHaveBeenCalledTimes(1);
    expect(brug.leesIngangen).toHaveBeenCalledWith(["hp"]);
    expect(a).toHaveBeenCalledWith(17);
    expect(b).toHaveBeenCalledWith(17);
  });

  it("polt elke interval en stopt als de laatste knop verdwijnt", async () => {
    const brug = nepBrug({ hp: 17 });
    const meter = new Meter(brug, 5000);
    meter.volg("ctx-a", "hp", vi.fn());
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    const n = brug.leesIngangen.mock.calls.length;
    expect(n).toBeGreaterThanOrEqual(2);
    meter.vergeet("ctx-a");
    await vi.advanceTimersByTimeAsync(20000);
    expect(brug.leesIngangen.mock.calls.length).toBe(n);
  });

  it("meetStraks meet één keer na de vertraging", async () => {
    const brug = nepBrug({ sam: 5 });
    const meter = new Meter(brug, 60000);
    const l = vi.fn();
    meter.volg("ctx", "sam", l);
    meter.meetStraks(2000);
    await vi.advanceTimersByTimeAsync(1999);
    expect(l).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(l).toHaveBeenCalledWith(5);
  });

  it("een leesfout komt als null bij de luisteraar", async () => {
    const brug = nepBrug({});
    const meter = new Meter(brug, 5000);
    const l = vi.fn();
    meter.volg("ctx", "weg", l);
    await meter.meetNu();
    expect(l).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Draai de tests, verwacht falen**

Run: `npm test`
Expected: FAIL, module niet gevonden.

- [ ] **Step 3: Implementeer**

Create `src/ddc/meter.ts`:
```ts
import type { DdcBrug } from "./ddc-brug.js";
import type { Meting } from "../domein/types.js";

export type MetingLuisteraar = (meting: Meting) => void;

/** Eén gebundelde meting per interval voor alle zichtbare knoppen; niets als er geen knop zichtbaar is. */
export class Meter {
  private readonly volgers = new Map<string, { schermId: string; luisteraar: MetingLuisteraar }>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private uitgesteld: ReturnType<typeof setTimeout> | undefined;
  private bezig = false;

  constructor(
    private readonly brug: Pick<DdcBrug, "leesIngangen">,
    private readonly intervalMs = 5000,
  ) {}

  volg(context: string, schermId: string, luisteraar: MetingLuisteraar): void {
    this.volgers.set(context, { schermId, luisteraar });
    if (!this.timer) this.timer = setInterval(() => void this.meetNu(), this.intervalMs);
  }

  vergeet(context: string): void {
    this.volgers.delete(context);
    if (this.volgers.size === 0) this.stop();
  }

  meetStraks(vertragingMs: number): void {
    if (this.uitgesteld) clearTimeout(this.uitgesteld);
    this.uitgesteld = setTimeout(() => {
      this.uitgesteld = undefined;
      void this.meetNu();
    }, vertragingMs);
  }

  async meetNu(): Promise<void> {
    if (this.bezig || this.volgers.size === 0) return;
    this.bezig = true;
    try {
      const ids = [...new Set([...this.volgers.values()].map((v) => v.schermId))];
      const metingen = await this.brug.leesIngangen(ids);
      for (const { schermId, luisteraar } of this.volgers.values()) {
        luisteraar(metingen.get(schermId) ?? null);
      }
    } finally {
      this.bezig = false;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.uitgesteld) clearTimeout(this.uitgesteld);
    this.uitgesteld = undefined;
  }
}
```

- [ ] **Step 4: Draai de tests, verwacht slagen**

Run: `npm test`
Expected: alle tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ddc/meter.ts tests/meter.test.ts
git commit -m "feat: meter bundelt polls voor zichtbare knoppen"
```

---

### Task 7: Property Inspector met keuzelijsten uit de plugin

**Files:**
- Create: `nl.sander.monitor-wissel.sdPlugin/ui/wissel-ingang.html`, `nl.sander.monitor-wissel.sdPlugin/ui/sdpi-components.js`
- Create: `src/actions/wissel-ingang.ts` (eerste versie: alleen instellingen en datasources)
- Modify: `src/plugin.ts`

**Interfaces:**
- Consumes: `DdcBrug`, `Instellingen`, `Scherm`.
- Produces: datasource-events `schermen` en `ingangen` (payload `{ event, items: [{ value, label }] }`), en de klasse `WisselIngang extends SingletonAction<Instellingen>` die in Task 8 wordt uitgebreid.

- [ ] **Step 1: Haal sdpi-components lokaal binnen**

Run:
```bash
curl -L -o nl.sander.monitor-wissel.sdPlugin/ui/sdpi-components.js https://sdpi-components.dev/releases/v4/sdpi-components.js
ls -la nl.sander.monitor-wissel.sdPlugin/ui/sdpi-components.js
```
Expected: een bestand van ongeveer 55 kB.

- [ ] **Step 2: Property Inspector-HTML**

Create `nl.sander.monitor-wissel.sdPlugin/ui/wissel-ingang.html`:
```html
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8" />
  <title>Wissel ingang</title>
  <script src="sdpi-components.js"></script>
</head>
<body>
  <sdpi-item label="Scherm">
    <sdpi-select setting="schermId" datasource="schermen" loading="Schermen zoeken..." placeholder="Kies een scherm" hot-reload></sdpi-select>
  </sdpi-item>

  <sdpi-item label="Thuisingang">
    <sdpi-select setting="thuisingang" datasource="ingangen" loading="Ingangen lezen..." placeholder="Ingang van de thuis-pc" hot-reload></sdpi-select>
  </sdpi-item>
  <sdpi-item label="Thuis, code handmatig">
    <sdpi-textfield setting="thuisingangHandmatig" placeholder="leeg = keuzelijst; bijv. 15" pattern="^\d{0,3}$"></sdpi-textfield>
  </sdpi-item>

  <sdpi-item label="Werkingang">
    <sdpi-select setting="werkingang" datasource="ingangen" loading="Ingangen lezen..." placeholder="Ingang van de werklaptop" hot-reload></sdpi-select>
  </sdpi-item>
  <sdpi-item label="Werk, code handmatig">
    <sdpi-textfield setting="werkingangHandmatig" placeholder="leeg = keuzelijst; bijv. 5 (Samsung HDMI 1)" pattern="^\d{0,3}$"></sdpi-textfield>
  </sdpi-item>

  <sdpi-item label="Oriëntatie">
    <sdpi-select setting="orientatie" placeholder="Kies">
      <option value="staand">Staand</option>
      <option value="liggend">Liggend</option>
    </sdpi-select>
  </sdpi-item>

  <sdpi-item label="Uitleg">
    <div style="font-size: 11px; opacity: .8">Staat het scherm op de thuisingang, dan gaat het naar de werkingang; in elk ander geval naar de thuisingang. Een handmatige code overstemt de keuzelijst.</div>
  </sdpi-item>

  <script>
    // Als het scherm wisselt, vraag de ingangenlijst opnieuw op.
    const { streamDeckClient } = SDPIComponents;
    document.querySelector('[setting="schermId"]').addEventListener("valuechange", () => {
      for (const sel of document.querySelectorAll('[datasource="ingangen"]')) sel.refresh?.();
      streamDeckClient.send("sendToPlugin", { event: "ingangen", isRefresh: true });
    });
  </script>
</body>
</html>
```

- [ ] **Step 3: Actieklasse, eerste versie (instellingen + datasources)**

Create `src/actions/wissel-ingang.ts`:
```ts
import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
} from "@elgato/streamdeck";
import type { DdcBrug } from "../ddc/ddc-brug.js";
import type { Instellingen, Scherm } from "../domein/types.js";

const MCCS_NAMEN: Record<number, string> = {
  1: "VGA 1", 2: "VGA 2", 3: "DVI 1", 4: "DVI 2", 5: "HDMI 1 (Samsung)", 6: "HDMI 2 (Samsung)",
  15: "DisplayPort 1", 16: "DisplayPort 2", 17: "HDMI 1", 18: "HDMI 2", 19: "HDMI 3 / USB-C",
};

export function ingangLabel(code: number): string {
  return `${code} – ${MCCS_NAMEN[code] ?? "onbekend"}`;
}

export function schermLabel(s: Scherm): string {
  const staart = s.serie ? ` (…${s.serie.slice(-4)})` : "";
  return `${s.naam}${staart}`;
}

type DatasourceVerzoek = { event: string; isRefresh?: boolean };

@action({ UUID: "nl.sander.monitor-wissel.wissel-ingang" })
export class WisselIngang extends SingletonAction<Instellingen> {
  constructor(private readonly brug: DdcBrug) {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent<Instellingen>): Promise<void> {
    streamDeck.logger.info(`verschijnt: ${ev.action.id} scherm=${ev.payload.settings.schermId ?? "-"}`);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Instellingen>): Promise<void> {
    streamDeck.logger.info(`instellingen: ${ev.action.id} ${JSON.stringify(ev.payload.settings)}`);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<DatasourceVerzoek, Instellingen>): Promise<void> {
    const { event } = ev.payload;
    if (event === "schermen") {
      const schermen = await this.brug.lijstSchermen();
      await streamDeck.ui.current?.sendToPropertyInspector({
        event,
        items: schermen.map((s) => ({ value: s.id, label: schermLabel(s) })),
      });
      return;
    }
    if (event === "ingangen") {
      const instellingen = await ev.action.getSettings();
      const schermen = await this.brug.lijstSchermen();
      const scherm = schermen.find((s) => s.id === instellingen.schermId);
      const codes = scherm?.ingangen ?? [];
      await streamDeck.ui.current?.sendToPropertyInspector({
        event,
        items: codes.map((c) => ({ value: String(c), label: ingangLabel(c) })),
      });
    }
  }
}
```

Modify `src/plugin.ts` naar:
```ts
import streamDeck, { LogLevel } from "@elgato/streamdeck";
import path from "node:path";
import { PowerShellDdcBrug } from "./ddc/ddc-brug.js";
import { WisselIngang } from "./actions/wissel-ingang.js";

streamDeck.logger.setLevel(LogLevel.INFO);

// bin/plugin.js → ../ps/ddc.ps1, altijd absoluut (nooit process.cwd()).
const scriptPad = path.resolve(import.meta.dirname, "..", "ps", "ddc.ps1");
const brug = new PowerShellDdcBrug(scriptPad, streamDeck.logger);

streamDeck.actions.registerAction(new WisselIngang(brug));
streamDeck.logger.info(`Monitor-wissel start, ddc-script: ${scriptPad}`);
streamDeck.connect();
```

- [ ] **Step 4: Bouw en typecheck**

Run:
```bash
npx tsc -p tsconfig.json && npm run build
```
Expected: geen typefouten. Wijken SDK-namen af van Step 4 in Task 1, pas ze hier aan (bijvoorbeeld `ev.action.sendToPropertyInspector` in plaats van `streamDeck.ui.current?.sendToPropertyInspector`).

- [ ] **Step 5: Verifieer in Stream Deck**

Run:
```bash
npm run restart
```
Sleep in de Stream Deck-app de actie "Wissel ingang" op een lege knop en open het instellingenpaneel. Expected: de keuzelijst "Scherm" toont `HP E273q (…02H7)` en `Odyssey G5`. Kies de HP; expected: de lijsten Thuisingang en Werkingang tonen `1 – VGA 1`, `15 – DisplayPort 1`, `17 – HDMI 1`, `19 – HDMI 3 / USB-C`. Controleer het log:
```bash
tail -n 20 nl.sander.monitor-wissel.sdPlugin/logs/*.log
```
Expected: regels `instellingen: ...` met de gekozen waarden. Blijft een lijst leeg: open het PI-debugvenster op http://localhost:23654/ en lees de console.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: property inspector met schermen en ingangen uit de plugin"
```

---

### Task 8: Wissel op knopdruk en stand op de knop

**Files:**
- Modify: `src/actions/wissel-ingang.ts`
- Modify: `src/plugin.ts`

**Interfaces:**
- Consumes: `Meter`, `bepaalStand`, `bepaalDoel`, `effectieveCode`, `knopDataUrl`.
- Produces: werkende knop.

- [ ] **Step 1: Breid de actie uit**

Vervang `src/actions/wissel-ingang.ts` door:
```ts
import streamDeck, {
  action,
  SingletonAction,
  type DidReceiveSettingsEvent,
  type KeyDownEvent,
  type SendToPluginEvent,
  type WillAppearEvent,
  type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { DdcBrug } from "../ddc/ddc-brug.js";
import type { Meter } from "../ddc/meter.js";
import type { Instellingen, Meting, Scherm, Stand } from "../domein/types.js";
import { bepaalDoel, bepaalStand, effectieveCode } from "../domein/wisselregel.js";
import { knopDataUrl } from "../weergave/knop-svg.js";

const MCCS_NAMEN: Record<number, string> = {
  1: "VGA 1", 2: "VGA 2", 3: "DVI 1", 4: "DVI 2", 5: "HDMI 1 (Samsung)", 6: "HDMI 2 (Samsung)",
  15: "DisplayPort 1", 16: "DisplayPort 2", 17: "HDMI 1", 18: "HDMI 2", 19: "HDMI 3 / USB-C",
};

export function ingangLabel(code: number): string {
  return `${code} – ${MCCS_NAMEN[code] ?? "onbekend"}`;
}

export function schermLabel(s: Scherm): string {
  const staart = s.serie ? ` (…${s.serie.slice(-4)})` : "";
  return `${s.naam}${staart}`;
}

/** Volledige, bruikbare configuratie van één knop; undefined zolang er iets ontbreekt. */
export function configuratie(i: Instellingen): { schermId: string; thuis: number; werk: number; orientatie: "staand" | "liggend" } | undefined {
  const thuis = effectieveCode(i.thuisingang, i.thuisingangHandmatig);
  const werk = effectieveCode(i.werkingang, i.werkingangHandmatig);
  if (!i.schermId || thuis === undefined || werk === undefined) return undefined;
  return { schermId: i.schermId, thuis, werk, orientatie: i.orientatie ?? "staand" };
}

type DatasourceVerzoek = { event: string; isRefresh?: boolean };

@action({ UUID: "nl.sander.monitor-wissel.wissel-ingang" })
export class WisselIngang extends SingletonAction<Instellingen> {
  private readonly laatsteStand = new Map<string, Stand>();

  constructor(
    private readonly brug: DdcBrug,
    private readonly meter: Meter,
  ) {
    super();
  }

  override async onWillAppear(ev: WillAppearEvent<Instellingen>): Promise<void> {
    await this.herVolg(ev.action.id, ev.payload.settings, (dataUrl) => ev.action.setImage(dataUrl));
  }

  override async onWillDisappear(ev: WillDisappearEvent<Instellingen>): Promise<void> {
    this.meter.vergeet(ev.action.id);
    this.laatsteStand.delete(ev.action.id);
  }

  override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Instellingen>): Promise<void> {
    await this.herVolg(ev.action.id, ev.payload.settings, (dataUrl) => ev.action.setImage(dataUrl));
  }

  override async onKeyDown(ev: KeyDownEvent<Instellingen>): Promise<void> {
    const cfg = configuratie(ev.payload.settings);
    if (!cfg) {
      streamDeck.logger.warn(`wissel geweigerd: knop ${ev.action.id} is niet volledig ingesteld`);
      await ev.action.showAlert();
      return;
    }
    const meting = (await this.brug.leesIngangen([cfg.schermId])).get(cfg.schermId) ?? null;
    const stand = bepaalStand(meting, cfg.thuis, cfg.werk);
    const doel = bepaalDoel(stand, cfg.thuis, cfg.werk);
    const resultaat = await this.brug.zetIngang(cfg.schermId, doel);
    streamDeck.logger.info(`wissel scherm=${cfg.schermId} meting=${meting ?? "leesfout"} stand=${stand} gestuurd=${doel} ok=${resultaat.ok}${resultaat.fout ? ` fout=${resultaat.fout}` : ""}`);
    if (!resultaat.ok) {
      await ev.action.showAlert();
      return;
    }
    // Optimistisch tonen; de hermeting na 2 s corrigeert als het scherm niet is gewisseld.
    await ev.action.setImage(knopDataUrl(stand === "pc" ? "werk" : "pc", cfg.orientatie));
    this.meter.meetStraks(2000);
  }

  override async onSendToPlugin(ev: SendToPluginEvent<DatasourceVerzoek, Instellingen>): Promise<void> {
    const { event } = ev.payload;
    if (event === "schermen") {
      const schermen = await this.brug.lijstSchermen();
      await streamDeck.ui.current?.sendToPropertyInspector({
        event,
        items: schermen.map((s) => ({ value: s.id, label: schermLabel(s) })),
      });
      return;
    }
    if (event === "ingangen") {
      const instellingen = await ev.action.getSettings();
      const schermen = await this.brug.lijstSchermen();
      const scherm = schermen.find((s) => s.id === instellingen.schermId);
      await streamDeck.ui.current?.sendToPropertyInspector({
        event,
        items: (scherm?.ingangen ?? []).map((c) => ({ value: String(c), label: ingangLabel(c) })),
      });
    }
  }

  /** Registreert de knop bij de meter (of haalt hem eraf als hij onvolledig is) en tekent direct. */
  private async herVolg(context: string, instellingen: Instellingen, teken: (dataUrl: string) => Promise<void>): Promise<void> {
    const cfg = configuratie(instellingen);
    if (!cfg) {
      this.meter.vergeet(context);
      await teken(knopDataUrl("onbekend", instellingen.orientatie ?? "staand"));
      return;
    }
    this.meter.volg(context, cfg.schermId, (meting: Meting) => {
      const stand = bepaalStand(meting, cfg.thuis, cfg.werk);
      if (this.laatsteStand.get(context) === stand) return;
      this.laatsteStand.set(context, stand);
      void teken(knopDataUrl(stand, cfg.orientatie));
    });
    await this.meter.meetNu();
  }
}
```

Modify `src/plugin.ts`: voeg de meter toe.
```ts
import streamDeck, { LogLevel } from "@elgato/streamdeck";
import path from "node:path";
import { PowerShellDdcBrug } from "./ddc/ddc-brug.js";
import { Meter } from "./ddc/meter.js";
import { WisselIngang } from "./actions/wissel-ingang.js";

streamDeck.logger.setLevel(LogLevel.INFO);

const scriptPad = path.resolve(import.meta.dirname, "..", "ps", "ddc.ps1");
const brug = new PowerShellDdcBrug(scriptPad, streamDeck.logger);
const meter = new Meter(brug, 5000);

streamDeck.actions.registerAction(new WisselIngang(brug, meter));
streamDeck.logger.info(`Monitor-wissel start, ddc-script: ${scriptPad}`);
streamDeck.connect();
```

- [ ] **Step 2: Test voor `configuratie`**

Voeg toe aan `tests/wisselregel.test.ts`:
```ts
import { configuratie } from "../src/actions/wissel-ingang.js";

describe("configuratie", () => {
  it("onvolledig is undefined", () => {
    expect(configuratie({})).toBeUndefined();
    expect(configuratie({ schermId: "x", thuisingang: "17" })).toBeUndefined();
  });
  it("volledig met handmatige code", () => {
    expect(configuratie({ schermId: "x", thuisingang: "15", werkingang: "17", werkingangHandmatig: "5", orientatie: "liggend" }))
      .toEqual({ schermId: "x", thuis: 15, werk: 5, orientatie: "liggend" });
  });
  it("oriëntatie is standaard staand", () => {
    expect(configuratie({ schermId: "x", thuisingang: "17", werkingang: "15" })?.orientatie).toBe("staand");
  });
});
```
Let op: dit importeert de actiemodule, die `@elgato/streamdeck` laadt. Faalt de test omdat de SDK bij import een verbinding wil, verplaats `configuratie`, `ingangLabel` en `schermLabel` dan naar `src/domein/knop-configuratie.ts` en importeer ze van daaruit in de actie én de test.

Run: `npm test`
Expected: alle tests PASS.

- [ ] **Step 3: Bouw en herstart**

Run:
```bash
npx tsc -p tsconfig.json && npm run restart
```
Expected: geen typefouten.

- [ ] **Step 4: Verifieer tegen de echte schermen**

1. Knop 1: Scherm HP, Thuisingang `17 – HDMI 1`, Werkingang `15 – DisplayPort 1`, Oriëntatie staand. Expected: binnen 5 s toont de knop een staand groen schermpje met PC.
2. Knop 2: Scherm Odyssey G5, Thuisingang `15 – DisplayPort 1`, Werkingang: keuzelijst leeg laten en handmatig `5`, Oriëntatie liggend. Expected: liggend groen PC.
3. Zorg dat de werklaptop aanstaat. Druk knop 2. Expected: de Samsung toont de laptop, de knop wordt blauw WERK. Druk nogmaals. Expected: terug naar de pc, knop groen PC.
4. Druk knop 1. Expected: de HP toont de laptop; de knop wordt blauw WERK (via de leesfout-regel). Druk nogmaals. Expected: de HP komt terug op de pc, knop groen PC.
5. Zet de Samsung met de knopjes op het scherm handmatig op HDMI 1 en wacht 5 s. Expected: knop 2 wordt vanzelf blauw WERK zonder druk.
6. Controleer het log:
```bash
grep -E "wissel scherm=" nl.sander.monitor-wissel.sdPlugin/logs/*.log | tail -n 6
```
Expected: per druk één regel met meting, stand, gestuurde code en `ok=true`.
7. Verwijder de knop van de Stream Deck en controleer dat de poll stopt:
```bash
tasklist | grep -i powershell
```
Expected: na 10 s geen powershell.exe-processen die uit de plugin komen.

Wijkt iets af: zoek in `logs/` naar `ddc.ps1 ...` waarschuwingen van de brug, en draai het betreffende `ddc.ps1`-commando met de hand (Task 4) om script en plugin uit elkaar te houden.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wissel op knopdruk en stand op de knop"
```

---

### Task 9: README, verpakken, GitHub en opruimen

**Files:**
- Create: `README.md`
- Modify: `CONTEXT.md` alleen als er tijdens het bouwen een begrip is bijgekomen (geen implementatiedetails)

- [ ] **Step 1: README**

Create `README.md`:
```markdown
# Monitor-wissel

Stream Deck-plugin die per knop één scherm wisselt tussen de thuis-pc en de werklaptop via DDC/CI, en de stand (PC of WERK) op de knop toont. Begrippen: [CONTEXT.md](CONTEXT.md). Ontwerp: [docs/ONTWERP.md](docs/ONTWERP.md). Besluiten: [docs/adr](docs/adr).

## Vereisten

- Windows 10/11, Stream Deck-software 7.1 of hoger (levert zelf Node 24 voor de plugin).
- Schermen die DDC/CI ondersteunen (meestal aan te zetten in het schermmenu).
- Om te bouwen: Node 24, `npm install`.

## Gebruik

1. Installeer de plugin (dubbelklik op het `.streamDeckPlugin`-bestand) of koppel de ontwikkelversie: `npx streamdeck link nl.sander.monitor-wissel.sdPlugin`.
2. Sleep "Wissel ingang" op een knop. Kies scherm, thuisingang, werkingang en oriëntatie.
3. Codes zijn decimaal: 17 = HDMI 1, 15 = DisplayPort. Samsung-schermen gebruiken eigen codes (5 = HDMI 1, 6 = HDMI 2); vul die in het veld "code handmatig".

De regel: staat het scherm op de thuisingang, dan naar de werkingang; in elk ander geval (werk, onbekend, niet leesbaar) naar de thuisingang.

## Ontwikkelen

- `npm test` – eenheidstests (vitest).
- `npm run restart` – bouwen en de plugin in Stream Deck herstarten.
- `npm run validate` – manifest en map controleren.
- `npm run pack` – `.streamDeckPlugin`-bestand maken.
- Logs: `nl.sander.monitor-wissel.sdPlugin/logs/`. Het DDC-script los draaien: `powershell -ExecutionPolicy Bypass -File nl.sander.monitor-wissel.sdPlugin/ps/ddc.ps1 list`.

## Bekende eigenschappen van Sanders schermen

- HP E273q: thuis 17, werk 15; onleesbaar zodra hij de laptop toont (de knop toont dan WERK); springt bij ontbrekend signaal zelf terug.
- Samsung Odyssey G5: thuis 15, werk 5; altijd leesbaar; blijft op een lege ingang staan.
```

- [ ] **Step 2: Valideer en verpak**

Run:
```bash
npm run validate && npm run pack
ls -la *.streamDeckPlugin
```
Expected: `nl.sander.monitor-wissel.streamDeckPlugin` in de projectmap.

- [ ] **Step 3: GitHub-repo**

Run:
```bash
git add -A && git commit -m "docs: readme en verpakking"
gh repo create S4nderr/monitor-wissel --public --source . --remote origin --push || echo "gh ontbreekt: maak de repo handmatig op github.com en voer uit: git remote add origin https://github.com/S4nderr/monitor-wissel.git && git push -u origin main"
```
Expected: de repo staat op GitHub met alle commits. (Eerder is vastgesteld dat `gh` op deze pc ontbreekt; de fallback-tekst geldt dan.)

- [ ] **Step 4: Overdracht aan Sander (handmatig, niet door de agent)**

Meld in het eindbericht:
- De vier oude ControlMyMonitor-knoppen (HOME/WORK, twee voor "HP E273q" en twee voor "ZOWIE XL LCD") in de Stream Deck-map kunnen weg; ControlMyMonitor zelf blijft in `C:\beheer` als handmatig gereedschap.
- Het pad van het `.streamDeckPlugin`-bestand voor herinstallatie.
- Waar de logs staan.

---

## Self-review

- **Spec-dekking:** één actie (T7/T8), schermkeuze op model+serie (T4 id + serie, T7 label), keuzelijsten uit capabilities plus handmatig veld (T7, T2 `effectieveCode`), oriëntatie (T3, T7), stand op de knop (T3, T8), leesfout = werk (T2, ADR-0002), thuisingang als vangnet (T2), meting 2 s na druk (T6 `meetStraks`, T8), gebundelde poll per 5 s en stop zonder knoppen (T6), waarschuwing en logregel bij fout (T8 `showAlert` + logger), DDC via gebundeld PowerShell (T4, T5, ADR-0001), absolute paden (`import.meta.dirname` in T7/T8), Stream Deck 7.1 / Node 24 (T1 manifest), git + GitHub openbaar (T1, T9), lokaal koppelen en verpakken (T1, T9).
- **Afwijking van het ontwerp, bewust:** bij een fout toont de knop de ingebouwde Stream Deck-waarschuwing (`showAlert`) in plaats van een los meldvenster; een meldvenster vanuit een plugin is on-idiomatisch en de waarschuwing plus logregel dekt hetzelfde doel.
- **Placeholder-scan:** geen TBD/TODO; elke codestap bevat de code; SDK-naamafwijkingen zijn expliciet afgevangen in T1 Step 4 en T7 Step 4.
- **Typeconsistentie:** `DdcBrug` (T5) wordt door `Meter` (T6, alleen `leesIngangen`) en `WisselIngang` (T7/T8) gebruikt met dezelfde signaturen; `Instellingen`/`Stand`/`Orientatie`/`Meting`/`Scherm` komen uitsluitend uit `src/domein/types.ts`; `knopDataUrl(stand, orientatie)` (T3) wordt in T8 met die volgorde aangeroepen; `configuratie()` in T8 levert `{ schermId, thuis, werk, orientatie }` en de test in T8 Step 2 verwacht precies die vorm.
