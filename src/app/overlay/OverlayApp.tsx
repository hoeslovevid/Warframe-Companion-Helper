import { PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ModuleId, PanelAnchor } from '../../../shared/types'
import { NowProvider } from '../../hooks/NowContext'
import { useSettings, useWorldstate } from '../../hooks/useVoidLens'
import { CyclesPanel } from '../../modules/cycles/CyclesPanel'
import { FissuresPanel } from '../../modules/fissures/FissuresPanel'
import { BaroPanel } from '../../modules/baro/BaroPanel'
import { NightwavePanel } from '../../modules/nightwave/NightwavePanel'
import { RelicsPanel } from '../../modules/relics/RelicsPanel'
import { ArbitrationPanel } from '../../modules/arbitration/ArbitrationPanel'
import '../../styles/overlay.css'

export function OverlayApp() {
  const { settings, ready, updateSettings } = useSettings()
  const { data } = useWorldstate()
  const dragRef = useRef<{ id: ModuleId; ox: number; oy: number } | null>(null)
  const anchorsRef = useRef(settings.panelAnchors)
  const [dragging, setDragging] = useState<ModuleId | null>(null)
  const [anchors, setAnchors] = useState<Partial<Record<ModuleId, PanelAnchor>>>(
    settings.panelAnchors,
  )

  useEffect(() => {
    setAnchors(settings.panelAnchors)
    anchorsRef.current = settings.panelAnchors
  }, [settings.panelAnchors])

  const modules = useMemo(
    () => (Object.keys(settings.modules) as ModuleId[]).filter((id) => settings.modules[id]),
    [settings.modules],
  )

  const onPointerDown = useCallback(
    (id: ModuleId, e: PointerEvent) => {
      if (!settings.layoutEditMode) return
      const anchor = anchors[id] || { x: 24, y: 24 }
      dragRef.current = {
        id,
        ox: e.clientX - anchor.x,
        oy: e.clientY - anchor.y,
      }
      setDragging(id)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [settings.layoutEditMode, anchors],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragRef.current || !settings.layoutEditMode) return
      const { id, ox, oy } = dragRef.current
      const x = Math.max(0, e.clientX - ox)
      const y = Math.max(0, e.clientY - oy)
      setAnchors((prev) => {
        const next = { ...prev, [id]: { x, y } }
        anchorsRef.current = next
        return next
      })
    },
    [settings.layoutEditMode],
  )

  const onPointerUp = useCallback(() => {
    if (dragRef.current) {
      void updateSettings({ panelAnchors: anchorsRef.current })
    }
    dragRef.current = null
    setDragging(null)
  }, [updateSettings])

  // Keep the transparent window empty while booting / when toggled off (window is also hidden)
  // No NowProvider here — stops the shared 1s clock while the overlay is off.
  if (!ready || !settings.overlayVisible) {
    return <div className="overlay-root" />
  }

  return (
    <NowProvider active intervalMs={1000}>
      <div
        className={`overlay-root ${settings.layoutEditMode ? 'layout-edit' : ''}`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {modules.length === 0 ? (
          <div className="overlay-empty">
            No modules enabled. Open the companion (Alt+Shift+C) and turn on Cycles, Fissures, or
            Baro under Modules.
          </div>
        ) : null}

        {modules.map((id) => {
          const anchor = anchors[id] || { x: 24, y: 24 }
          return (
            <div
              key={id}
              className="overlay-panel"
              style={{
                left: anchor.x,
                top: anchor.y,
                zIndex: dragging === id ? 20 : 1,
              }}
              onPointerDown={(e) => onPointerDown(id, e)}
            >
              {id === 'cycles' ? (
                <CyclesPanel cycles={data.cycles} opacity={settings.opacity} compact />
              ) : null}
              {id === 'fissures' ? (
                <FissuresPanel
                  fissures={data.fissures}
                  tiers={settings.fissureTiers}
                  opacity={settings.opacity}
                  compact
                />
              ) : null}
              {id === 'baro' ? (
                <BaroPanel baro={data.baro} opacity={settings.opacity} compact />
              ) : null}
              {id === 'nightwave' ? (
                <NightwavePanel nightwave={data.nightwave} opacity={settings.opacity} />
              ) : null}
              {id === 'relics' ? <RelicsPanel opacity={settings.opacity} compact /> : null}
              {id === 'arbitration' ? (
                <ArbitrationPanel arbitration={data.arbitration} opacity={settings.opacity} />
              ) : null}
            </div>
          )
        })}

        {settings.layoutEditMode ? (
          <div className="overlay-hint">
            Drag panels to reposition · {settings.hotkeys.editLayout} to lock
          </div>
        ) : null}
      </div>
    </NowProvider>
  )
}
