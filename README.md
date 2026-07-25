# Everything Warframe

Windows companion + transparent overlay for Warframe: worldstate panels, Baro inventory, account inventory sync, and relic reward scanning.

**Website:** [hoeslovevid.github.io/Warframe-Companion-Helper](https://hoeslovevid.github.io/Warframe-Companion-Helper/)  
**Downloads:** [GitHub Releases](https://github.com/hoeslovevid/Warframe-Companion-Helper/releases)

## Requirements

- Windows 10/11 (x64)
- Warframe in **Borderless Windowed** (exclusive fullscreen hides the overlay)
- For development: Node.js 20+ recommended (18 may work for `npm start`)

## Download (users)

1. Open [Releases](https://github.com/hoeslovevid/Warframe-Companion-Helper/releases)
2. Download the latest **Setup** `.exe` (installer) or **portable** build
3. Install / run **Everything Warframe**
4. Keep Warframe in Borderless Windowed

### Auto-updates

Installed builds check [GitHub Releases](https://github.com/hoeslovevid/Warframe-Companion-Helper/releases) for newer versions.

- Automatic check shortly after launch (and every few hours)
- **Settings → Updates** → Check for updates / Restart & install
- Dev mode (`npm start`) does **not** auto-update

## Development

```bash
npm install
npm start
```

This launches Vite, builds the Electron main/preload bundles, then opens:

- **Companion** — dashboard, module toggles, **Layout** mock preview, settings
- **Overlay** — always-on-top click-through panels

Use the companion **Layout** tab to drag every overlay panel (including Relic Rewards with sample cards) on a mock monitor. Positions save to the live overlay.

In-game (WFHelper-style): press `Ctrl+Tab` to unlock click-through, left- or right-drag panels, then `Ctrl+Tab` again to lock. A teaching chip appears until you move a panel once.

### Build a local installer

```bash
npm run dist
```

Outputs land in `release/` (NSIS setup + portable).

## Default hotkeys

| Action | Shortcut |
| --- | --- |
| Toggle overlay | `Alt+Shift+V` |
| Open companion | `Alt+Shift+C` |
| Refresh worldstate | `Alt+Shift+R` |
| Scan relic rewards | `Alt+Shift+F` |
| Dismiss relic popup | `Alt+Shift+D` |
| Scan riven compare | `Alt+Shift+G` |
| Dismiss riven popup | `Alt+Shift+H` |
| Unlock overlay drag (interaction) | `Ctrl+Tab` |

If a shortcut is taken, the app tries fallbacks. Change them under **Settings → Hotkeys**.

## Performance tips

Everything Warframe runs at below-normal process priority, pauses overlay clocks when the overlay is hidden, and loads OCR only on the first relic scan. For the lightest footprint while playing:

- Minimize or close the **Companion** window (hotkeys still work)
- Disable modules you do not need
- Toggle the overlay off (`Alt+Shift+V`) when you want zero on-screen cost

## Modules

- **World Cycles** — Cetus, Vallis, Cambion, Duviri, Zariman, Albrecht (when available)
- **Fissures** — filterable by tier
- **Baro Ki'Teer** — status + shop inventory
- **Nightwave** — season / phase
- **Relics** — OCR reward overlay with set + owned counts
- **Riven Grader** — PaddleOCR (PP-OCRv4) reads current vs reroll; Tesseract fallback; slim side panel beside Cycle cards
- **Foundry Planner** — inventory-first list (owned + ready), crafting trees, material totals
- **Themes** — 4 dark + 4 light presets, plus a Custom palette with color pickers
- **Per-overlay opacity** — individual opacity sliders under Settings → Appearance
- **Arbitration** — schedule now; run analytics later

## Inventory

In **Settings → Inventory**:

1. **Sync from running game** (permission required) via [warframe-api-helper](https://github.com/Sainan/warframe-api-helper)
2. **Find existing exports** — `inventory.json` / AlecaFrame `lastData.dat`
3. **Browse file…**

Data stays on your PC.

## Relic reward overlay

1. Sync inventory (recommended)
2. Enable **Relic Rewards**
3. Enable Item Labels in Warframe
4. On the reward pick screen, press **Alt+Shift+F** (or wait for EE.log `Got rewards`)

## Riven grader overlay

1. Enable **Riven Grader**
2. On the Kuva Cycle compare screen (current vs new), press **Alt+Shift+G**
3. The overlay grades both rolls and recommends keep / take / similar
4. EE.log may auto-detect; the hotkey is the reliable path. Dismiss with **Alt+Shift+H**

## Foundry planner

1. Sync inventory under **Settings → Inventory**
2. Open the companion **Foundry** tab (companion-only — no overlay panel)
3. Search/filter craftable warframes and weapons
4. Select an item to expand its crafting tree and see missing leaf materials

## Publishing a new release (maintainers)

1. Bump `"version"` in `package.json` (e.g. `0.2.0`)
2. Commit and push to `master`
3. Create and push a tag matching that version:

```bash
git tag v0.2.0
git push origin v0.2.0
```

4. GitHub Actions builds Windows artifacts and publishes a Release
5. Installed apps pick up the update via electron-updater

You can also build/publish locally (needs a GitHub token with `repo` scope):

```bash
npm run release
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Dev companion + overlay |
| `npm run build` | Production renderer + electron bundles |
| `npm run dist` | Build Windows installer + portable (no publish) |
| `npm run release` | Build and publish to GitHub Releases |

## Data sources

- [warframestat.us](https://docs.warframestat.us) — worldstate / item catalog
- [warframe-api-helper](https://github.com/Sainan/warframe-api-helper) — inventory sync
- Warframe `EE.log` — relic reward / riven cycle detection

Unofficial and not affiliated with Digital Extremes.
