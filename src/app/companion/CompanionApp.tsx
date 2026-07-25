import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  COLOR_THEME_META,
  ColorThemeId,
  HotkeyRegistration,
  MODULE_META,
  ModuleId,
  OVERLAY_MODULE_IDS,
} from '../../../shared/types'
import { themeIdsByMode } from '../../lib/theme'
import { useColorTheme } from '../../hooks/useColorTheme'
import { Panel } from '../../components/Panel'
import { ToggleRow } from '../../components/ToggleRow'
import { InventorySettings } from '../../components/InventorySettings'
import { UpdateSettings } from '../../components/UpdateSettings'
import { GettingStarted } from '../../components/GettingStarted'
import { AppTour, TourStep } from '../../components/AppTour'
import { StatusStrip } from '../../components/StatusStrip'
import { HotkeySheet } from '../../components/HotkeySheet'
import { HelpPage } from '../../components/HelpPage'
import { WhatsNew } from '../../components/WhatsNew'
import { NowProvider } from '../../hooks/NowContext'
import { useInventory } from '../../hooks/useInventory'
import { useRelicScan } from '../../hooks/useRelicScan'
import { useSettings, useWorldstate } from '../../hooks/useVoidLens'
import { PLAY_PROFILES, applyPlayProfile } from '../../lib/playProfiles'
import { CyclesPanel } from '../../modules/cycles/CyclesPanel'
import { FissuresPanel } from '../../modules/fissures/FissuresPanel'
import { BaroPanel } from '../../modules/baro/BaroPanel'
import { NightwavePanel } from '../../modules/nightwave/NightwavePanel'
import { RelicsPanel } from '../../modules/relics/RelicsPanel'
import { ArbitrationPanel } from '../../modules/arbitration/ArbitrationPanel'
import { InvasionsPanel } from '../../modules/invasions/InvasionsPanel'
import { ArchonPanel } from '../../modules/archon/ArchonPanel'
import { DeepArchimedeaPanel } from '../../modules/deepArchimedea/DeepArchimedeaPanel'
import { RivenPanel } from '../../modules/rivens/RivenPanel'
import { FoundryPage } from '../../modules/foundry/FoundryPage'
import { LayoutEditor } from './LayoutEditor'
import { prettyHotkey } from '../../lib/hotkey'
import '../../styles/companion.css'
import '../../modules/cycles/module.css'

type Tab = 'dashboard' | 'modules' | 'foundry' | 'layout' | 'settings' | 'help'

const TIER_OPTIONS = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem']

const HOTKEY_LABELS: Record<HotkeyRegistration['id'], string> = {
  toggleOverlay: 'Toggle overlay',
  openCompanion: 'Open companion',
  refreshWorldstate: 'Refresh worldstate',
  scanRelics: 'Scan relic rewards',
  dismissRelics: 'Dismiss relic popup',
  scanRivens: 'Scan riven compare',
  dismissRivens: 'Dismiss riven popup',
  editLayout: 'Move panels (unlock drag)',
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'nav-dashboard',
    tab: 'dashboard',
    title: 'Dashboard',
    body: 'Live worldstate for enabled modules. Status chips show overlay, EE.log, and inventory at a glance.',
  },
  {
    target: 'nav-modules',
    tab: 'modules',
    title: 'Modules',
    body: 'Turn panels on or off. Only enabled modules appear in the overlay and on this dashboard.',
  },
  {
    target: 'nav-foundry',
    tab: 'foundry',
    title: 'Foundry',
    body: 'Browse craftable gear, check ready-to-build status, and expand crafting trees against your synced inventory.',
  },
  {
    target: 'nav-layout',
    tab: 'layout',
    title: 'Layout',
    body: 'Drag every panel on the mock monitor — including Relic Rewards and Riven Grader. Try a preset if you want a quick start.',
  },
  {
    target: 'toolbar-hotkeys',
    tab: 'dashboard',
    title: 'Hotkeys',
    body: 'Press ? anytime for the cheat sheet. In-game: toggle overlay, unlock drag, scan relics, and grade rivens.',
  },
  {
    target: 'nav-help',
    tab: 'help',
    title: 'Help',
    body: 'Replay this tour, reopen Getting started, or jump to the website and update notes.',
  },
]

function playRelicChime() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 784
    gain.gain.value = 0.035
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
    osc.stop(ctx.currentTime + 0.18)
    void ctx.close()
  } catch {
    // Audio may be blocked until user gesture
  }
}

