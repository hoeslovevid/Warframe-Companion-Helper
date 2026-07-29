import { useCallback, useEffect, useMemo, useState } from 'react'
import { ModuleId, OcrScanRegions, PanelAnchor } from '../../../shared/types'
import { OverlayLayoutStage } from '../../components/OverlayLayoutStage'
import { NowProvider } from '../../hooks/NowContext'
import { useColorTheme } from '../../hooks/useColorTheme'
import { useRelicScan } from '../../hooks/useRelicScan'
import { useRivenScan } from '../../hooks/useRivenScan'
import { useSettings, useWorldstate } from '../../hooks/useVoidLens'
import { prettyHotkey } from '../../lib/hotkey'
import { playScanSound } from '../../lib/sounds'
import '../../styles/overlay.css'

export function OverlayApp() {
  const { settings, ready, updateSettings } = useSettings()
  const { data } = useWorldstate()
  const { state: relicScan } = useRelicScan()
  const { state: rivenScan } = useRivenScan()
  useColorTheme(settings.colorTheme, settings.customPalette)
  const [anchors, setAnchors] = useState<Partial<Record<ModuleId, PanelAnchor>>>(
    settings.panelAnchors,
  )
  const [ocrRegions, setOcrRegions] = useState<OcrScanRegions>(settings.ocrScanRegions)
  const [toggleCue, setToggleCue] = useState<'on' | 'off' | null>(null)

  useEffect(() => {
    setAnchors(settings.panelAnchors)
  }, [settings.panelAnchors])

  useEffect(() => {
    setOcrRegions(settings.ocrScanRegions)
  }, [settings.ocrScanRegions])

  useEffect(() => {
    const unsub = window.voidlens?.onOverlayVisibilityChanged((visible) => {
      setToggleCue(visible ? 'on' : 'off')
      window.setTimeout(() => setToggleCue(null), 1400)
    })
    return () => unsub?.()
  }, [])

  // Chime when OCR finishes — overlay plays even if companion is minimized.
  useEffect(() => {
    if (!window.voidlens?.onRelicSound) return
    return window.voidlens.onRelicSound(() => playScanSound('relic', settings.soundPack))
  }, [settings.soundPack])

  useEffect(() => {
    if (!window.voidlens?.onRivenSound) return
    return window.voidlens.onRivenSound(() => playScanSound('riven', settings.soundPack))
  }, [settings.soundPack])

  // Relics / Rivens are transient popups (AlecaFrame-style), not always-on panels.
  const modules = useMemo(() => {
    const enabled = (Object.keys(settings.modules) as ModuleId[]).filter(
      (id) =>
        settings.modules[id] && id !== 'relics' && id !== 'rivens' && id !== 'foundry',
    )
    const next = [...enabled]
    if (settings.modules.relics && relicScan.active) next.push('relics')
    if (settings.modules.rivens && rivenScan.active) next.push('rivens')
    return next
  }, [settings.modules, relicScan.active, rivenScan.active])

  const commitAnchors = useCallback(
    (next: Partial<Record<ModuleId, PanelAnchor>>) => {
      setAnchors(next)
      void updateSettings({ panelAnchors: next })
    },
    [updateSettings],
  )

  const commitOcrRegions = useCallback(
    (next: OcrScanRegions) => {
      setOcrRegions(next)
      void updateSettings({ ocrScanRegions: next })
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
      ? 'Drag panels or OCR boxes · left or right mouse'
      : hotkeyLabel
        ? `${hotkeyLabel}, then drag to move`
        : undefined

  const cue = toggleCue ? (
    <div className={`overlay-toggle-cue ${toggleCue === 'off' ? 'is-off' : ''}`}>
      Overlay {toggleCue === 'on' ? 'ON' : 'OFF'}
    </div>
  ) : null

  if (!ready || !settings.overlayVisible) {
    // Keep a brief OFF cue visible even while the window is being hidden.
    return <div className="overlay-root">{cue}</div>
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
        moduleOpacity={settings.moduleOpacity}
        overlayScale={settings.overlayScale}
        fissureTiers={settings.fissureTiers}
        fissurePathMode={settings.fissurePathMode}
        fissureShowStorms={settings.fissureShowStorms}
        fissureSort={settings.fissureSort}
        baroWishlist={settings.baroWishlist}
        nightwaveDoneIds={settings.nightwaveDoneIds}
        dragHint={dragHint}
        hint={
          settings.layoutEditMode
            ? `${hotkeyLabel || 'Hotkey'} again to lock · panels + OCR areas auto-save`
            : undefined
        }
        showOcrGuides={settings.layoutEditMode}
        ocrGuidesEditable={settings.layoutEditMode}
        ocrScanRegions={ocrRegions}
        onOcrScanRegionsChange={setOcrRegions}
        onOcrScanRegionsCommit={commitOcrRegions}
        onAnchorsChange={setAnchors}
        onAnchorsCommit={commitAnchors}
        onPanelMoved={dismissDragHint}
      />
      {cue}
    </NowProvider>
  )
}
