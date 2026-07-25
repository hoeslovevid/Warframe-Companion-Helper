import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FissureSort,
  MODULE_META,
  ModuleId,
  PanelAnchor,
  PrimaryDisplayInfo,
  WorldstateSnapshot,
} from '../../../shared/types'
import { OverlayLayoutStage } from '../../components/OverlayLayoutStage'
import { ToggleRow } from '../../components/ToggleRow'
import {
  getDefaultPanelAnchors,
  getLayoutPresetAnchors,
  LAYOUT_PRESETS,
  LayoutPresetId,
} from '../../lib/layoutPresets'
import {
  buildPreviewWorldstate,
  MOCK_RELIC_REWARDS,
  MOCK_RIVEN_SCAN,
} from '../../lib/mockOverlayData'
import '../../styles/overlay.css'

const FALLBACK_DISPLAY: PrimaryDisplayInfo = {
  width: 1920,
  height: 1080,
  scaleFactor: 1,
}

const ALL_MODULES = Object.keys(MODULE_META) as ModuleId[]

type Props = {
  settingsModules: Record<ModuleId, boolean>
  panelAnchors: Partial<Record<ModuleId, PanelAnchor>>
  opacity: number
  overlayScale: number
  fissureTiers: string[]
  fissureShowSteelPath?: boolean
  fissureSort?: FissureSort
  baroWishlist?: string[]
  nightwaveDoneIds?: string[]
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
  fissureShowSteelPath = true,
  fissureSort = 'eta',
  baroWishlist = [],
  nightwaveDoneIds = [],
  interactionHotkey,
  liveData,
  onSaveAnchors,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.45)
  const [showAll, setShowAll] = useState(true)
  const [anchors, setAnchors] = useState(panelAnchors)
  const [display, setDisplay] = useState<PrimaryDisplayInfo>(FALLBACK_DISPLAY)

  useEffect(() => {
    setAnchors(panelAnchors)
  }, [panelAnchors])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        if (window.voidlens?.getPrimaryDisplay) {
          const next = await window.voidlens.getPrimaryDisplay()
          if (!cancelled && next?.width > 0 && next?.height > 0) {
            setDisplay(next)
            return
          }
        }
      } catch {
        // fall through
      }
      if (!cancelled) {
        setDisplay({
          width: window.screen.width || FALLBACK_DISPLAY.width,
          height: window.screen.height || FALLBACK_DISPLAY.height,
          scaleFactor: window.devicePixelRatio || 1,
        })
      }
    }
    void load()

    const onResize = () => {
      void load()
    }
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const designW = display.width
  const designH = display.height

  useEffect(() => {
    const el = shellRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? el.clientWidth
      if (width <= 0) return
      setScale(Math.min(1, width / designW))
    })
    ro.observe(el)
    setScale(Math.min(1, el.clientWidth / designW))
    return () => ro.disconnect()
  }, [designW])

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
    commit(getDefaultPanelAnchors(designW, designH))
  }

  const applyPreset = (id: LayoutPresetId) => {
    commit(getLayoutPresetAnchors(id, designW, designH))
  }

  return (
    <>
      <header className="page-header">
        <h2 className="page-title">Layout</h2>
        <div className="page-title-rule" />
        <p className="page-desc">
          Arrange overlays on a mock of your primary monitor (
          <strong>
            {designW}×{designH}
          </strong>
          ). Drag the <strong>Relic Rewards</strong> strip under the reward cards and the{' '}
          <strong>Riven Grader</strong> compare panel where you want it. Presets and reset scale to
          this resolution. In-game, press <strong>{interactionHotkey}</strong> to unlock and drag
          during a popup.
        </p>
      </header>

      <div className="toolbar" data-tour="layout-presets">
        {(Object.keys(LAYOUT_PRESETS) as LayoutPresetId[]).map((id) => (
          <button
            key={id}
            className="btn"
            title={LAYOUT_PRESETS[id].description}
            onClick={() => applyPreset(id)}
          >
            {LAYOUT_PRESETS[id].label}
          </button>
        ))}
        <button className="btn ghost" onClick={reset}>
          Reset positions
        </button>
        <span className="pill muted">
          Monitor {designW}×{designH}
          {display.scaleFactor !== 1 ? ` · ${display.scaleFactor}× DPI` : ''}
        </span>
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
            height: designH * scale,
            position: 'relative',
          }}
        >
          <div
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              width: designW,
              height: designH,
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
              fissureShowSteelPath={fissureShowSteelPath}
              fissureSort={fissureSort}
              baroWishlist={baroWishlist}
              nightwaveDoneIds={nightwaveDoneIds}
              designWidth={designW}
              designHeight={designH}
              relicPreviewRewards={MOCK_RELIC_REWARDS}
              rivenPreviewState={MOCK_RIVEN_SCAN}
              dragHint="Drag to move (position saves)"
              hint={`Preview · ${designW}×${designH} primary display · left or right mouse`}
              onAnchorsChange={setAnchors}
              onAnchorsCommit={commit}
            />
          </div>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        Canvas matches your primary monitor ({designW}×{designH}). Preset and reset coordinates are
        scaled from a 1920×1080 design so positions land correctly on ultrawide and 1440p/4K. In-game:
        press <strong>{interactionHotkey}</strong> to unlock click-through, drag, then lock again.
      </p>
    </>
  )
}
