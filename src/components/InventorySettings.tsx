import { useEffect } from 'react'
import { useInventory } from '../hooks/useInventory'
import { Panel } from './Panel'
import { ToggleRow } from './ToggleRow'
import '../modules/cycles/module.css'
import '../modules/baro/baro.css'

function formatWhen(iso: string) {
  if (!iso) return 'Never'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export function InventorySettings() {
  const {
    status,
    busy,
    message,
    refresh,
    setConsent,
    detect,
    useCandidate,
    syncFromGame,
    browse,
    clear,
  } = useInventory()

  // Re-check Warframe process while this panel is open (Linux AppImage used to
  // false-positive as "Running").
  useEffect(() => {
    const poll = window.setInterval(() => {
      void refresh()
    }, 4000)
    return () => window.clearInterval(poll)
  }, [refresh])

  return (
    <Panel
      title="Inventory"
      subtitle="Needed for relic “missing part” tags"
      className="baro-panel--wide"
    >
      <div className="mod-stack">
        <div className="mod-stat">
          <span className="mod-stat__label">Status</span>
          <span className={`mod-stat__value ${status.loaded ? 'is-ok' : ''}`}>
            {status.loaded
              ? `${status.uniqueCount} unique · ${status.itemCount} total`
              : 'Not loaded'}
          </span>
        </div>
        <div className="mod-stat">
          <span className="mod-stat__label">Source</span>
          <span className="mod-stat__value">{status.source === 'none' ? '—' : status.source}</span>
        </div>
        <div className="mod-stat">
          <span className="mod-stat__label">Last sync</span>
          <span className={`mod-stat__value ${status.stale ? '' : 'is-ok'}`}>
            {formatWhen(status.lastSynced)}
            {status.loaded ? (status.stale ? ' · stale' : ' · fresh') : ''}
          </span>
        </div>
        <div className="mod-stat">
          <span className="mod-stat__label">Warframe</span>
          <span className={`mod-stat__value ${status.warframeRunning ? 'is-ok' : ''}`}>
            {status.warframeRunning ? 'Running' : 'Not running'}
          </span>
        </div>
        {status.path ? <p className="muted">File: {status.path}</p> : null}

        {status.stale && status.loaded ? (
          <p className="muted" style={{ color: '#d8c48a' }}>
            Inventory is stale — Foundry / relic “owned” tags may be wrong until you sync again.
          </p>
        ) : null}

        <ToggleRow
          label="Allow game inventory sync"
          description={
            status.platform === 'linux'
              ? 'With permission, Everything Warframe runs warframe-api-helper inside your Warframe Proton prefix (via Proton’s wine) to download inventory locally. May conflict with Warframe TOS — use at your own risk.'
              : 'With permission, Everything Warframe can run warframe-api-helper to read a short-lived session token from the running game (not your password), download your inventory, and store it locally. Community tools warn this may conflict with Warframe TOS — use at your own risk.'
          }
          checked={status.consent}
          onChange={(v) => void setConsent(v)}
        />

        <div className="toolbar">
          <button
            className="btn primary"
            disabled={busy || !status.consent}
            onClick={() => void syncFromGame()}
          >
            {busy ? 'Working…' : 'Sync from running game'}
          </button>
          <button className="btn" disabled={busy} onClick={() => void detect()}>
            Find existing exports
          </button>
          <button className="btn ghost" disabled={busy} onClick={() => void browse()}>
            Browse file…
          </button>
          <button className="btn ghost" disabled={busy || !status.loaded} onClick={() => void clear()}>
            Clear
          </button>
        </div>

        {status.platform === 'linux' ? (
          <p className="muted">
            {status.protonPlay
              ? 'Steam/Proton Warframe prefix detected. Sync uses Proton wine while you are logged in. If sync says gruzzle failed, check Linux health → Memory access (ptrace) above.'
              : 'Launch Warframe once via Steam so the Proton prefix is created, or import inventory.json manually.'}
          </p>
        ) : null}

        {!status.consent ? (
          <p className="muted">
            Enable permission above to sync automatically. Or import an existing{' '}
            <code>inventory.json</code> / AlecaFrame <code>lastData.dat</code>.
          </p>
        ) : (
          <p className="muted">
            Log into Warframe first, then sync. Everything Warframe downloads Sainan’s warframe-api-helper into
            app data on first use{status.helperReady ? ' (already downloaded)' : ''}.
          </p>
        )}

        {message ? <p className="muted">{message}</p> : null}

        {status.candidates.length > 0 ? (
          <div className="baro-inv">
            <div className="baro-inv__head">
              <span>Detected sources</span>
              <span></span>
              <span></span>
            </div>
            <ul className="mod-list">
              {status.candidates.map((c) => (
                <li key={c.path} className="mod-row">
                  <div>
                    <div className="mod-row__title">{c.label}</div>
                    <div className="mod-row__meta">
                      {c.source} · {c.mtime ? new Date(c.mtime).toLocaleString() : 'unknown time'}
                    </div>
                    <div className="mod-row__meta">{c.path}</div>
                  </div>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => void useCandidate(c.path)}
                  >
                    Use
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Panel>
  )
}