export function CompanionApp() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [tourOpen, setTourOpen] = useState(false)
  const [hotkeysOpen, setHotkeysOpen] = useState(false)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [hotkeyStatus, setHotkeyStatus] = useState<HotkeyRegistration[]>([])
  const { settings, ready, updateSettings, setModuleEnabled } = useSettings()
  const { data, loading, error, refresh } = useWorldstate()
  const { status: inventory } = useInventory()
  const { state: relicScan, ackCelebration } = useRelicScan()
  useColorTheme(settings.colorTheme)

  const enabledIds = useMemo(
    () => (Object.keys(settings.modules) as ModuleId[]).filter((id) => settings.modules[id]),
    [settings.modules],
  )

  const showWorldstateBanner = Boolean(data.stale || data.error || error)
  const worldstateBannerMessage = error
    ? `Worldstate error: ${error}`
    : data.error
      ? `Worldstate error: ${data.error}`
      : data.stale
        ? 'Worldstate data is stale — refresh to fetch the latest.'
        : null

  const patchOnboarding = useCallback(
    (partial: Partial<typeof settings.onboarding>) => {
      void updateSettings({
        onboarding: { ...settings.onboarding, ...partial },
      })
    },
    [settings.onboarding, updateSettings],
  )

  const goTab = useCallback(
    (next: Tab) => {
      setTab(next)
      if (next === 'layout' && !settings.onboarding.layoutVisited) {
        patchOnboarding({ layoutVisited: true })
      }
      if (next === 'modules' && !settings.onboarding.modulesTouched) {
        patchOnboarding({ modulesTouched: true })
      }
    },
    [settings.onboarding, patchOnboarding],
  )

  const toggleBaroWish = useCallback(
    (item: string) => {
      const lower = item.toLowerCase()
      const existing = settings.baroWishlist.find(
        (w) => lower.includes(w.toLowerCase()) || w.toLowerCase().includes(lower),
      )
      const next = existing
        ? settings.baroWishlist.filter((w) => w !== existing)
        : [...settings.baroWishlist, item]
      void updateSettings({ baroWishlist: next })
    },
    [settings.baroWishlist, updateSettings],
  )

  const toggleNightwaveDone = useCallback(
    (id: string) => {
      const next = settings.nightwaveDoneIds.includes(id)
        ? settings.nightwaveDoneIds.filter((x) => x !== id)
        : [...settings.nightwaveDoneIds, id]
      void updateSettings({ nightwaveDoneIds: next })
    },
    [settings.nightwaveDoneIds, updateSettings],
  )

  const dismissWhatsNew = useCallback(() => {
    setWhatsNewOpen(false)
    if (appVersion) {
      void updateSettings({ lastSeenVersion: appVersion })
    }
  }, [appVersion, updateSettings])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setHotkeysOpen(true)
      }
      if (e.key === 'Escape') {
        setHotkeysOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const boot = async () => {
      if (!window.voidlens?.getHotkeyStatus) return
      setHotkeyStatus(await window.voidlens.getHotkeyStatus())
    }
    void boot()
  }, [])

  useEffect(() => {
    if (!ready) return
    const boot = async () => {
      if (!window.voidlens?.getAppVersion) return
      const version = await window.voidlens.getAppVersion()
      setAppVersion(version)
      if (version && version !== settings.lastSeenVersion) {
        setWhatsNewOpen(true)
      }
    }
    void boot()
  }, [ready, settings.lastSeenVersion])

  useEffect(() => {
    if (!window.voidlens?.onRelicSound) return
    return window.voidlens.onRelicSound(playRelicChime)
  }, [])

  if (!ready) {
    return (
      <div className="companion-root companion-main">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden />
          <h1 className="brand">Everything Warframe</h1>
        </div>
        <p className="muted">Calibrating companion…</p>
      </div>
    )
  }

  return (
    <NowProvider active intervalMs={1000}>
      <div className="companion-root">
        <div className="companion-shell">
          <aside className="companion-nav">
            <div className="brand-lockup">
              <div className="brand-mark" aria-hidden />
              <div>
                <h1 className="brand">Everything Warframe</h1>
              </div>
            </div>
            <p className="brand-sub">Cycles, relics, Baro, inventory, and more — in one overlay.</p>
            <div className="nav-section">Overview</div>
            <button
              className={`nav-btn ${tab === 'dashboard' ? 'active' : ''}`}
              data-tour="nav-dashboard"
              title="Live worldstate and getting started"
              onClick={() => goTab('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`nav-btn ${tab === 'modules' ? 'active' : ''}`}
              data-tour="nav-modules"
              title="Choose which overlay panels are enabled"
              onClick={() => goTab('modules')}
            >
              Modules
            </button>
            <div className="nav-section">Tools</div>
            <button
              className={`nav-btn ${tab === 'foundry' ? 'active' : ''}`}
              data-tour="nav-foundry"
              title="Crafting trees and build readiness"
              onClick={() => goTab('foundry')}
            >
              Foundry
            </button>
            <button
              className={`nav-btn ${tab === 'layout' ? 'active' : ''}`}
              data-tour="nav-layout"
              title="Drag panels on a mock monitor"
              onClick={() => goTab('layout')}
            >
              Layout
            </button>
            <div className="nav-section">System</div>
            <button
              className={`nav-btn ${tab === 'settings' ? 'active' : ''}`}
              data-tour="nav-settings"
              title="Appearance, hotkeys, inventory, updates"
              onClick={() => goTab('settings')}
            >
              Settings
            </button>
            <button
              className={`nav-btn ${tab === 'help' ? 'active' : ''}`}
              data-tour="nav-help"
              title="Tour, hotkeys, and FAQ"
              onClick={() => goTab('help')}
            >
              Help
            </button>
          </aside>

          <main className="companion-main">
            {tab === 'dashboard' ? (
              <>
                <header className="page-header">
                  <h2 className="page-title">Dashboard</h2>
                  <div className="page-title-rule" />
                  <p className="page-desc">
                    Live worldstate for your enabled modules. Keep Warframe in Borderless Windowed so
                    the overlay can sit above the game.
                  </p>
                </header>

                <GettingStarted
                  settings={settings}
                  onUpdate={(partial) => void updateSettings(partial)}
                  onGoModules={() => goTab('modules')}
                  onGoLayout={() => goTab('layout')}
                  onGoInventory={() => {
                    patchOnboarding({ inventoryTouched: true })
                    goTab('settings')
                  }}
                  onStartTour={() => setTourOpen(true)}
                />

                {relicScan.celebration && !settings.onboarding.firstRelicSuccessAck ? (
                  <section className="getting-started" style={{ marginBottom: 16 }}>
                    <div className="getting-started__header">
                      <div>
                        <h3 className="getting-started__title">First relic scan worked!</h3>
                        <p className="getting-started__sub">
                          Relic rewards are showing in the overlay. Sync inventory in Settings for
                          needed-part tags.
                        </p>
                      </div>
                      <button className="btn ghost" onClick={() => void ackCelebration()}>
                        Dismiss
                      </button>
                    </div>
                  </section>
                ) : null}

                <StatusStrip
                  settings={settings}
                  inventory={inventory}
                  worldstateOk={Boolean(data.fetchedAt) && !error}
                  worldstateStale={data.stale}
                  onToggleOverlay={() => void window.voidlens?.toggleOverlay()}
                  onDetectEeLog={() => void window.voidlens?.detectEeLogPath()}
                  onRefreshWorldstate={() => void refresh()}
                  onGoSettings={() => goTab('settings')}
                />

                <div className="toolbar" data-tour="toolbar-hotkeys">
                  <button className="btn primary" onClick={() => void refresh()}>
                    Refresh worldstate
                  </button>
                  <button className="btn" onClick={() => void window.voidlens?.toggleOverlay()}>
                    Toggle overlay
                  </button>
                  <button className="btn ghost" onClick={() => goTab('layout')}>
                    Edit layout
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() =>
                      void updateSettings({ layoutEditMode: !settings.layoutEditMode })
                    }
                  >
                    {settings.layoutEditMode ? 'Lock panels (in-game)' : 'Move panels (in-game)'}
                  </button>
                  <button className="btn ghost" onClick={() => setHotkeysOpen(true)}>
                    Hotkeys (?)
                  </button>
                  {PLAY_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      className="btn ghost"
                      title={profile.description}
                      onClick={() => void updateSettings(applyPlayProfile(settings, profile.id))}
                    >
                      {profile.label}
                    </button>
                  ))}
                  <span className="pill muted">
                    {loading
                      ? 'Updating…'
                      : data.fetchedAt
                        ? `Updated ${new Date(data.fetchedAt).toLocaleTimeString()}`
                        : 'No data yet'}
                  </span>
                </div>

                {showWorldstateBanner && worldstateBannerMessage ? (
                  <section className="getting-started" style={{ marginBottom: 16, padding: '12px 16px' }}>
                    <p className="getting-started__sub" style={{ margin: 0 }}>
                      {worldstateBannerMessage}
                    </p>
                  </section>
                ) : null}

                <Panel
                  title="Seeing FPS / Frame Time?"
                  subtitle="That is not part of Everything Warframe"
                >
                  <p className="muted" style={{ marginTop: 0 }}>
                    Everything Warframe only draws Cycles, Fissures, Baro, etc. An FPS / Frame Time
                    widget is almost always Xbox Game Bar, NVIDIA Overlay, or MSI Afterburner /
                    RTSS.
                  </p>
                </Panel>

                <div className="section-gap" />

                <div className="grid-2">
                  {enabledIds.includes('cycles') ? <CyclesPanel cycles={data.cycles} /> : null}
                  {enabledIds.includes('fissures') ? (
                    <FissuresPanel
                      fissures={data.fissures}
                      tiers={settings.fissureTiers}
                      showSteelPath={settings.fissureShowSteelPath}
                      sort={settings.fissureSort}
                    />
                  ) : null}
                  {enabledIds.includes('baro') ? (
                    <BaroPanel
                      baro={data.baro}
                      wishlist={settings.baroWishlist}
                      onToggleWish={toggleBaroWish}
                    />
                  ) : null}
                  {enabledIds.includes('nightwave') ? (
                    <NightwavePanel
                      nightwave={data.nightwave}
                      doneIds={settings.nightwaveDoneIds}
                      onToggleDone={toggleNightwaveDone}
                    />
                  ) : null}
                  {enabledIds.includes('relics') ? (
                    <RelicsPanel
                      scanHotkey={prettyHotkey(settings.hotkeys.scanRelics)}
                      dismissHotkey={prettyHotkey(settings.hotkeys.dismissRelics)}
                    />
                  ) : null}
                  {enabledIds.includes('rivens') ? (
                    <RivenPanel
                      scanHotkey={prettyHotkey(settings.hotkeys.scanRivens)}
                      dismissHotkey={prettyHotkey(settings.hotkeys.dismissRivens)}
                    />
                  ) : null}
                  {enabledIds.includes('arbitration') ? (
                    <ArbitrationPanel arbitration={data.arbitration} />
                  ) : null}
                  {enabledIds.includes('invasions') ? (
                    <InvasionsPanel invasions={data.invasions} />
                  ) : null}
                  {enabledIds.includes('archon') ? (
                    <ArchonPanel archonHunt={data.archonHunt} />
                  ) : null}
                  {enabledIds.includes('deepArchimedea') ? (
                    <DeepArchimedeaPanel deepArchimedea={data.deepArchimedea} />
                  ) : null}
                </div>
              </>
            ) : null}

            {tab === 'modules' ? (
              <>
                <header className="page-header">
                  <h2 className="page-title">Modules</h2>
                  <div className="page-title-rule" />
                  <p className="page-desc">
                    Choose what appears in the overlay and dashboard. Foundry Planner is companion-only
                    (no overlay panel). Relic / riven scanning and inventory tags are live.
                  </p>
                </header>
                <Panel title="Toggleable modules">
                  {(Object.keys(MODULE_META) as ModuleId[]).map((id) => {
                    const meta = MODULE_META[id]
                    return (
                      <ToggleRow
                        key={id}
                        label={meta.label}
                        description={meta.description}
                        checked={settings.modules[id]}
                        badge={meta.phase > 1 ? `Phase ${meta.phase}` : undefined}
                        onChange={(enabled) => {
                          patchOnboarding({ modulesTouched: true })
                          void setModuleEnabled(id, enabled)
                        }}
                      />
                    )
                  })}
                </Panel>

                <div className="section-gap" />

                <Panel title="Fissure filters" subtitle="Which tiers appear in the fissure module">
                  <div className="toolbar">
                    {TIER_OPTIONS.map((tier) => {
                      const on = settings.fissureTiers.includes(tier)
                      return (
                        <button
                          key={tier}
                          className={`btn ${on ? 'primary' : 'ghost'}`}
                          onClick={() => {
                            const next = on
                              ? settings.fissureTiers.filter((t) => t !== tier)
                              : [...settings.fissureTiers, tier]
                            void updateSettings({ fissureTiers: next })
                          }}
                        >
                          {tier}
                        </button>
                      )
                    })}
                  </div>
                  <ToggleRow
                    label="Show Steel Path fissures"
                    description="Include Steel Path (hard mode) fissures in the list"
                    checked={settings.fissureShowSteelPath}
                    onChange={(enabled) => void updateSettings({ fissureShowSteelPath: enabled })}
                  />
                  <div className="toolbar" style={{ marginTop: 8 }}>
                    <button
                      className={`btn ${settings.fissureSort === 'eta' ? 'primary' : 'ghost'}`}
                      onClick={() => void updateSettings({ fissureSort: 'eta' })}
                    >
                      Sort by ETA
                    </button>
                    <button
                      className={`btn ${settings.fissureSort === 'tier' ? 'primary' : 'ghost'}`}
                      onClick={() => void updateSettings({ fissureSort: 'tier' })}
                    >
                      Sort by Tier
                    </button>
                  </div>
                </Panel>
              </>
            ) : null}

            {tab === 'foundry' ? (
              <FoundryPage
                enabled={settings.modules.foundry}
                onOpenSettings={() => goTab('settings')}
              />
            ) : null}

            {tab === 'layout' ? (
              <LayoutEditor
                settingsModules={settings.modules}
                panelAnchors={settings.panelAnchors}
                opacity={settings.opacity}
                moduleOpacity={settings.moduleOpacity}
                overlayScale={settings.overlayScale}
                fissureTiers={settings.fissureTiers}
                fissureShowSteelPath={settings.fissureShowSteelPath}
                fissureSort={settings.fissureSort}
                baroWishlist={settings.baroWishlist}
                nightwaveDoneIds={settings.nightwaveDoneIds}
                interactionHotkey={prettyHotkey(settings.hotkeys.editLayout)}
                liveData={data}
                onSaveAnchors={(panelAnchors) => void updateSettings({ panelAnchors })}
              />
            ) : null}

            {tab === 'settings' ? (
              <>
                <header className="page-header">
                  <h2 className="page-title">Settings</h2>
                  <div className="page-title-rule" />
                  <p className="page-desc">
                    Appearance, hotkeys, inventory sync, and updates. Inventory stays local and
                    powers “needed for set” relic tags.
                  </p>
                </header>

                <Panel
                  title="Appearance"
                  subtitle="Theme applies to the companion and overlay panels"
                >
                  <p className="theme-group-label">Dark palettes</p>
                  <div className="theme-grid">
                    {themeIdsByMode('dark').map((id) => {
                      const meta = COLOR_THEME_META[id]
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`theme-card ${settings.colorTheme === id ? 'is-selected' : ''}`}
                          onClick={() => void updateSettings({ colorTheme: id as ColorThemeId })}
                        >
                          <div className="theme-card__swatches" aria-hidden>
                            {meta.swatches.map((c) => (
                              <span key={c} style={{ background: c }} />
                            ))}
                          </div>
                          <div className="theme-card__label">{meta.label}</div>
                          <div className="theme-card__meta">{meta.description}</div>
                        </button>
                      )
                    })}
                  </div>
                  <p className="theme-group-label">Light palettes</p>
                  <div className="theme-grid">
                    {themeIdsByMode('light').map((id) => {
                      const meta = COLOR_THEME_META[id]
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`theme-card ${settings.colorTheme === id ? 'is-selected' : ''}`}
                          onClick={() => void updateSettings({ colorTheme: id as ColorThemeId })}
                        >
                          <div className="theme-card__swatches" aria-hidden>
                            {meta.swatches.map((c) => (
                              <span key={c} style={{ background: c }} />
                            ))}
                          </div>
                          <div className="theme-card__label">{meta.label}</div>
                          <div className="theme-card__meta">{meta.description}</div>
                        </button>
                      )
                    })}
                  </div>
                  <p className="theme-group-label" style={{ marginTop: 16 }}>
                    Overlay opacity
                  </p>
                  <p className="page-desc" style={{ marginTop: 0, marginBottom: 10 }}>
                    Each overlay panel has its own opacity. Use “Set all” to match every panel.
                  </p>
                  <div className="field">
                    <label htmlFor="opacity-all">
                      Set all ({settings.opacity.toFixed(2)})
                    </label>
                    <input
                      id="opacity-all"
                      type="range"
                      min={0.4}
                      max={1}
                      step={0.01}
                      value={settings.opacity}
                      onChange={(e) => {
                        const value = Number(e.target.value)
                        const moduleOpacity = Object.fromEntries(
                          OVERLAY_MODULE_IDS.map((id) => [id, value]),
                        ) as Partial<Record<ModuleId, number>>
                        void updateSettings({ opacity: value, moduleOpacity })
                      }}
                    />
                  </div>
                  <div className="opacity-module-list">
                    {OVERLAY_MODULE_IDS.map((id) => {
                      const value = settings.moduleOpacity[id] ?? settings.opacity
                      return (
                        <div className="field" key={id}>
                          <label htmlFor={`opacity-${id}`}>
                            {MODULE_META[id].label} ({value.toFixed(2)})
                          </label>
                          <input
                            id={`opacity-${id}`}
                            type="range"
                            min={0.4}
                            max={1}
                            step={0.01}
                            value={value}
                            onChange={(e) =>
                              void updateSettings({
                                moduleOpacity: {
                                  ...settings.moduleOpacity,
                                  [id]: Number(e.target.value),
                                },
                              })
                            }
                          />
                        </div>
                      )
                    })}
                  </div>
                  <div className="field">
                    <label htmlFor="overlay-scale">
                      Overlay scale ({settings.overlayScale.toFixed(2)}×)
                    </label>
                    <input
                      id="overlay-scale"
                      type="range"
                      min={0.75}
                      max={1.5}
                      step={0.05}
                      value={settings.overlayScale}
                      onChange={(e) =>
                        void updateSettings({ overlayScale: Number(e.target.value) })
                      }
                    />
                  </div>
                  <ToggleRow
                    label="Overlay visible"
                    description="Global hotkey also toggles this"
                    checked={settings.overlayVisible}
                    onChange={(enabled) => void updateSettings({ overlayVisible: enabled })}
                  />
                  <ToggleRow
                    label="Move panels (in-game)"
                    description={`${prettyHotkey(settings.hotkeys.editLayout)} unlocks click-through so you can drag. Prefer Layout for a mock preview.`}
                    checked={settings.layoutEditMode}
                    onChange={(enabled) => void updateSettings({ layoutEditMode: enabled })}
                  />
                </Panel>

                <div className="section-gap" />

                <div className="grid-2">

                  <Panel title="Companion">
                    <ToggleRow
                      label="Quiet mode"
                      description="After first-run checklist, start minimized to the tray"
                      checked={settings.quietMode}
                      onChange={(enabled) => void updateSettings({ quietMode: enabled })}
                    />
                    <ToggleRow
                      label="Relic scan chime"
                      description="Play a soft sound when relic rewards appear"
                      checked={settings.relicSoundEnabled}
                      onChange={(enabled) => void updateSettings({ relicSoundEnabled: enabled })}
                    />
                    <ToggleRow
                      label="Auto-sync inventory"
                      description="Resync inventory while Warframe is running"
                      checked={settings.inventoryAutoSync}
                      onChange={(enabled) => void updateSettings({ inventoryAutoSync: enabled })}
                    />
                  </Panel>

                  <Panel title="Hotkeys">
                    <div className="field">
                      <label htmlFor="hk-overlay">Toggle overlay</label>
                      <input
                        id="hk-overlay"
                        value={settings.hotkeys.toggleOverlay}
                        onChange={(e) =>
                          void updateSettings({
                            hotkeys: { ...settings.hotkeys, toggleOverlay: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hk-companion">Open companion</label>
                      <input
                        id="hk-companion"
                        value={settings.hotkeys.openCompanion}
                        onChange={(e) =>
                          void updateSettings({
                            hotkeys: { ...settings.hotkeys, openCompanion: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hk-refresh">Refresh worldstate</label>
                      <input
                        id="hk-refresh"
                        value={settings.hotkeys.refreshWorldstate}
                        onChange={(e) =>
                          void updateSettings({
                            hotkeys: { ...settings.hotkeys, refreshWorldstate: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hk-relics">Scan relic rewards</label>
                      <input
                        id="hk-relics"
                        value={settings.hotkeys.scanRelics}
                        onChange={(e) =>
                          void updateSettings({
                            hotkeys: { ...settings.hotkeys, scanRelics: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hk-dismiss-relics">Dismiss relic popup</label>
                      <input
                        id="hk-dismiss-relics"
                        value={settings.hotkeys.dismissRelics}
                        onChange={(e) =>
                          void updateSettings({
                            hotkeys: { ...settings.hotkeys, dismissRelics: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hk-rivens">Scan riven compare</label>
                      <input
                        id="hk-rivens"
                        value={settings.hotkeys.scanRivens}
                        onChange={(e) =>
                          void updateSettings({
                            hotkeys: { ...settings.hotkeys, scanRivens: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hk-dismiss-rivens">Dismiss riven popup</label>
                      <input
                        id="hk-dismiss-rivens"
                        value={settings.hotkeys.dismissRivens}
                        onChange={(e) =>
                          void updateSettings({
                            hotkeys: { ...settings.hotkeys, dismissRivens: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="hk-layout">Move panels (unlock drag)</label>
                      <input
                        id="hk-layout"
                        value={settings.hotkeys.editLayout}
                        onChange={(e) =>
                          void updateSettings({
                            hotkeys: { ...settings.hotkeys, editLayout: e.target.value },
                          })
                        }
                      />
                    </div>
                    {hotkeyStatus.length > 0 ? (
                      <div className="mod-stack" style={{ marginTop: 12 }}>
                        <p className="muted" style={{ margin: 0 }}>
                          Registration status
                        </p>
                        <ul className="mod-list">
                          {hotkeyStatus.map((hk) => (
                            <li key={hk.id} className="mod-row">
                              <div>
                                <div className="mod-row__title">{HOTKEY_LABELS[hk.id]}</div>
                                <div className="mod-row__meta">{prettyHotkey(hk.requested)}</div>
                              </div>
                              <div className={`mod-row__value ${hk.ok ? 'is-ok' : ''}`}>
                                {hk.ok && hk.registered
                                  ? prettyHotkey(hk.registered)
                                  : 'Not registered'}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    <p className="muted">
                      Press <strong>?</strong> for the cheat sheet. Defaults: overlay Alt+Shift+V,
                      move panels Ctrl+Tab, relics Alt+Shift+F, rivens Alt+Shift+G
                    </p>
                  </Panel>

                  <Panel title="EE.log path" subtitle="Used by Relics, Rivens & Arbitration">
                    <div className="field">
                      <label htmlFor="eelog">Log file</label>
                      <div className="path-row">
                        <input
                          id="eelog"
                          readOnly
                          value={settings.eeLogPath || ''}
                          placeholder="Not set"
                        />
                        <button
                          className="btn"
                          onClick={() => void window.voidlens?.pickEeLogPath()}
                        >
                          Browse
                        </button>
                        <button
                          className="btn ghost"
                          onClick={() => void window.voidlens?.detectEeLogPath()}
                        >
                          Detect
                        </button>
                      </div>
                    </div>
                  </Panel>
                </div>

                <div className="section-gap" />
                <div
                  onFocusCapture={() => patchOnboarding({ inventoryTouched: true })}
                  onClickCapture={() => patchOnboarding({ inventoryTouched: true })}
                >
                  <InventorySettings />
                </div>
                <div className="section-gap" />
                <UpdateSettings />
              </>
            ) : null}

            {tab === 'help' ? (
              <HelpPage
                settings={settings}
                onStartTour={() => setTourOpen(true)}
                onShowHotkeys={() => setHotkeysOpen(true)}
                onResetChecklist={() =>
                  patchOnboarding({
                    checklistDismissed: false,
                    borderlessAck: false,
                    modulesTouched: false,
                    layoutVisited: false,
                    inventoryTouched: false,
                  })
                }
              />
            ) : null}
          </main>
        </div>
      </div>

      <AppTour
        open={tourOpen}
        steps={TOUR_STEPS}
        onTab={(t) => goTab(t as Tab)}
        onClose={(completed) => {
          setTourOpen(false)
          if (completed) patchOnboarding({ tourCompleted: true })
        }}
      />

      <HotkeySheet
        open={hotkeysOpen}
        hotkeys={settings.hotkeys}
        onClose={() => setHotkeysOpen(false)}
      />

      <WhatsNew version={appVersion} open={whatsNewOpen} onDismiss={dismissWhatsNew} />
    </NowProvider>
  )
}
