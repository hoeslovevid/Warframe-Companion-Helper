# VoidLens

Windows companion + transparent overlay for Warframe. Toggleable worldstate panels now; relic reward OCR and arbitration run summaries next.

## Requirements

- Node.js 18+
- Windows
- Warframe running in **Borderless Windowed** (exclusive fullscreen will hide the overlay)

## Quick start

```bash
npm install
npm start
```

This launches Vite on `http://localhost:5173`, builds the Electron main/preload bundles, then opens:

- **Companion** — dashboard, module toggles, settings
- **Overlay** — always-on-top click-through panels

## Default hotkeys

| Action | Shortcut |
| --- | --- |
| Toggle overlay | `Alt+Shift+V` |
| Open companion | `Alt+Shift+C` |
| Refresh worldstate | `Alt+Shift+R` |
| Scan relic rewards | `Alt+Shift+F` |

If a shortcut is already taken by another app, VoidLens automatically tries fallbacks (and may switch to `F8` / `F9` / `F10`). Change accelerators in **Settings → Hotkeys**.

## Modules (Phase 1)

Toggle in **Modules**:

- **World Cycles** — Cetus, Orb Vallis, Cambion, Duviri, Zariman, Albrecht (when API provides them)
- **Fissures** — filterable by Lith / Meso / Neo / Axi / Requiem
- **Baro Ki'Teer** — arrival / departure status
- **Nightwave** — season / phase
- **Relics** — Phase 2 shell (OCR + prices + missing set parts)
- **Arbitration** — live schedule now; rare-drop run summary in Phase 3

## Overlay tips

1. Enable the modules you want (Cycles / Fissures / Baro).
2. Run Warframe in **Borderless Windowed**.
3. You should see a **VoidLens** pill (top-right) plus glass info panels — not FPS counters.
4. FPS / CPU / GPU graphs come from **Xbox Game Bar**, NVIDIA, or Steam — turn those off separately (`Win+G` → turn off FPS).
5. Use **Edit overlay layout** to drag panels, then lock layout so clicks pass through.
6. Adjust opacity under **Settings → Appearance**.

## Phase 2 / 3 paths

In **Settings**:

- **EE.log path** — auto-detect or browse (`%LOCALAPPDATA%\Warframe\EE.log`)
- **Inventory** — three ways to load your account inventory locally:
  1. **Sync from running game** (permission required) — downloads [warframe-api-helper](https://github.com/Sainan/warframe-api-helper), reads a short-lived session token from `Warframe.x64.exe` (not your password), and saves `inventory.json` under VoidLens app data
  2. **Find existing exports** — auto-detects `inventory.json` / AlecaFrame `lastData.dat` in common folders
  3. **Browse file…** — manual JSON / `.dat` import

Inventory stays on your PC. Sync requires Warframe logged in and an explicit risk acknowledgment.

## Data sources

- [warframestat.us](https://docs.warframestat.us) — worldstate
- Planned: [warframe.market](https://warframe.market), [WFCD/warframe-items](https://github.com/WFCD/warframe-items), EE.log

VoidLens is unofficial and not affiliated with Digital Extremes.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` / `npm run electron:dev` | Dev companion + overlay |
| `npm run build` | Production renderer + electron bundles |
| `npm run build:electron` | Bundle `electron/` with esbuild only |

## Roadmap

1. **Phase 1** — shell, toggles, cycles / fissures / baro / nightwave
2. **Phase 2 (current)** — EE.log / hotkey relic scan, OCR, set + owned counts from inventory
3. **Phase 3** — arbitration end-of-run rare drop summaries + favorited node alerts

### Relic reward overlay

1. Sync inventory in Settings (recommended).
2. Enable **Relic Rewards** module.
3. At the post-mission reward pick screen (Item Labels on in Warframe), press **Alt+Shift+F**, or wait for EE.log auto-detect (`Got rewards`).
4. Overlay shows each reward’s set, part, owned count, and whether you still need it.
