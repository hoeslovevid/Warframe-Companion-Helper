# Warframe Companion Helper (VoidLens)

Windows companion + transparent overlay for Warframe: worldstate panels, Baro inventory, account inventory sync, and relic reward scanning.

**Downloads:** [GitHub Releases](https://github.com/hoeslovevid/Warframe-Companion-Helper/releases)

## Requirements

- Windows 10/11 (x64)
- Warframe in **Borderless Windowed** (exclusive fullscreen hides the overlay)
- For development: Node.js 20+ recommended (18 may work for `npm start`)

## Download (users)

1. Open [Releases](https://github.com/hoeslovevid/Warframe-Companion-Helper/releases)
2. Download the latest **Setup** `.exe` (installer) or **portable** build
3. Install / run **Warframe Companion Helper**
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

- **Companion** — dashboard, module toggles, settings
- **Overlay** — always-on-top click-through panels

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

If a shortcut is taken, the app tries fallbacks. Change them under **Settings → Hotkeys**.

## Modules

- **World Cycles** — Cetus, Vallis, Cambion, Duviri, Zariman, Albrecht (when available)
- **Fissures** — filterable by tier
- **Baro Ki'Teer** — status + shop inventory
- **Nightwave** — season / phase
- **Relics** — OCR reward overlay with set + owned counts
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
- Warframe `EE.log` — relic reward detection

Unofficial and not affiliated with Digital Extremes.
