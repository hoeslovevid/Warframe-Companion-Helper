import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  MODULE_META,
  ModuleId,
  PanelAnchor,
  WorldstateSnapshot,
} from '../../../shared/types'
import { OverlayLayoutStage } from '../../components/OverlayLayoutStage'
import { ToggleRow } from '../../components/ToggleRow'
import { buildPreviewWorldstate, MOCK_RELIC_REWARDS } from '../../lib/mockOverlayData'
import '../../styles/overlay.css'

const DESIGN_W = 1920
const DESIGN_H = 1080
const ALL_MODULES = Object.keys(MODULE_META) as ModuleId[]

type Props = {
  settingsModules: Record<ModuleId, boolean>
  panelAnchors: Partial<Record<ModuleId, PanelAnchor>>
  opacity: number
  overlayScale: number
  fissureTiers: string[]
  interactionHotkey: string
  liveData: WorldstateSnapshot
  onSaveAnchors: (anchors: Partial<Record<ModuleId, PanelAnchor>>) => void
}

export function LayoutEditor({
  settingsModules,
  panelAnchors,
  opacity,
  overlayScale,
  fissureTiers,
  interactionHotkey,
  liveData,
  onSaveAnchors,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.45)
  const [showAll, setShowAll] = useState(true)
  const [anchors, setAnchors] = useState(panelAnchors)

  useEffect(() => {
    setAnchors(panelAnchors)
  }, [panelAnchors])

  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth
      if (width <= 0) return
      setScale(Math.min(1, width / DESIGN_W))
    })
    ro.observe(el)
    setScale(Math.min(1, el.clientWidth / DESIGN_W))
    return () => ro.disconnect()
  }, [])

  const modules = useMemo(() => {
    if (showAll) return ALL_MODULES
    return ALL_MODULES.filter((id) => settingsModules[id])
  }, [showAll, settingsModules])

  const previewData = useMemo(() => buildPreviewWorldstate(liveData), [liveData])

  const commit = useCallback(
    (next: Partial<Record<ModuleId, PanelAnchor>>) => {
      setAnchors(next)
      onSaveAnchors(next)
    },
    [onSaveAnchors],
  )

  const reset = () => {
    const next = structuredClone(DEFAULT_SETTINGS.panelAnchors)
    commit(next)
  }

  return (
    <>
      <header className="page-header">
        <h2 className="page-title">Layout</h2>
        <div className="page-title-rule" />
        <p className="page-desc">
          Arrange overlays on this mock monitor (WFHelper-style: unlock, then drag). Left- or
          right-drag any panel — including Relic Rewards with sample cards. Positions save to the
          live overlay. In-game, press <strong>{interactionHotkey}</strong> to unlock and drag.
        </p>
      </header>

      <div className="toolbar">
        <button className="btn ghost" onClick={reset}>
          Reset positions
        </button>
        <span className="pill muted">Left or right drag · auto-saves</span>
      </div>

      <div style={{ marginBottom: 14, maxWidth: 520 }}>
        <ToggleRow
          label="Show all modules"
          description="Include disabled modules so you can place them before enabling"
          checked={showAll}
          onChange={setShowAll}
        />
      </div>

      <div className="layout-preview-shell" ref={shellRef}>
        <div
          className="layout-preview-scale"
          style={{
            height: DESIGN_H * scale,
            position: 'relative',
          }}
        >
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: DESIGN_W,
              height: DESIGN_H,
            }}
          >
            <OverlayLayoutStage
              mode="preview"
              editable
              modules={modules}
              data={previewData}
              anchors={anchors}
              opacity={opacity}
              overlayScale={overlayScale}
              fissureTiers={fissureTiers}
              designWidth={DESIGN_W}
              designHeight={DESIGN_H}
              relicPreviewRewards={MOCK_RELIC_REWARDS}
              dragHint="Drag to move (position saves)"
              hint="Positions match the in-game overlay · left or right mouse"
              onAnchorsChange={setAnchors}
              onAnchorsCommit={commit}
            />
          </div>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        Preview uses a 1920×1080 canvas. On other resolutions, panels keep the same pixel offsets
        from the top-left of your primary monitor. In-game: press <strong>{interactionHotkey}</strong>{' '}
        to unlock click-through, drag panels, then press it again to lock.
      </p>
    </>
  )
}
