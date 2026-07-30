/** Shown once per version when lastSeenVersion differs. */
export const WHATS_NEW: Record<string, string[]> = {
  '0.6.0': [
    'First-run checklist, Help tour, and hotkey cheat sheet',
    'AlecaFrame-style relic popup as a horizontal under-card strip',
    'Layout presets scale to your primary monitor',
    'Nightwave challenges + fixed Arbitration empty state',
  ],
  '0.7.0': [
    'warframe.market platinum on relic rewards + best-pick highlight',
    'Play profiles, quiet mode, and What’s new after updates',
    'Invasions, Archon Hunt, and Deep Archimedea modules',
    'Baro wishlist, Steel Path fissure filter, Nightwave done marks',
    'Smarter relic auto-detect (Warframe focused) + dismiss hotkey',
  ],
  '0.8.0': [
    'Riven Grader popup: OCR current vs reroll, tier grades, keep/take tip',
    'Hotkeys Alt+Shift+G (scan) and Alt+Shift+H (dismiss)',
    'EE.log best-effort auto-detect for Kuva Cycle screens',
    'Layout preview + presets include the riven compare panel',
  ],
  '0.9.0': [
    'Foundry Planner tab: browse recipes with owned / ready / vaulted filters',
    'Recursive crafting trees with leaf material totals vs local inventory',
    'Eight color themes (4 dark, 4 light) for companion and overlay',
    'Visual polish: nav sections, status pills, and clearer empty states',
  ],
  '0.9.1': [
    'Riven Grader overlay defaults beside the Cycle compare cards (slim side panel)',
    'Per-overlay opacity sliders in Settings → Appearance',
    'Foundry defaults to My inventory (owned + ready) for much faster lists',
  ],
  '0.9.2': [
    'Custom theme palette: pick background, text, muted, and accent colors',
    'Start from any preset, then tune — applies to companion and overlay',
  ],
  '0.9.12': [
    'Fissure filters: Normal / Steel Path / Both path mode',
    'Toggle Railjack / Void Storm fissures on or off',
  ],
  '0.9.13': [
    'Riven grader: fix Critical Chance vs Slide Critical mix-ups',
    'Faction damage shows as x1.5 multiplier (not a wrong %)',
    'Wider riven OCR crops + pick which monitor OCR/overlay uses',
    'Relic OCR: read reward names under the cards (not the icon art)',
    'Help → Report a bug opens a prefilled GitHub Issue',
    'Fissure filters: can’t clear all tiers; empty tier lists reset to defaults',
  ],
  '0.9.15': [
    'Riven OCR: read faction multipliers (x1.64 Damage to Infested) more reliably',
    'Relic OCR: ignore garbage unmatched text; clearer multi-monitor Linux hint',
  ],
  '0.9.16': [
    'Riven grader: warframe.market platinum estimates for current vs reroll',
  ],
  '0.9.17': [
    'Riven grader polish: polarity, market links, plat-aware keep/take tips',
    'New Market tab: watchlist platinum quotes + latest scan prices',
    'Sound packs for relic/riven chimes + stronger EE.log auto-detect',
    'Linux screen-capture onboarding wizard for PipeWire OCR',
    'OBS widget server: localhost Browser Source panels for external overlays',
  ],
  '0.9.18': [
    'Relic OCR: WFInfo-style UI theme text isolation (much cleaner on Linux)',
    'Relic prices from local WFInfo DB first — no market round-trip on every scan',
    'Reward crop geometry aligned to WFInfo / wfinfo-ng layout math',
  ],
  '0.9.19': [
    'Relic OCR polish: UI theme override, 3-vs-4 squad detect, better Forma matching',
    'Needed-for-set + vaulted tags on relic reward cards',
    'Today dashboard: Nightwave, Archon, Baro, fissures, invasions at a glance',
    'Session profiles: Relic / Riven / Open world / Baro / Nightwave presets',
    'Scan chimes when relic or riven OCR finishes (on by default)',
  ],
  '0.9.20': [
    'Linux/AppImage: store settings + caches under ~/.local/share (not ~/.config) so API/catalog writes succeed',
    'Auto-migrate existing Linux data from ~/.config on first launch',
  ],
  '0.9.21': [
    'Linux inventory sync: sanitize AppImage/Wine env so Fontconfig no longer breaks the helper HTTPS download',
  ],
  '0.9.22': [
    'Foundry reloads automatically after inventory sync (and ignores stale Wine inventory.json)',
    'Recipe catalog retries after a failed first fetch so Foundry can populate post-sync',
  ],
  '0.9.23': [
    'Relic Planner: rank owned relics by missing parts and platinum',
    'Foundry: relic drop sources on missing parts',
    'Mastery Helper: next craftable / owned-unmastered gear',
    'Copy trade chat lines from relic and riven scans',
    'Baro wishlist affordability using synced ducats and credits',
  ],
  '0.9.24': [
    'Overlay option: only show while Warframe is focused (hides over other apps)',
    'Companion UI modernization: quieter chrome, Relic Planner hero, Today brief',
  ],
  '0.9.25': [
    'Help + tray: uninstall the app, open data folder, or delete local settings',
    'Windows Setup uninstaller can remove app data when you choose',
  ],
  '0.9.26': [
    'Linux: fix freeze when screen-share opened twice (PipeWire portal deadlock)',
    'Linux: only prompt for capture after Authorize / after setup is acknowledged',
  ],
  '0.9.27': [
    'Fix Linux quit crash: restore missing disposePersistentCapture import',
  ],
  '0.9.28': [
    'Hotkey Alt+Shift+W: hide / restore all worldstate overlay panels',
    'Optional per-panel toggle hotkeys under Settings → Hotkeys',
  ],
  '0.9.29': [
    'Foundry & Mastery: warframe/weapon/part thumbnails from warframestat art',
    'Foundry & Relic Planner: parts checklist with owned vs missing',
    'Show which owned relics drop missing set parts (plus other/vaulted sources)',
  ],
  '0.9.30': [
    'Inventory: count stacked prime parts correctly (Blueprint ↔ Component paths)',
    'Arbitration: show current node and upcoming hours in the rotation',
  ],
  '0.9.31': [
    'Foundry: dedicated All / Prime / Non-Prime filter under search',
  ],
  '0.9.32': [
    'Relic Planner: All / Prime / Non-Prime filter for relics and set search',
  ],
  '0.9.33': [
    'Linux: inventory no longer treats Everything Warframe AppImage as the game running',
    'Warframe Running / Not running status refreshes while Inventory settings are open',
  ],
  '0.9.34': [
    'Relics: fix inventory ownership — reward counts no longer use relic Projection IDs',
    'Item catalog: map short warframestat part names to full relic reward names',
  ],
  '0.9.35': [
    'Relic overlay: recover after item-catalog fetch failures (no more sticky red error)',
    'Fall back to on-disk item catalog when warframestat is briefly unreachable',
  ],
  '0.9.36': [
    'Settings: press-to-record hotkey inputs (no more typing accelerators by hand)',
    'Relics: fix false owned counts from crafted warframes / doubled relic stacks',
    'Relics: companion primes (Carrier, Shade, Helios, Kavasa, …) back in the catalog',
  ],
  '0.9.37': [
    'Foundry: uncrafted part blueprints no longer count as built components (Ready / craft trees)',
  ],
  '0.9.38': [
    'Layout: edit Relic and Riven OCR scan areas on the mock monitor (drag / resize)',
    'In-game layout unlock also shows OCR crop guides so you can align them over Warframe',
    'Custom OCR regions scale as screen fractions across resolutions',
  ],
  '0.9.39': [
    'Fix overlay vanishing while rearranging panels (Warframe-focus gate no longer hides during Ctrl+Tab edit)',
    'Layout unlock always starts locked on launch; OCR pause no longer leaves the overlay stuck hidden',
  ],
  '0.9.40': [
    'Performance: faster riven OCR (fewer passes unless a weak read), lighter Warframe-focus polling, snappier catalog matches',
    'Performance: countdown clock only re-renders timer panels; worldstate expiry checks on demand; less settings IPC chatter',
    'Companion: scroll inside module panels + polished theme scrollbars',
  ],
  '0.9.41': [
    'Riven OCR: fix glitchy reads from stats-band merge; deep-OCR only weak cards',
    'Relic OCR: much faster — parallel slots, primary band first, show results before live market lookup',
    'Foundry / Relic Planner: scroll list and detail panes instead of the whole page',
  ],
  '0.9.42': [
    'Market: link warframe.market with a browser JWT cookie (no password stored)',
    'Market: view and cancel your buy/sell orders from the companion',
    'Help: Chrome/Firefox steps for the JWT cookie, linked from the Market tab',
  ],
}

export function getWhatsNewBullets(version: string): string[] {
  return WHATS_NEW[version] || [
    `Updated to ${version}`,
    'Bug fixes and quality-of-life improvements',
  ]
}
