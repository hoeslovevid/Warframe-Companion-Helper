import { ModuleId, PanelAnchor } from '../../shared/types'

export type LayoutPresetId = 'left-stack' | 'corners' | 'right-rail'

/** Default under-card strip position for a 1920×1080 mock / primary display. */
const RELIC_STRIP: PanelAnchor = { x: 410, y: 640 }

export const LAYOUT_PRESETS: Record<
  LayoutPresetId,
  { label: string; description: string; anchors: Partial<Record<ModuleId, PanelAnchor>> }
> = {
  'left-stack': {
    label: 'Left stack',
    description: 'Timers stacked on the left; relic strip under reward cards',
    anchors: {
      cycles: { x: 24, y: 24 },
      fissures: { x: 24, y: 260 },
      baro: { x: 24, y: 520 },
      nightwave: { x: 24, y: 760 },
      relics: { ...RELIC_STRIP },
      arbitration: { x: 320, y: 520 },
    },
  },
  corners: {
    label: 'Corners',
    description: 'Timers in corners; relic strip centered under cards',
    anchors: {
      cycles: { x: 24, y: 24 },
      fissures: { x: 24, y: 720 },
      baro: { x: 1500, y: 24 },
      nightwave: { x: 1500, y: 280 },
      relics: { ...RELIC_STRIP },
      arbitration: { x: 1500, y: 720 },
    },
  },
  'right-rail': {
    label: 'Right rail',
    description: 'Timers on the right; relic strip under reward cards',
    anchors: {
      cycles: { x: 1520, y: 24 },
      fissures: { x: 1520, y: 280 },
      baro: { x: 1520, y: 560 },
      nightwave: { x: 1520, y: 780 },
      relics: { ...RELIC_STRIP },
      arbitration: { x: 640, y: 420 },
    },
  },
}
