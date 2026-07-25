import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ModuleId,
  PanelAnchor,
  RewardEval,
  WorldstateSnapshot,
} from '../../shared/types'
import { CyclesPanel } from '../modules/cycles/CyclesPanel'
import { FissuresPanel } from '../modules/fissures/FissuresPanel'
import { BaroPanel } from '../modules/baro/BaroPanel'
import { NightwavePanel } from '../modules/nightwave/NightwavePanel'
import { RelicsPanel } from '../modules/relics/RelicsPanel'
import { ArbitrationPanel } from '../modules/arbitration/ArbitrationPanel'
import '../styles/overlay.css'
import './OverlayLayoutStage.css'

export type OverlayLayoutStageProps = {
  modules: ModuleId[]
  data: WorldstateSnapshot
  anchors: Partial<Record<ModuleId, PanelAnchor>>
  opacity: number
  fissureTiers: string[]
  editable: boolean
  /** live = fullscreen overlay; preview = scaled mock monitor */
  mode: 'live' | 'preview'
  designWidth?: number
  designHeight?: number
  relicPreviewRewards?: RewardEval[]
  hint?: string
  onAnchorsChange: (next: Partial<Record<ModuleId, PanelAnchor>>) => void
  onAnchorsCommit: (next: Partial<Record<ModuleId, PanelAnchor>>) => void
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function OverlayLayoutStage({
  modules,
  data,
  anchors,
  opacity,
  fissureTiers,
  editable,
  mode,
  designWidth = 1920,
  designHeight = 1080,
  relicPreviewRewards,
  hint,
  onAnchorsChange,
  onAnchorsCommit,
}: OverlayLayoutStageProps) {
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: ModuleId; ox: number; oy: number } | null>(null)
  const anchorsRef = useRef(anchors)
  const [dragging, setDragging] = useState<ModuleId | null>(null)

  useEffect(() => {
    anchorsRef.current = anchors
  }, [anchors])

  const toStagePoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = stageRef.current
      if (!el) return { x: clientX, y: clientY }
      const rect = el.getBoundingClientRect()
      if (mode === 'live') {
        return {
          x: clientX - rect.left,
          y: clientY - rect.top,
        }
      }
      const sx = rect.width / designWidth
      const sy = rect.height / designHeight
      return {
        x: (clientX - rect.left) / sx,
        y: (clientY - rect.top) / sy,
      }
    },
    [mode, designWidth, designHeight],
  )

  const onPointerDown = useCallback(
    (id: ModuleId, e: PointerEvent) => {
      if (!editable) return
      e.preventDefault()
      e.stopPropagation()
      const anchor = anchors[id] || { x: 24, y: 24 }
      const pt = toStagePoint(e.clientX, e.clientY)
      dragRef.current = {
        id,
        ox: pt.x - anchor.x,
        oy: pt.y - anchor.y,
      }
      setDragging(id)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [editable, anchors, toStagePoint],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current || !editable) return
      const { id, ox, oy } = dragRef.current
      const pt = toStagePoint(e.clientX, e.clientY)
      const maxX = mode === 'live' ? window.innerWidth - 40 : designWidth - 40
      const maxY = mode === 'live' ? window.innerHeight - 40 : designHeight - 40
      const x = clamp(pt.x - ox, 0, maxX)
      const y = clamp(pt.y - oy, 0, maxY)
      const next = { ...anchorsRef.current, [id]: { x: Math.round(x), y: Math.round(y) } }
      anchorsRef.current = next
      onAnchorsChange(next)
    },
    [editable, toStagePoint, mode, designWidth, designHeight, onAnchorsChange],
  )

  const onPointerUp = useCallback(() => {
    if (dragRef.current) {
      onAnchorsCommit(anchorsRef.current)
    }
    dragRef.current = null
    setDragging(null)
  }, [onAnchorsCommit])

  const panel = useMemo(() => {
    const render = (id: ModuleId) => {
      switch (id) {
        case 'cycles':
          return <CyclesPanel cycles={data.cycles} opacity={opacity} compact />
        case 'fissures':
          return (
            <FissuresPanel
              fissures={data.fissures}
              tiers={fissureTiers}
              opacity={opacity}
              compact
            />
          )
        case 'baro':
          return <BaroPanel baro={data.baro} opacity={opacity} compact />
        case 'nightwave':
          return <NightwavePanel nightwave={data.nightwave} opacity={opacity} />
        case 'relics':
          return (
            <RelicsPanel
              opacity={opacity}
              compact
              previewMode={mode === 'preview'}
              previewRewards={relicPreviewRewards}
            />
          )
        case 'arbitration':
          return <ArbitrationPanel arbitration={data.arbitration} opacity={opacity} />
        default:
          return null
      }
    }
    return render
  }, [data, opacity, fissureTiers, mode, relicPreviewRewards])

  const stageStyle =
    mode === 'preview'
      ? {
          width: designWidth,
          height: designHeight,
        }
      : undefined

  return (
    <div
      ref={stageRef}
      className={`overlay-layout-stage overlay-root ${editable ? 'layout-edit' : ''} is-${mode}`}
      style={stageStyle}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {mode === 'preview' ? (
        <div className="overlay-layout-stage__chrome" aria-hidden>
          <span>Mock display · {designWidth}×{designHeight}</span>
        </div>
      ) : null}

      {modules.length === 0 ? (
        <div className="overlay-empty">
          No modules to show. Enable modules under Modules, or turn on “Show all modules” here.
        </div>
      ) : null}

      {modules.map((id) => {
        const anchor = anchors[id] || { x: 24, y: 24 }
        return (
          <div
            key={id}
            className={`overlay-panel ${editable ? 'is-draggable' : ''} ${
              dragging === id ? 'is-dragging' : ''
            }`}
            style={{
              left: anchor.x,
              top: anchor.y,
              zIndex: dragging === id ? 20 : 1,
            }}
            onPointerDown={(e) => onPointerDown(id, e)}
          >
            <div className="overlay-panel__badge">{id}</div>
            {panel(id)}
          </div>
        )
      })}

      {hint ? <div className="overlay-hint">{hint}</div> : null}
    </div>
  )
}
