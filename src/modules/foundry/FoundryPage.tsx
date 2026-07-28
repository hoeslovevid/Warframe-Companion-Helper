import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  FoundryCategory,
  FoundryListFilters,
  FoundryListItem,
  FoundryScopeFilter,
  FoundryTreeNode,
  FoundryTreeResult,
  RelicDropSource,
} from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
import { Panel } from '../../components/Panel'
import { useInventory } from '../../hooks/useInventory'
import { formatDropSourcesLine } from '../../lib/tradeClipboard'
import './foundry.css'

type Props = {
  enabled: boolean
  onOpenSettings: () => void
}

const CATEGORIES: Array<{ id: FoundryCategory | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'warframe', label: 'Warframes' },
  { id: 'primary', label: 'Primary' },
  { id: 'secondary', label: 'Secondary' },
  { id: 'melee', label: 'Melee' },
  { id: 'companion', label: 'Companions' },
]

function formatBuildTime(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h >= 24) {
    const d = Math.floor(h / 24)
    const rh = h % 24
    return rh ? `${d}d ${rh}h` : `${d}d`
  }
  if (h) return m ? `${h}h ${m}m` : `${h}h`
  return `${Math.max(1, m)}m`
}

function formatCredits(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

function TreeNodes({ nodes }: { nodes: FoundryTreeNode[] }) {
  if (!nodes.length) return null
  return (
    <ul className="foundry-tree">
      {nodes.map((n) => (
        <li key={`${n.uniqueName}-${n.required}`}>
          <div style={{ flex: 1 }}>
            <span>{n.name}</span>
            {n.children.length ? <TreeNodes nodes={n.children} /> : null}
          </div>
          <span className={n.missing > 0 ? 'is-missing' : 'is-ok'}>
            {n.owned}/{n.required}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function FoundryPage({ enabled, onOpenSettings }: Props) {
  const { status: inventory } = useInventory()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<FoundryCategory | 'all'>('all')
  const [prime, setPrime] = useState<FoundryListFilters['prime']>('any')
  const [scope, setScope] = useState<FoundryScopeFilter>('inventory')
  const [owned, setOwned] = useState<FoundryListFilters['owned']>('any')
  const [ready, setReady] = useState<FoundryListFilters['ready']>('any')
  const [items, setItems] = useState<FoundryListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [tree, setTree] = useState<FoundryTreeResult | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [partDrops, setPartDrops] = useState<Record<string, RelicDropSource[]>>({})
  const [dropsLoading, setDropsLoading] = useState(false)

  const filters = useMemo<FoundryListFilters>(
    () => ({
      search,
      category,
      prime,
      scope,
      owned,
      ready,
      mastery: 'any',
      vaulted: 'any',
    }),
    [search, category, prime, scope, owned, ready],
  )

  const refreshList = useCallback(async () => {
    if (!window.voidlens?.getFoundryItems) return
    setLoading(true)
    setError(null)
    try {
      const next = await window.voidlens.getFoundryItems(filters)
      setItems(next)
      setSelected((prev) => {
        if (prev && next.some((i) => i.uniqueName === prev)) return prev
        return next[0]?.uniqueName || null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load foundry catalog')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    if (!enabled) return
    const t = window.setTimeout(() => void refreshList(), 120)
    return () => window.clearTimeout(t)
  }, [
    enabled,
    refreshList,
    inventory.lastSynced,
    inventory.uniqueCount,
    inventory.itemCount,
    inventory.revision,
    inventory.path,
    inventory.loaded,
  ])

  useEffect(() => {
    if (!enabled || !selected || !window.voidlens?.getFoundryTree) {
      setTree(null)
      return
    }
    let cancelled = false
    setTreeLoading(true)
    void window.voidlens.getFoundryTree(selected).then((next) => {
      if (!cancelled) {
        setTree(next)
        setTreeLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [
    enabled,
    selected,
    inventory.lastSynced,
    inventory.uniqueCount,
    inventory.itemCount,
    inventory.revision,
    inventory.path,
  ])

  useEffect(() => {
    if (!enabled || !tree?.totals?.length || !window.voidlens?.getDropSources) {
      setPartDrops({})
      return
    }
    let cancelled = false
    setDropsLoading(true)
    const missing = tree.totals.filter((t) => t.missing > 0).slice(0, 10)
    void Promise.all(
      missing.map(async (line) => {
        const src = await window.voidlens!.getDropSources(line.name)
        return [line.uniqueName, src] as const
      }),
    ).then((entries) => {
      if (cancelled) return
      const next: Record<string, RelicDropSource[]> = {}
      for (const [key, src] of entries) next[key] = src
      setPartDrops(next)
      setDropsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [enabled, tree?.totals])

  if (!enabled) {
    return (
      <Panel title="Foundry Planner" subtitle="Module disabled">
        <EmptyState
          title="Module off"
          body="Enable Foundry Planner under Modules to browse recipes and crafting trees."
        />
      </Panel>
    )
  }

  const detail = tree?.item
  const inventoryReady = inventory.loaded && inventory.uniqueCount > 0

  return (
    <>
      <header className="page-header">
        <h2 className="page-title">Foundry</h2>
        <div className="page-title-rule" />
        <p className="page-desc">
          Defaults to gear you own plus anything ready to craft from your inventory. Switch to
          Browse all only when you need the full catalog.
        </p>
      </header>

      {!inventoryReady ? (
        <Panel title="Inventory required" subtitle="Sync once to unlock craft readiness">
          <EmptyState
            title="No inventory loaded"
            body="Foundry totals and ready-to-build checks use your local inventory export. Sync once, then return here."
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
              placeholder="Search items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="foundry-chips">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`foundry-chip ${category === c.id ? 'is-on' : ''}`}
                  onClick={() => setCategory(c.id)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="foundry-chips">
              <button
                type="button"
                className={`foundry-chip ${scope === 'inventory' ? 'is-on' : ''}`}
                onClick={() => setScope('inventory')}
              >
                My inventory
              </button>
              <button
                type="button"
                className={`foundry-chip ${scope === 'all' ? 'is-on' : ''}`}
                onClick={() => setScope('all')}
              >
                Browse all
              </button>
            </div>
            <div className="foundry-chips">
              <button
                type="button"
                className={`foundry-chip ${prime === 'any' ? 'is-on' : ''}`}
                onClick={() => setPrime('any')}
              >
                Any
              </button>
              <button
                type="button"
                className={`foundry-chip ${prime === 'prime' ? 'is-on' : ''}`}
                onClick={() => setPrime('prime')}
              >
                Prime
              </button>
              <button
                type="button"
                className={`foundry-chip ${prime === 'normal' ? 'is-on' : ''}`}
                onClick={() => setPrime('normal')}
              >
                Normal
              </button>
              <button
                type="button"
                className={`foundry-chip ${owned === 'owned' ? 'is-on' : ''}`}
                onClick={() => setOwned(owned === 'owned' ? 'any' : 'owned')}
              >
                Owned
              </button>
              {scope === 'all' ? (
                <button
                  type="button"
                  className={`foundry-chip ${owned === 'unowned' ? 'is-on' : ''}`}
                  onClick={() => setOwned(owned === 'unowned' ? 'any' : 'unowned')}
                >
                  Unowned
                </button>
              ) : null}
              <button
                type="button"
                className={`foundry-chip ${ready === 'ready' ? 'is-on' : ''}`}
                onClick={() => setReady(ready === 'ready' ? 'any' : 'ready')}
              >
                Ready
              </button>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: '0.78rem', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>
                {loading
                  ? scope === 'inventory'
                    ? 'Loading your items…'
                    : 'Loading catalog…'
                  : scope === 'inventory'
                    ? `${items.length} in inventory / ready`
                    : `${items.length} items`}
                {error ? ` · ${error}` : ''}
              </span>
              <button
                type="button"
                className="btn ghost"
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                disabled={loading}
                onClick={() => void refreshList()}
              >
                Refresh
              </button>
            </p>
          </div>
          <ul className="foundry-list">
            {items.map((item) => (
              <li key={item.uniqueName}>
                <button
                  type="button"
                  className={selected === item.uniqueName ? 'is-selected' : ''}
                  onClick={() => setSelected(item.uniqueName)}
                >
                  <span className="foundry-list__name">{item.name}</span>
                  <span className="foundry-list__meta">
                    {item.owned ? <span className="vl-pill is-ok">Owned</span> : null}
                    {item.mastered === true ? <span className="vl-pill is-ok">Mastered</span> : null}
                    {item.readyToBuild ? <span className="vl-pill is-ready">Ready</span> : null}
                    {item.vaulted ? <span className="vl-pill is-warn">Vaulted</span> : null}
                    {item.isPrime ? <span className="vl-pill">Prime</span> : null}
                  </span>
                </button>
              </li>
            ))}
            {!loading && items.length === 0 ? (
              <li style={{ padding: '8px 12px' }}>
                <EmptyState
                  title="No matches"
                  body={
                    scope === 'inventory'
                      ? 'No owned or ready-to-build recipes match. Sync inventory, or switch to Browse all.'
                      : 'Try clearing filters or searching a different name.'
                  }
                />
              </li>
            ) : null}
          </ul>
        </aside>

        <section className="foundry-detail">
          {!selected || !detail ? (
            <EmptyState
              title={treeLoading ? 'Loading' : 'Pick an item'}
              body={
                treeLoading
                  ? 'Loading recipe details…'
                  : 'Select a warframe or weapon to expand its crafting tree and material totals.'
              }
            />
          ) : (
            <>
              <h3>{detail.name}</h3>
              <div className="foundry-list__meta" style={{ marginBottom: 8 }}>
                {detail.owned ? <span className="vl-pill is-ok">Owned</span> : null}
                {detail.mastered === true ? (
                  <span className="vl-pill is-ok">Mastered</span>
                ) : detail.mastered === false ? (
                  <span className="vl-pill">Unmastered</span>
                ) : (
                  <span className="vl-pill">Mastery unknown</span>
                )}
                {detail.readyToBuild ? (
                  <span className="vl-pill is-ready">Ready to build</span>
                ) : (
                  <span className="vl-pill is-warn">Missing {detail.missingDirect} parts</span>
                )}
              </div>
              <div className="foundry-stats">
                <span>
                  Build time <strong>{formatBuildTime(detail.buildTime)}</strong>
                </span>
                <span>
                  Credits <strong>{formatCredits(detail.buildPrice)}</strong>
                </span>
                <span>
                  Mastery req <strong>{detail.masteryReq ?? '—'}</strong>
                </span>
                <span>
                  Category <strong>{detail.category}</strong>
                </span>
              </div>

              <div className="foundry-section-title">Crafting tree</div>
              {tree?.tree?.children?.length ? (
                <TreeNodes nodes={tree.tree.children} />
              ) : (
                <p className="muted">No component data for this item.</p>
              )}

              <div className="foundry-section-title">Still needed (leaf totals)</div>
              {tree?.totals?.length ? (
                <ul className="foundry-totals">
                  {tree.totals.map((line) => (
                    <li key={line.uniqueName} className={line.missing > 0 ? 'is-missing' : 'is-ok'}>
                      <div style={{ flex: 1 }}>
                        <span>{line.name}</span>
                        {line.missing > 0 && partDrops[line.uniqueName]?.length ? (
                          <div className="muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
                            {formatDropSourcesLine(partDrops[line.uniqueName])}
                          </div>
                        ) : null}
                      </div>
                      <span>
                        need {line.missing} · own {line.owned}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  {detail.owned
                    ? 'You already own this item — no remaining craft materials.'
                    : detail.readyToBuild
                      ? 'All direct components are in inventory. Nested mats not required.'
                      : 'No leaf totals (or inventory empty for this recipe).'}
                </p>
              )}
              {dropsLoading ? (
                <p className="muted" style={{ marginTop: 8 }}>
                  Looking up relic drop sources…
                </p>
              ) : null}
            </>
          )}
        </section>
      </div>
    </>
  )
}
