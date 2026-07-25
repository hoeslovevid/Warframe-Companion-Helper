import { ModuleId, PanelAnchor } from '../../shared/types'

export type LayoutPresetId = 'left-stack' | 'corners' | 'right-rail'

export const LAYOUT_PRESETS: Record<
  LayoutPresetId,
  { label: string; description: string; anchors: Partial<Record<ModuleId, PanelAnchor>> }
> = {
  'left-stack': {
    label: 'Left stack',
    description: 'All panels stacked on the left',
    anchors: {
      cycles: { x: 24, y: 24 },
      fissures: { x: 24, y: 260 },
      baro: { x: 24, y: 520 },
      nightwave: { x: 24, y: 760 },
      relics: { x: 320, y: 180 },
      arbitration: { x: 320, y: 520 },
    },
  },
  corners: {
    label: 'Corners',
    description: 'Spread panels to screen corners',
    anchors: {
      cycles: { x: 24, y: 24 },
      fissures: { x: 24, y: 720 },
      baro: { x: 1500, y: 24 },
      nightwave: { x: 1500, y: 280 },
      relics: { x: 700, y: 360 },
      arbitration: { x: 1500, y: 720 },
    },
  },
  'right-rail': {
    label: 'Right rail',
    description: 'Timers on the right, relics centered',
    anchors: {
      cycles: { x: 1520, y: 24 },
      fissures: { x: 1520, y: 280 },
      baro: { x: 1520, y: 560 },
      nightwave: { x: 1520, y: 780 },
      relics: { x: 640, y: 220 },
      arbitration: { x: 640, y: 560 },
    },
  },
}
