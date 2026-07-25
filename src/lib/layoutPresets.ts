import { DEFAULT_SETTINGS, ModuleId, PanelAnchor } from '../../shared/types'

export type LayoutPresetId = 'left-stack' | 'corners' | 'right-rail'

export const LAYOUT_DESIGN = { width: 1920, height: 1080 } as const

const RELIC_STRIP: PanelAnchor = { x: 410, y: 640 }
const RIVEN_COMPARE: PanelAnchor = { x: 480, y: 200 }

type PresetDef = {
  label: string
  description: string
  anchors: Partial<Record<ModuleId, PanelAnchor>>
}

const PRESET_DEFS: Record<LayoutPresetId, PresetDef> = {
  'left-stack': {
    label: 'Left stack',
    description: 'Timers stacked on the left; relic strip under reward cards',
    anchors: {
      cycles: { x: 24, y: 24 },
      fissures: { x: 24, y: 260 },
      baro: { x: 24, y: 520 },
      nightwave: { x: 24, y: 760 },
      relics: { ...RELIC_STRIP },
      rivens: { ...RIVEN_COMPARE },
      arbitration: { x: 320, y: 520 },
      invasions: { x: 320, y: 24 },
      archon: { x: 320, y: 280 },
      deepArchimedea: { x: 320, y: 520 },
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
      rivens: { ...RIVEN_COMPARE },
      arbitration: { x: 1500, y: 720 },
      invasions: { x: 700, y: 24 },
      archon: { x: 700, y: 280 },
      deepArchimedea: { x: 700, y: 520 },
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
      rivens: { ...RIVEN_COMPARE },
      arbitration: { x: 640, y: 420 },
      invasions: { x: 24, y: 24 },
      archon: { x: 24, y: 320 },
      deepArchimedea: { x: 24, y: 560 },
    },
  },
}

export const LAYOUT_PRESETS: Record<
  LayoutPresetId,
  { label: string; description: string }
> = {
  'left-stack': {
    label: PRESET_DEFS['left-stack'].label,
    description: PRESET_DEFS['left-stack'].description,
  },
  corners: {
    label: PRESET_DEFS.corners.label,
    description: PRESET_DEFS.corners.description,
  },
  'right-rail': {
    label: PRESET_DEFS['right-rail'].label,
    description: PRESET_DEFS['right-rail'].description,
  },
}

function scaleAnchor(anchor: PanelAnchor, sx: number, sy: number): PanelAnchor {
  return {
    x: Math.round(anchor.x * sx),
    y: Math.round(anchor.y * sy),
  }
}

export function scalePanelAnchors(
  anchors: Partial<Record<ModuleId, PanelAnchor>>,
  width: number,
  height: number,
  fromWidth = LAYOUT_DESIGN.width,
  fromHeight = LAYOUT_DESIGN.height,
): Partial<Record<ModuleId, PanelAnchor>> {
  const sx = width / fromWidth
  const sy = height / fromHeight
  const next: Partial<Record<ModuleId, PanelAnchor>> = {}
  for (const [id, anchor] of Object.entries(anchors) as [ModuleId, PanelAnchor][]) {
    if (!anchor) continue
    next[id] = scaleAnchor(anchor, sx, sy)
  }
  return next
}

export function getLayoutPresetAnchors(
  id: LayoutPresetId,
  width: number,
  height: number,
): Partial<Record<ModuleId, PanelAnchor>> {
  return scalePanelAnchors(PRESET_DEFS[id].anchors, width, height)
}

export function getDefaultPanelAnchors(
  width: number,
  height: number,
): Partial<Record<ModuleId, PanelAnchor>> {
  return scalePanelAnchors(DEFAULT_SETTINGS.panelAnchors, width, height)
}
