import { useMemo, useState } from 'react'
import { MODULE_META, ModuleId } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { ToggleRow } from '../../components/ToggleRow'
import { InventorySettings } from '../../components/InventorySettings'
import { UpdateSettings } from '../../components/UpdateSettings'
import { NowProvider } from '../../hooks/NowContext'
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

type Tab = 'dashboard' | 'modules' | 'layout' | 'settings'

const TIER_OPTIONS = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem']

export function CompanionApp() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const { settings, ready, updateSettings, setModuleEnabled } = useSettings()
  const { data, loading, error, refresh } = useWorldstate()

  const enabledIds = useMemo(
    () => (Object.keys(settings.modules) as ModuleId[]).filter((id) => settings.modules[id]),
    [settings.modules],
  )

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
            onClick={() => setTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-btn ${tab === 'modules' ? 'active' : ''}`}
            onClick={() => setTab('modules')}
          >
            Modules
          </button>
          <button
            className={`nav-btn ${tab === 'layout' ? 'active' : ''}`}
            onClick={() => setTab('layout')}
          >
            Layout
          </button>
          <button
            className={`nav-btn ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
          >
            Settings
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
              <div className="toolbar">
                <button className="btn primary" onClick={() => void refresh()}>
                  Refresh worldstate
                </button>
                <button
                  className="btn"
                  onClick={() => void window.voidlens?.toggleOverlay()}
                >
                  Toggle overlay
                </button>
                <button className="btn ghost" onClick={() => setTab('layout')}>
                  Edit layout
                </button>
                <button
                  className="btn ghost"
                  onClick={() =>
                    void updateSettings({ layoutEditMode: !settings.layoutEditMode })
                  }
                >
                  {settings.layoutEditMode
                    ? 'Lock overlay interaction'
                    : 'Unlock overlay interaction'}
                </button>
                <span className="pill">
                  <span className={`status-dot ${settings.overlayVisible ? '' : 'off'}`} />
                  Overlay {settings.overlayVisible ? 'visible' : 'hidden'}
                </span>
                <span className="pill muted">
                  {loading
                    ? 'Updating…'
                    : data.fetchedAt
                      ? `Updated ${new Date(data.fetchedAt).toLocaleTimeString()}`
                      : 'No data yet'}
                </span>
              </div>
              {error ? <p className="muted">Worldstate error: {error}</p> : null}

              <Panel title="Seeing FPS / Frame Time?" subtitle="That is not part of Everything Warframe">
                <p className="muted" style={{ marginTop: 0 }}>
                  Everything Warframe only draws Cycles, Fissures, Baro, etc. An FPS / Frame Time widget is
                  almost always Xbox Game Bar, NVIDIA Overlay, or MSI Afterburner / RTSS.
                </p>
                <ul className="mod-bullets">
                  <li>
                    Xbox Game Bar: press <strong>Win+G</strong> → Performance → turn off FPS / close
                    the widget. Or Settings → Gaming → Game Bar → Off.
                  </li>
                  <li>NVIDIA: Alt+Z → settings → HUD / FPS counter Off.</li>
                  <li>Steam: Alt+Shift+F (or Steam → In-Game → disable FPS counter).</li>
                </ul>
              </Panel>

              <div style={{ height: 16 }} />

              <div className="grid-2">
                {enabledIds.includes('cycles') ? <CyclesPanel cycles={data.cycles} /> : null}
                {enabledIds.includes('fissures') ? (
                  <FissuresPanel fissures={data.fissures} tiers={settings.fissureTiers} />
                ) : null}
                {enabledIds.includes('baro') ? <BaroPanel baro={data.baro} /> : null}
                {enabledIds.includes('nightwave') ? (
                  <NightwavePanel nightwave={data.nightwave} />
                ) : null}
                {enabledIds.includes('relics') ? <RelicsPanel /> : null}
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
                      onChange={(enabled) => void setModuleEnabled(id, enabled)}
                    />
                  )
                })}
              </Panel>

              <div style={{ height: 16 }} />

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
                  Appearance, hotkeys, inventory sync, and updates. Inventory stays local and powers
                  “needed for set” relic tags.
                </p>
              </header>

              <div className="grid-2">
                <Panel title="Appearance">
                  <div className="field">
                    <label htmlFor="opacity">Overlay opacity ({settings.opacity.toFixed(2)})</label>
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
                    label="In-game interaction unlock"
                    description={`Like WFHelper: ${prettyHotkey(settings.hotkeys.editLayout)} unlocks click-through so you can drag panels. Prefer the Layout tab for a mock preview.`}
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
                    <label htmlFor="hk-layout">Unlock overlay interaction (drag)</label>
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
                    Use Electron accelerator syntax. Defaults: overlay Alt+Shift+V, unlock drag
                    Ctrl+Tab (WFHelper-style), relics Alt+Shift+F
                  </p>
                </Panel>

                <Panel title="EE.log path" subtitle="Used by Relics & Arbitration (Phase 2/3)">
                  <div className="field">
                    <label htmlFor="eelog">Log file</label>
                    <div className="path-row">
                      <input id="eelog" readOnly value={settings.eeLogPath || ''} placeholder="Not set" />
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
              <InventorySettings />
              <div className="section-gap" />
              <UpdateSettings />
            </>
          ) : null}
        </main>
      </div>
    </div>
    </NowProvider>
  )
}
