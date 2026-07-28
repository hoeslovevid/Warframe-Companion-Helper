import { useCallback, useEffect, useMemo, useState } from 'react'
import type { RelicPlannerQuery, RelicPlannerRow, RelicPlannerSort } from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
import { Panel } from '../../components/Panel'
import { useInventory } from '../../hooks/useInventory'
import '../foundry/foundry.css'

type Props = {
  enabled: boolean
  onOpenSettings: () => void
}

const TIERS = ['all', 'Lith', 'Meso', 'Neo', 'Axi', 'Requiem'] as const

export function RelicPlannerPage({ enabled, onOpenSettings }: Props) {
  const { status: inventory } = useInventory()
  const [ownedOnly, setOwnedOnly] = useState(true)
  const [sort, setSort] = useState<RelicPlannerSort>('missing')
  const [tier, setTier] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<RelicPlannerRow[]>([])
  const [ownedTypes, setOwnedTypes] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const query = useMemo<RelicPlannerQuery>(
    () => ({ ownedOnly, sort, tier, search }),
    [ownedOnly, sort, tier, search],
  )

  const refresh = useCallback(async () => {
    if (!window.voidlens?.getRelicPlanner) return
    setLoading(true)
    setError(null)
    try {
      const next = await window.voidlens.getRelicPlanner(query)
      setRows(next.rows)
      setOwnedTypes(next.ownedRelicTypes)
      if (next.error) setError(next.error)
      setSelected((prev) => {
        if (prev && next.rows.some((r) => r.key === prev)) return prev
        return next.rows[0]?.key || null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load relic planner')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    if (!enabled) return
    const t = window.setTimeout(() => void refresh(), 120)
    return () => window.clearTimeout(t)
  }, [enabled, refresh, inventory.revision, inventory.loaded])

  if (!enabled) {
    return (
      <Panel title="Relic Planner" subtitle="Module disabled">
        <EmptyState
          title="Module off"
          body="Enable Relic Planner under Modules to rank owned relics by missing parts and platinum."
        />
      </Panel>
    )
  }

  const detail = rows.find((r) => r.key === selected) || null
  const inventoryReady = inventory.loaded && inventory.uniqueCount > 0

  return (
    <>
      <header className="page-header">
        <h2 className="page-title">Relic Planner</h2>
        <div className="page-title-rule" />
        <p className="page-desc">
          Rank relics by missing set parts and platinum value. Sync inventory so owned counts and
          needed tags stay accurate.
        </p>
      </header>

      {!inventoryReady ? (
        <Panel title="Inventory required" subtitle="Sync once to unlock owned-relic ranking">
          <EmptyState
            title="No inventory loaded"
            body="Relic ownership and missing-part scores come from your inventory export."
            actions={
              <button className="btn primary" onClick={onOpenSettings}>
                Open inventory settings
              </button>
            }
          />
        </Panel>
      ) : null}

      <div className="section-gap" />

      <div className="foundry-layout">
        <aside className="foundry-sidebar">
          <div className="foundry-sidebar__filters">
            <input
              className="foundry-search"
              placeholder="Search relic or reward…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="foundry-chips">
              <button
                type="button"
                className={`foundry-chip ${ownedOnly ? 'is-on' : ''}`}
                onClick={() => setOwnedOnly(true)}
              >
                Owned only
              </button>
              <button
                type="button"
                className={`foundry-chip ${!ownedOnly ? 'is-on' : ''}`}
                onClick={() => setOwnedOnly(false)}
              >
                All relics
              </button>
            </div>
            <div className="foundry-chips">
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`foundry-chip ${tier === t ? 'is-on' : ''}`}
                  onClick={() => setTier(t)}
                >
                  {t === 'all' ? 'Any tier' : t}
                </button>
              ))}
            </div>
            <div className="foundry-chips">
              {(
                [
                  ['missing', 'Missing'],
                  ['platinum', 'Platinum'],
                  ['owned', 'Owned'],
                  ['name', 'Name'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`foundry-chip ${sort === id ? 'is-on' : ''}`}
                  onClick={() => setSort(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
              {loading
                ? 'Loading…'
                : `${rows.length} relics · ${ownedTypes} owned types`}
              {error ? ` · ${error}` : ''}
            </p>
          </div>
          <ul className="foundry-list">
            {rows.map((row) => (
              <li key={row.key}>
                <button
                  type="button"
                  className={selected === row.key ? 'is-selected' : ''}
                  onClick={() => setSelected(row.key)}
                >
                  <span className="foundry-list__name">
                    {row.key}
                    {row.owned > 0 ? ` ×${row.owned}` : ''}
                  </span>
                  <span className="foundry-list__meta">
                    {row.missingCount > 0 ? (
                      <span className="vl-pill is-warn">{row.missingCount} needed</span>
                    ) : (
                      <span className="vl-pill is-ok">Complete</span>
                    )}
                    {row.bestPlatinum != null ? (
                      <span className="vl-pill">~{Math.round(row.bestPlatinum)}p</span>
                    ) : null}
                    {row.vaulted ? <span className="vl-pill is-warn">Vaulted</span> : null}
                  </span>
                </button>
              </li>
            ))}
            {!loading && rows.length === 0 ? (
              <li style={{ padding: '8px 12px' }}>
                <EmptyState
                  title="No relics"
                  body={
                    ownedOnly
                      ? 'No owned relics matched. Sync inventory, or switch to All relics.'
                      : 'Try clearing search or tier filters.'
                  }
                />
              </li>
            ) : null}
          </ul>
        </aside>

        <section className="foundry-detail">
          {!detail ? (
            <EmptyState title="Pick a relic" body="Select a relic to see its rewards and prices." />
          ) : (
            <>
              <h3>{detail.key}</h3>
              <div className="foundry-list__meta" style={{ marginBottom: 8 }}>
                <span className="vl-pill">{detail.tier}</span>
                <span className="vl-pill">Owned ×{detail.owned}</span>
                {detail.vaulted ? <span className="vl-pill is-warn">Vaulted</span> : null}
              </div>
              <div className="foundry-section-title">Rewards</div>
              <ul className="foundry-tree">
                {detail.rewards.map((r) => (
                  <li key={r.name}>
                    <div style={{ flex: 1 }}>
                      <span>{r.name}</span>
                      <div className="muted" style={{ fontSize: '0.75rem' }}>
                        {r.rarity}
                        {r.chance != null ? ` · ${r.chance}%` : ''}
                        {r.platinum != null ? ` · ~${Math.round(r.platinum)}p` : ''}
                      </div>
                    </div>
                    <span className={r.needed ? 'is-missing' : 'is-ok'}>
                      {r.needed ? 'Needed' : `Owned ×${r.owned}`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  )
}
