import { useCallback, useEffect, useMemo, useState } from 'react'
import { MODULE_META, ModuleId } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { ToggleRow } from '../../components/ToggleRow'
import { InventorySettings } from '../../components/InventorySettings'
import { UpdateSettings } from '../../components/UpdateSettings'
import { GettingStarted } from '../../components/GettingStarted'
import { AppTour, TourStep } from '../../components/AppTour'
import { StatusStrip } from '../../components/StatusStrip'
import { HotkeySheet } from '../../components/HotkeySheet'
import { HelpPage } from '../../components/HelpPage'
import { NowProvider } from '../../hooks/NowContext'
import { useInventory } from '../../hooks/useInventory'
import { useSettings, useWorldstate } from '../../hooks/useVoidLens'
import { CyclesPanel } from '../../modules/cycles/CyclesPanel'
import { FissuresPanel } from '../../modules/fissures/FissuresPanel'
import { BaroPanel } from '../../modules/baro/BaroPanel'
import { NightwavePanel } from '../../modules/nightwave/NightwavePanel'
import { RelicsPanel } from '../../modules/relics/RelicsPanel'
import { ArbitrationPanel } from '../../modules/arbitration/ArbitrationPanel'
import { LayoutEditor } from './LayoutEditor'
import { prettyHotkey } from '../../lib/hotkey'
import '../../styles/companion.css'
import '../../modules/cycles/module.css'

type Tab = 'dashboard' | 'modules' | 'layout' | 'settings' | 'help'

const TIER_OPTIONS = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem']

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
    target: 'nav-layout',
    tab: 'layout',
    title: 'Layout',
    body: 'Drag every panel on the mock monitor — including Relic Rewards. Try a preset if you want a quick start.',
  },
  {
    target: 'toolbar-hotkeys',
    tab: 'dashboard',
    title: 'Hotkeys',
    body: 'Press ? anytime for the cheat sheet. In-game: toggle overlay, unlock drag, and scan relics.',
  },
  {
    target: 'nav-help',
    tab: 'help',
    title: 'Help',
    body: 'Replay this tour, reopen Getting started, or jump to the website and update notes.',
  },
]

export function CompanionApp() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [tourOpen, setTourOpen] = useState(false)
  const [hotkeysOpen, setHotkeysOpen] = useState(false)
  const { settings, ready, updateSettings, setModuleEnabled } = useSettings()
  const { data, loading, error, refresh } = useWorldstate()
  const { status: inventory } = useInventory()

  const enabledIds = useMemo(
    () => (Object.keys(settings.modules) as ModuleId[]).filter((id) => settings.modules[id]),
    [settings.modules],
  )

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
            <button
              className={`nav-btn ${tab === 'layout' ? 'active' : ''}`}
              data-tour="nav-layout"
              title="Drag panels on a mock monitor"
              onClick={() => goTab('layout')}
            >
              Layout
            </button>
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

                <StatusStrip
                  settings={settings}
                  inventory={inventory}
                  worldstateOk={Boolean(data.fetchedAt) && !error}
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
                  <span className="pill muted">
                    {loading
                      ? 'Updating…'
                      : data.fetchedAt
                        ? `Updated ${new Date(data.fetchedAt).toLocaleTimeString()}`
                        : 'No data yet'}
                  </span>
                </div>
                {error ? <p className="muted">Worldstate error: {error}</p> : null}

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
                    <FissuresPanel fissures={data.fissures} tiers={settings.fissureTiers} />
                  ) : null}
                  {enabledIds.includes('baro') ? <BaroPanel baro={data.baro} /> : null}
                  {enabledIds.includes('nightwave') ? (
                    <NightwavePanel nightwave={data.nightwave} />
                  ) : null}
                  {enabledIds.includes('relics') ? (
                    <RelicsPanel scanHotkey={prettyHotkey(settings.hotkeys.scanRelics)} />
                  ) : null}
                  {enabledIds.includes('arbitration') ? (
                    <ArbitrationPanel arbitration={data.arbitration} />
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
                    Choose what appears in the overlay and dashboard. Relic scanning and inventory
                    tags are live; arbitration analytics come later.
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
                </Panel>
              </>
            ) : null}

            {tab === 'layout' ? (
              <LayoutEditor
                settingsModules={settings.modules}
                panelAnchors={settings.panelAnchors}
                opacity={settings.opacity}
                overlayScale={settings.overlayScale}
                fissureTiers={settings.fissureTiers}
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

                <div className="grid-2">
                  <Panel title="Appearance">
                    <div className="field">
                      <label htmlFor="opacity">
                        Overlay opacity ({settings.opacity.toFixed(2)})
                      </label>
                      <input
                        id="opacity"
                        type="range"
                        min={0.4}
                        max={1}
                        step={0.01}
                        value={settings.opacity}
                        onChange={(e) =>
                          void updateSettings({ opacity: Number(e.target.value) })
                        }
                      />
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
                    <p className="muted">
                      Press <strong>?</strong> for the cheat sheet. Defaults: overlay Alt+Shift+V,
                      move panels Ctrl+Tab, relics Alt+Shift+F
                    </p>
                  </Panel>

                  <Panel title="EE.log path" subtitle="Used by Relics & Arbitration">
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
    </NowProvider>
  )
}
