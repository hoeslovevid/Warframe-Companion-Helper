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
import { useSettings } from '../../hooks/useVoidLens'
import '../foundry/foundry.css'

type Props = {
  enabled: boolean
  onOpenSettings: () => void
  onOpenFoundry?: (uniqueName: string) => void
}

const TIERS = ['all', 'Lith', 'Meso', 'Neo', 'Axi', 'Requiem'] as const
const SEARCH_DEBOUNCE_MS = 220

function normalizeFavorite(s: string): string {
  return s
    .toUpperCase()
    .replace(/['’]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function RelicPlannerPage({ enabled, onOpenSettings, onOpenFoundry }: Props) {
  const { status: inventory } = useInventory()
  const { settings, updateSettings } = useSettings()
  const [ownedOnly, setOwnedOnly] = useState(true)
  const [sort, setSort] = useState<RelicPlannerSort>('missing')
  const [tier, setTier] = useState<string>('all')
  const [prime, setPrime] = useState<FoundryPrimeFilter>('any')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [rows, setRows] = useState<RelicPlannerRow[]>([])
  const [ownedTypes, setOwnedTypes] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [setFarm, setSetFarm] = useState<SetFarmResult | null>(null)
  const [sentMsg, setSentMsg] = useState<string | null>(null)

  const favorites = settings.farmFavorites || []
  const favoritesKey = favorites.join('\0')
  const favoriteNorms = useMemo(
    () => new Set((settings.farmFavorites || []).map(normalizeFavorite).filter(Boolean)),
    [favoritesKey, settings.farmFavorites],
  )

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [search])

  const query = useMemo<RelicPlannerQuery>(
    () => ({ ownedOnly, sort, tier, search: debouncedSearch, prime, favoritesFirst: true }),
    [ownedOnly, sort, tier, debouncedSearch, prime],
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
  }, [enabled, refresh, inventory.revision, inventory.loaded, favoritesKey])

  useEffect(() => {
    if (!enabled || !window.voidlens?.getSetFarm) {
      setSetFarm(null)
      return
    }
    const q = debouncedSearch.trim()
    if (q.length < 3) {
      setSetFarm(null)
      return
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      void window.voidlens!.getSetFarm({ search: q, prime }).then((next) => {
        if (!cancelled) setSetFarm(next)
      })
    }, 80)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [enabled, debouncedSearch, prime, inventory.revision, inventory.loaded])

  const isFavoriteName = useCallback(
    (name: string) => {
      const n = normalizeFavorite(name)
      if (!n || !favoriteNorms.size) return false
      if (favoriteNorms.has(n)) return true
      for (const fav of favoriteNorms) {
        if (n.includes(fav) || fav.includes(n)) return true
      }
      return false
    },
    [favoriteNorms],
  )

  const toggleFavorite = useCallback(
    (name: string) => {
      const n = normalizeFavorite(name)
      if (!n) return
      const existing = favorites.find((f) => normalizeFavorite(f) === n)
      const next = existing
        ? favorites.filter((f) => f !== existing)
        : [...favorites, name]
      void updateSettings({ farmFavorites: next })
    },
    [favorites, updateSettings],
  )

  const sendToOverlay = useCallback(() => {
    void updateSettings({
      modules: { ...settings.modules, relicRecommend: true },
      relicRecommend: {
        sort,
        ownedOnly,
        tier,
        prime,
        favoritesFirst: true,
        limit: 8,
      },
    }).then(() => {
      setSentMsg('Filters sent to Relic Recommend overlay')
      window.setTimeout(() => setSentMsg(null), 2500)
    })
  }, [updateSettings, settings.modules, sort, ownedOnly, tier, prime])

  if (!enabled) {
    return (
      <Panel title="Relic Planner" subtitle="Module disabled">
        <EmptyState
          title="Module off"
          body="Enable Relic Planner under Modules to rank owned relics by missing parts, platinum, or ducats."
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
          browse relics ranked by missing parts, platinum, or ducats. Star rewards as farm favorites.
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
          <h3 className="planner-hero__title">
            {hero.key}
            {hero.hasFavorite ? ' ★' : ''}
          </h3>
          <div className="planner-hero__meta">
            {hero.missingCount > 0 ? (
              <span className="vl-pill is-warn">{hero.missingCount} needed</span>
            ) : (
              <span className="vl-pill is-ok">Set complete</span>
            )}
            {hero.bestPlatinum != null ? (
              <span className="vl-pill is-premium">~{Math.round(hero.bestPlatinum)}p</span>
            ) : null}
            {hero.bestDucats != null ? (
              <span className="vl-pill">{hero.bestDucats}d</span>
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
            <button type="button" className="btn ghost" onClick={sendToOverlay}>
              Send to overlay
            </button>
            <p className="planner-hero__hint">
              {sentMsg
                ? sentMsg
                : loading
                  ? 'Updating ranks…'
                  : `${rows.length} relics · ${ownedTypes} owned types`}
              {error && !sentMsg ? ` · ${error}` : ''}
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
                  ['ducats', 'Ducats'],
                  ['upgradePlat', '↑ Plat'],
                  ['upgradeDucats', '↑ Ducats'],
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
            {favorites.length ? (
              <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                {favorites.length} farm favorite{favorites.length === 1 ? '' : 's'} · starred rewards
                float to the top
              </p>
            ) : null}
            {setFarm ? (
              <p className="muted" style={{ margin: 0, fontSize: '0.75rem' }}>
                Set match: {setFarm.name} · relic list still filters below
              </p>
            ) : null}
            <button type="button" className="btn ghost" onClick={sendToOverlay}>
              Send filters to Relic Recommend overlay
            </button>
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
                    {row.hasFavorite ? '★ ' : ''}
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
                    {row.bestDucats != null ? (
                      <span className="vl-pill">{row.bestDucats}d</span>
                    ) : null}
                    {row.upgradePlatScore != null ? (
                      <span className="vl-pill" title={`Traces to Radiant: ${row.tracesToRadiant ?? '—'}`}>
                        ↑{row.upgradePlatScore}p/t
                      </span>
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
                {detail.refinements && detail.owned > 0 ? (
                  <span className="vl-pill" title="Intact / Exceptional / Flawless / Radiant">
                    I{detail.refinements.intact} · E{detail.refinements.exceptional} · F
                    {detail.refinements.flawless} · R{detail.refinements.radiant}
                  </span>
                ) : null}
                {detail.vaulted ? <span className="vl-pill is-warn">Vaulted</span> : null}
                {detail.bestPlatinum != null ? (
                  <span className="vl-pill is-premium">~{Math.round(detail.bestPlatinum)}p</span>
                ) : null}
                {detail.bestDucats != null ? (
                  <span className="vl-pill">{detail.bestDucats}d</span>
                ) : null}
              </div>
              <div className="foundry-section-title">Rewards</div>
              <ul className="foundry-tree">
                {detail.rewards.map((r) => {
                  const fav = isFavoriteName(r.name)
                  return (
                    <li key={r.name}>
                      <div style={{ flex: 1 }}>
                        <span>
                          {r.name}
                          {fav ? ' ★' : ''}
                        </span>
                        <div className="muted" style={{ fontSize: '0.75rem' }}>
                          {r.rarity}
                          {r.chance != null ? ` · ${r.chance}%` : ''}
                          {r.platinum != null ? ` · ~${Math.round(r.platinum)}p` : ''}
                          {r.ducats != null ? ` · ${r.ducats}d` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn ghost"
                        style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        title={fav ? 'Remove farm favorite' : 'Star as farm favorite'}
                        onClick={() => toggleFavorite(r.name)}
                      >
                        {fav ? '★' : '☆'}
                      </button>
                      <span className={r.needed ? 'is-missing' : 'is-ok'}>
                        {r.needed ? 'Needed' : `Owned ×${r.owned}`}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </section>
      </div>
    </>
  )
}
