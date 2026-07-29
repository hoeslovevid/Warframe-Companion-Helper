import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clampNorm,
  defaultRelicStripNorm,
  defaultRivenCardNorms,
} from '../../shared/captureGeometry'
import type { OcrRegionNorm, OcrScanRegions } from '../../shared/types'
import { DEFAULT_OCR_SCAN_REGIONS } from '../../shared/types'
import './OcrScanGuides.css'

export type OcrGuideId = 'relicStrip' | 'rivenCurrent' | 'rivenReroll'

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

type Props = {
  width: number
  height: number
  regions: OcrScanRegions
  editable: boolean
  /** Show only these guides (defaults to all). */
  visible?: OcrGuideId[]
  onChange: (next: OcrScanRegions) => void
  onCommit: (next: OcrScanRegions) => void
}

const LABELS: Record<OcrGuideId, string> = {
  relicStrip: 'Relic OCR',
  rivenCurrent: 'Riven · current',
  rivenReroll: 'Riven · reroll',
}

const HANDLES: Handle[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function effectiveRegions(
  width: number,
  height: number,
  regions: OcrScanRegions,
): Record<OcrGuideId, OcrRegionNorm> {
  const defaults = defaultRivenCardNorms(width, height)
  return {
    relicStrip: regions.relicStrip ?? defaultRelicStripNorm(width, height),
    rivenCurrent: regions.rivenCurrent ?? defaults.current,
    rivenReroll: regions.rivenReroll ?? defaults.reroll,
  }
}

type DragState = {
  id: OcrGuideId
  handle: Handle
  startX: number
  startY: number
  origin: OcrRegionNorm
  scaleX: number
  scaleY: number
  snapshot: OcrScanRegions
  moved: boolean
}

function applyHandle(
  origin: OcrRegionNorm,
  handle: Handle,
  dxNorm: number,
  dyNorm: number,
): OcrRegionNorm {
  let { x, y, width, height } = origin
  const minSize = 0.03

  if (handle === 'move') {
    x += dxNorm
    y += dyNorm
  } else {
    if (handle.includes('e')) width += dxNorm
    if (handle.includes('s')) height += dyNorm
    if (handle.includes('w')) {
      const nextW = width - dxNorm
      if (nextW >= minSize) {
        x += dxNorm
        width = nextW
      }
    }
    if (handle.includes('n')) {
      const nextH = height - dyNorm
      if (nextH >= minSize) {
        y += dyNorm
        height = nextH
      }
    }
  }

  // Keep on-screen and minimum size.
  width = Math.max(minSize, width)
  height = Math.max(minSize, height)
  x = clamp(x, 0, 1 - width)
  y = clamp(y, 0, 1 - height)
  width = Math.min(width, 1 - x)
  height = Math.min(height, 1 - y)
  return clampNorm({ x, y, width, height })
}

export function OcrScanGuides({
  width,
  height,
  regions,
  editable,
  visible,
  onChange,
  onCommit,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const regionsRef = useRef(regions)
  const [active, setActive] = useState<OcrGuideId | null>(null)

  useEffect(() => {
    regionsRef.current = regions
  }, [regions])

  const shown = useMemo(
    () => visible ?? (['relicStrip', 'rivenCurrent', 'rivenReroll'] as OcrGuideId[]),
    [visible],
  )

  const effective = useMemo(
    () => effectiveRegions(width, height, regions),
    [width, height, regions],
  )

  const stageScale = useCallback(() => {
    const el = rootRef.current
    if (!el) return { scaleX: 1, scaleY: 1 }
    const rect = el.getBoundingClientRect()
    return {
      scaleX: rect.width / width || 1,
      scaleY: rect.height / height || 1,
    }
  }, [width, height])

  const stopDrag = useCallback(
    (commit: boolean) => {
      const drag = dragRef.current
      dragRef.current = null
      setActive(null)
      document.documentElement.classList.remove('is-ocr-guide-dragging')
      if (commit && drag?.moved) {
        onCommit(regionsRef.current)
      }
    },
    [onCommit],
  )

  const onPointerDown = useCallback(
    (id: OcrGuideId, handle: Handle, e: ReactPointerEvent) => {
      if (!editable) return
      if (e.button !== 0 && e.button !== 2) return
      e.preventDefault()
      e.stopPropagation()
      const { scaleX, scaleY } = stageScale()
      dragRef.current = {
        id,
        handle,
        startX: e.clientX,
        startY: e.clientY,
        origin: { ...effective[id] },
        scaleX,
        scaleY,
        snapshot: { ...regionsRef.current },
        moved: false,
      }
      setActive(id)
      document.documentElement.classList.add('is-ocr-guide-dragging')
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [editable, effective, stageScale],
  )

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const drag = dragRef.current
      if (!drag || !editable) return
      const dxPx = (e.clientX - drag.startX) / drag.scaleX
      const dyPx = (e.clientY - drag.startY) / drag.scaleY
      if (Math.abs(dxPx) < 0.5 && Math.abs(dyPx) < 0.5 && !drag.moved) return
      drag.moved = true
      const nextNorm = applyHandle(
        drag.origin,
        drag.handle,
        dxPx / width,
        dyPx / height,
      )
      const next: OcrScanRegions = {
        ...drag.snapshot,
        [drag.id]: nextNorm,
      }
      // Once the user edits any side, persist both riven defaults if still null
      // so a single drag doesn't leave the other card on a floating built-in.
      if (drag.id === 'rivenCurrent' && next.rivenReroll == null) {
        next.rivenReroll = effective.rivenReroll
      }
      if (drag.id === 'rivenReroll' && next.rivenCurrent == null) {
        next.rivenCurrent = effective.rivenCurrent
      }
      regionsRef.current = next
      onChange(next)
    },
    [editable, width, height, onChange, effective],
  )

  useEffect(() => {
    if (!editable) return
    const onUp = () => stopDrag(true)
    const onBlur = () => stopDrag(true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [editable, stopDrag])

  if (width <= 0 || height <= 0) return null

  return (
    <div
      ref={rootRef}
      className={`ocr-scan-guides ${editable ? 'is-editable' : ''}`}
      style={{ width, height }}
      onPointerMove={onPointerMove}
      aria-hidden={!editable}
    >
      {shown.map((id) => {
        const r = effective[id]
        const left = r.x * width
        const top = r.y * height
        const w = r.width * width
        const h = r.height * height
        const custom =
          id === 'relicStrip'
            ? regions.relicStrip != null
            : id === 'rivenCurrent'
              ? regions.rivenCurrent != null
              : regions.rivenReroll != null
        return (
          <div
            key={id}
            className={`ocr-scan-guide ocr-scan-guide--${id} ${
              active === id ? 'is-active' : ''
            } ${custom ? 'is-custom' : 'is-default'}`}
            style={{ left, top, width: w, height: h }}
            onPointerDown={(e) => onPointerDown(id, 'move', e)}
          >
            <div className="ocr-scan-guide__label">
              {LABELS[id]}
              {!custom ? <span className="ocr-scan-guide__tag">default</span> : null}
            </div>
            {id === 'relicStrip' ? (
              <div className="ocr-scan-guide__slots" aria-hidden>
                <span />
                <span />
                <span />
                <span />
              </div>
            ) : null}
            {editable
              ? HANDLES.map((handle) => (
                  <div
                    key={handle}
                    className={`ocr-scan-guide__handle ocr-scan-guide__handle--${handle}`}
                    onPointerDown={(e) => onPointerDown(id, handle, e)}
                  />
                ))
              : null}
          </div>
        )
      })}
    </div>
  )
}

export function resetOcrScanRegions(): OcrScanRegions {
  return { ...DEFAULT_OCR_SCAN_REGIONS }
}
