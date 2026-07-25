import { useCallback, useEffect, useMemo, useState } from 'react'
import { ModuleId, PanelAnchor } from '../../../shared/types'
import { OverlayLayoutStage } from '../../components/OverlayLayoutStage'
import { NowProvider } from '../../hooks/NowContext'
import { useSettings, useWorldstate } from '../../hooks/useVoidLens'
import '../../styles/overlay.css'

export function OverlayApp() {
  const { settings, ready, updateSettings } = useSettings()
  const { data } = useWorldstate()
  const [anchors, setAnchors] = useState<Partial<Record<ModuleId, PanelAnchor>>>(
    settings.panelAnchors,
  )

  useEffect(() => {
    setAnchors(settings.panelAnchors)
  }, [settings.panelAnchors])

  const modules = useMemo(
    () => (Object.keys(settings.modules) as ModuleId[]).filter((id) => settings.modules[id]),
    [settings.modules],
  )

  const commitAnchors = useCallback(
    (next: Partial<Record<ModuleId, PanelAnchor>>) => {
      setAnchors(next)
      void updateSettings({ panelAnchors: next })
    },
    [updateSettings],
  )

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
        fissureTiers={settings.fissureTiers}
        hint={
          settings.layoutEditMode
            ? `Drag panels to reposition · ${settings.hotkeys.editLayout} to lock`
            : undefined
        }
        onAnchorsChange={setAnchors}
        onAnchorsCommit={commitAnchors}
      />
    </NowProvider>
  )
}
