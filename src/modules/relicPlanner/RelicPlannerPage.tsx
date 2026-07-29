import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  FoundryPrimeFilter,
  RelicPlannerQuery,
  RelicPlannerRow,
  RelicPlannerSort,
  SetFarmResult,
} from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
import { Panel } from '../../components/Panel'
import { SetFarmPanel } from '../../components/SetFarmPanel'
import { useInventory } from '../../hooks/useInventory'
import '../foundry/foundry.css'

type Props = {
  enabled: boolean
  onOpenSettings: () => void
  onOpenFoundry?: (uniqueName: string) => void
}

const TIERS = ['all', 'Lith', 'Meso', 'Neo', 'Axi', 'Requiem'] as const

export function RelicPlannerPage({ enabled, onOpenSettings, onOpenFoundry }: Props) {
  const { status: inventory } = useInventory()
  const [ownedOnly, setOwnedOnly] = useState(true)
  const [sort, setSort] = useState<RelicPlannerSort>('missing')
  const [tier, setTier] = useState<string>('all')
  const [prime, setPrime] = useState<FoundryPrimeFilter>('any')
  const [search, setSearch] = useState('')
  const [rows, setRows] = useState<RelicPlannerRow[]>([])
  const [ownedTypes, setOwnedTypes] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [setFarm, setSetFarm] = useState<SetFarmResult | null>(null)

  const query = useMemo<RelicPlannerQuery>(
    () => ({ ownedOnly, sort, tier, search, prime }),
    [ownedOnly, sort, tier, search, prime],
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

  useEffect(() => {
    if (!enabled || !window.voidlens?.getSetFarm) {
      setSetFarm(null)
      return
    }
    const q = search.trim()
    if (q.length < 3) {
      setSetFarm(null)
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      void window.voidlens!.getSetFarm({ search: q, prime }).then((next) => {
        if (!cancelled) setSetFarm(next)
      })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [enabled, search, prime, inventory.revision, inventory.loaded])

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
  const hero = rows[0] || null
  const inventoryReady = inventory.loaded && inventory.uniqueCount > 0

  return (
    <>
      <header className="page-header">
        <h2 className="page-title">Relic Planner</h2>
        <div className="page-title-rule" />
        <p className="page-desc">
          Search a set like Ember Prime for a parts checklist and which owned relics drop gaps — or
          browse relics ranked by missing parts and platinum.
        </p>
      </header>

      {!inventoryReady ? (
        <Panel title="Inventory required" subtitle="Sync once to unlock owned-relic ranking">
          <EmptyState
            title="No inventory loaded"
            body="Relic ownership and missing-part scores come from your inventory export."
            actions={
              <button className="btn primary" onClick={onOpenSettings}>
                Sync inventory
              </button>
            }
          />
        </Panel>
      ) : null}

      {setFarm && !setFarm.error ? (
        <SetFarmPanel
          farm={setFarm}
          compact
          onOpenFoundry={onOpenFoundry}
        />
      ) : null}

      {inventoryReady && hero && !setFarm ? (
        <section className="planner-hero">
          <p className="planner-hero__eyebrow">Next best relic</p>
          <h3 className="planner-hero__title">{hero.key}</h3>
          <div className="planner-hero__meta">
            {hero.missingCount > 0 ? (
              <span className="vl-pill is-warn">{hero.missingCount} needed</span>
            ) : (
              <span className="vl-pill is-ok">Set complete</span>
            )}
            {hero.bestPlatinum != null ? (
              <span className="vl-pill is-premium">~{Math.round(hero.bestPlatinum)}p</span>
            ) : null}
            {hero.owned > 0 ? <span className="vl-pill">Owned ×{hero.owned}</span> : null}
            {hero.vaulted ? <span className="vl-pill is-warn">Vaulted</span> : null}
          </div>
          <div className="planner-hero__actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => setSelected(hero.key)}
            >
              Open details
            </button>
            <p className="planner-hero__hint">
              {loading
                ? 'Updating ranks…'
                : `${rows.length} relics · ${ownedTypes} owned types`}
              {error ? ` · ${error}` : ''}
            </p>
          </div>
        </section>
      ) : null}

      <div className="planner-layout">
        <aside className="foundry-sidebar">
          <div className="foundry-sidebar__filters">
            <input
              className="foundry-search"
              placeholder="Search set, relic, or reward…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="vl-segment vl-segment--wrap" role="group" aria-label="Prime filter">
              <button
                type="button"
                className={`vl-segment__btn ${prime === 'any' ? 'is-on' : ''}`}
                onClick={() => setPrime('any')}
              >
                All
              </button>
              <button
                type="button"
                className={`vl-segment__btn ${prime === 'prime' ? 'is-on' : ''}`}
                onClick={() => setPrime(prime === 'prime' ? 'any' : 'prime')}
              >
                Prime
              </button>
              <button
                type="button"
                className={`vl-segment__btn ${prime === 'normal' ? 'is-on' : ''}`}
                onClick={() => setPrime(prime === 'normal' ? 'any' : 'normal')}
              >
                Non-Prime
              </button>
            </div>
            <div className="vl-segment vl-segment--wrap" role="group" aria-label="Ownership">
              <button
                type="button"
                className={`vl-segment__btn ${ownedOnly ? 'is-on' : ''}`}
                onClick={() => setOwnedOnly(true)}
              >
                Owned
              </button>
              <button
                type="button"
                className={`vl-segment__btn ${!ownedOnly ? 'is-on' : ''}`}
                onClick={() => setOwnedOnly(false)}
              >
                All
              </button>
            </div>
            <div className="vl-segment vl-segment--wrap" role="group" aria-label="Sort">
              {(
                [
                  ['missing', 'Missing'],
                  ['platinum', 'Plat'],
                  ['owned', 'Owned'],
                  ['name', 'Name'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`vl-segment__btn ${sort === id ? 'is-on' : ''}`}
                  onClick={() => setSort(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="field" style={{ margin: 0 }}>
              <span style={{ fontSize: 'var(--vl-type-meta)' }}>Tier</span>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                style={{
                  border: '1px solid var(--vl-input-border)',
                  background: 'var(--vl-input-bg)',
                  color: 'var(--vl-frost)',
                  borderRadius: 'var(--vl-radius-sm)',
                  padding: '8px 10px',
                }}
              >
                {TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t === 'all' ? 'Any tier' : t}
                  </option>
                ))}
              </select>
            </label>
            {setFarm ? (
              <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                Set match: {setFarm.name} · relic list still filters below
              </p>
            ) : null}
          </div>
          <ul className="foundry-list vl-stagger">
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
                      ? 'No owned relics matched. Sync inventory, or switch to All.'
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
            <div key={detail.key} className="vl-expand-in">
              <h3>{detail.key}</h3>
              <div className="foundry-list__meta" style={{ marginBottom: 8 }}>
                <span className="vl-pill">{detail.tier}</span>
                <span className="vl-pill">Owned ×{detail.owned}</span>
                {detail.vaulted ? <span className="vl-pill is-warn">Vaulted</span> : null}
                {detail.bestPlatinum != null ? (
                  <span className="vl-pill is-premium">~{Math.round(detail.bestPlatinum)}p</span>
                ) : null}
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
            </div>
          )}
        </section>
      </div>
    </>
  )
}
