import { useCallback, useEffect, useMemo, useState } from 'react'
import { ModuleId, PanelAnchor } from '../../../shared/types'
import { OverlayLayoutStage } from '../../components/OverlayLayoutStage'
import { NowProvider } from '../../hooks/NowContext'
import { useRelicScan } from '../../hooks/useRelicScan'
import { useSettings, useWorldstate } from '../../hooks/useVoidLens'
import { prettyHotkey } from '../../lib/hotkey'
import '../../styles/overlay.css'

export function OverlayApp() {
  const { settings, ready, updateSettings } = useSettings()
  const { data } = useWorldstate()
  const { state: relicScan } = useRelicScan()
  const [anchors, setAnchors] = useState<Partial<Record<ModuleId, PanelAnchor>>>(
    settings.panelAnchors,
  )

  useEffect(() => {
    setAnchors(settings.panelAnchors)
  }, [settings.panelAnchors])

  // Relics is a transient popup (like AlecaFrame), not a always-on panel.
  const modules = useMemo(() => {
    const enabled = (Object.keys(settings.modules) as ModuleId[]).filter(
      (id) => settings.modules[id] && id !== 'relics',
    )
    const showRelicPopup = settings.modules.relics && relicScan.active
    return showRelicPopup ? [...enabled, 'relics' as ModuleId] : enabled
  }, [settings.modules, relicScan.active])

  const commitAnchors = useCallback(
    (next: Partial<Record<ModuleId, PanelAnchor>>) => {
      setAnchors(next)
      void updateSettings({ panelAnchors: next })
    },
    [updateSettings],
  )

  const dismissDragHint = useCallback(() => {
    if (settings.overlayDragHintDismissed) return
    void updateSettings({ overlayDragHintDismissed: true })
  }, [settings.overlayDragHintDismissed, updateSettings])

  const hotkeyLabel = prettyHotkey(settings.hotkeys.editLayout)
  const dragHint = settings.overlayDragHintDismissed
    ? undefined
    : settings.layoutEditMode
      ? 'Drag to move (position saves) · left or right mouse'
      : hotkeyLabel
        ? `${hotkeyLabel}, then drag to move`
        : undefined

  if (!ready || !settings.overlayVisible) {
    return <div className="overlay-root" />
  }

  return (
    <NowProvider active intervalMs={1000}>
      <OverlayLayoutStage
        mode="live"
        editable={settings.layoutEditMode}
        modules={modules}
        data={data}
        anchors={anchors}
        opacity={settings.opacity}
        overlayScale={settings.overlayScale}
        fissureTiers={settings.fissureTiers}
        dragHint={dragHint}
        hint={
          settings.layoutEditMode
            ? `${hotkeyLabel || 'Hotkey'} again to lock · positions auto-save`
            : undefined
        }
        onAnchorsChange={setAnchors}
        onAnchorsCommit={commitAnchors}
        onPanelMoved={dismissDragHint}
      />
    </NowProvider>
  )
}
