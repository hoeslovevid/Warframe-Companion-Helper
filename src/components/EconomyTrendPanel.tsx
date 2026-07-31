import { useCallback, useEffect, useState } from 'react'
import type { EconomyTrendResult } from '../../shared/types'
import { Panel } from './Panel'

const empty: EconomyTrendResult = { snapshots: [], latest: null, delta: null }

function fmt(n: number) {
  return n.toLocaleString()
}

function deltaLabel(n: number) {
  if (n === 0) return '±0'
  return n > 0 ? `+${fmt(n)}` : fmt(n)
}

export function EconomyTrendPanel() {
  const [trend, setTrend] = useState<EconomyTrendResult>(empty)

  const refresh = useCallback(async () => {
    if (!window.voidlens?.getEconomyTrend) return
    setTrend(await window.voidlens.getEconomyTrend())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!trend.latest) {
    return (
      <Panel title="Economy" subtitle="Credits · ducats · platinum after inventory sync">
        <p className="muted">Sync inventory to start a local currency trend.</p>
      </Panel>
    )
  }

  const { latest, delta, snapshots } = trend
  const pts = snapshots
    .slice(0, 24)
    .reverse()
    .map((s) => s.platinum)
  const maxP = Math.max(1, ...pts)

  return (
    <Panel
      title="Economy"
      subtitle={`${snapshots.length} snapshot${snapshots.length === 1 ? '' : 's'} · local only`}
      actions={
        <button className="btn ghost" type="button" onClick={() => void refresh()}>
          Refresh
        </button>
      }
    >
      <div className="economy-grid">
        <div>
          <div className="muted" style={{ fontSize: '0.72rem' }}>
            Credits
          </div>
          <strong>{fmt(latest.credits)}</strong>
          {delta ? <div className="muted">{deltaLabel(delta.credits)}</div> : null}
        </div>
        <div>
          <div className="muted" style={{ fontSize: '0.72rem' }}>
            Ducats
          </div>
          <strong>{fmt(latest.ducats)}</strong>
          {delta ? <div className="muted">{deltaLabel(delta.ducats)}</div> : null}
        </div>
        <div>
          <div className="muted" style={{ fontSize: '0.72rem' }}>
            Platinum
          </div>
          <strong>{fmt(latest.platinum)}</strong>
          {delta ? <div className="muted">{deltaLabel(delta.platinum)}</div> : null}
        </div>
      </div>
      {pts.length > 1 ? (
        <div className="economy-spark" aria-hidden>
          {pts.map((p, i) => (
            <span
              key={i}
              style={{ height: `${Math.max(8, Math.round((p / maxP) * 100))}%` }}
              title={`${p}p`}
            />
          ))}
        </div>
      ) : null}
    </Panel>
  )
}
