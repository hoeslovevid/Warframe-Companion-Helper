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
}

export function getWhatsNewBullets(version: string): string[] {
  return WHATS_NEW[version] || [
    `Updated to ${version}`,
    'Bug fixes and quality-of-life improvements',
  ]
}
