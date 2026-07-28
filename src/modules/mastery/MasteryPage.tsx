import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MasteryHelperItem, MasteryHelperQuery } from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
import { ItemThumb } from '../../components/ItemThumb'
import { Panel } from '../../components/Panel'
import { useInventory } from '../../hooks/useInventory'
import '../foundry/foundry.css'

type Props = {
  enabled: boolean
  onOpenSettings: () => void
  onOpenFoundry?: (uniqueName: string) => void
}

type FilterId = NonNullable<MasteryHelperQuery['filter']>

export function MasteryPage({ enabled, onOpenSettings, onOpenFoundry }: Props) {
  const { status: inventory } = useInventory()
  const [filter, setFilter] = useState<FilterId>('next')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<MasteryHelperItem[]>([])
  const [summary, setSummary] = useState({
    mastered: 0,
    ownedUnmastered: 0,
    readyUnmastered: 0,
    unknown: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const query = useMemo<MasteryHelperQuery>(() => ({ filter, search }), [filter, search])

  const refresh = useCallback(async () => {
    if (!window.voidlens?.getMasteryHelper) return
    setLoading(true)
    setError(null)
    try {
      const next = await window.voidlens.getMasteryHelper(query)
      setItems(next.items)
      setSummary(next.summary)
      if (next.error) setError(next.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load mastery helper')
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
      <Panel title="Mastery Helper" subtitle="Module disabled">
        <EmptyState
          title="Module off"
          body="Enable Mastery Helper under Modules to see next craftable and unmastered gear."
        />
      </Panel>
    )
  }

  const inventoryReady = inventory.loaded && inventory.uniqueCount > 0

  return (
    <>
      <header className="page-header">
        <h2 className="page-title">Mastery Helper</h2>
        <div className="page-title-rule" />
        <p className="page-desc">
          Next items for MR progress — ready-to-craft first, then owned gear that still needs
          leveling.
        </p>
      </header>

      {!inventoryReady ? (
        <Panel title="Inventory required">
          <EmptyState
            title="No inventory loaded"
            body="Sync inventory so mastery and craft readiness can be calculated."
            actions={
              <button className="btn primary" onClick={onOpenSettings}>
                Open inventory settings
              </button>
            }
          />
        </Panel>
      ) : null}

      <div className="section-gap" />

      <Panel
        title="Progress"
        subtitle={`${summary.mastered} mastered · ${summary.ownedUnmastered} owned unmastered · ${summary.readyUnmastered} ready to craft`}
      >
        <div className="foundry-sidebar__filters">
          <input
            className="foundry-search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="vl-segment vl-segment--wrap" role="group" aria-label="Mastery filter">
            {(
              [
                ['next', 'Next up'],
                ['ready', 'Ready'],
                ['owned_unmastered', 'Unmastered'],
                ['all', 'All'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`vl-segment__btn ${filter === id ? 'is-on' : ''}`}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
            {loading ? 'Loading…' : `${items.length} items`}
            {error ? ` · ${error}` : ''}
          </p>
        </div>

        <ul className="foundry-list vl-stagger" style={{ maxHeight: 'none' }}>
          {items.map((item) => (
            <li key={item.uniqueName}>
              <button
                type="button"
                onClick={() => onOpenFoundry?.(item.uniqueName)}
                title="Open in Foundry"
              >
                <span className="foundry-list__row">
                  <ItemThumb imageName={item.imageName} name={item.name} size="md" />
                  <span className="foundry-list__text">
                    <span className="foundry-list__name">{item.name}</span>
                    <span className="foundry-list__meta">
                      {item.readyToBuild ? <span className="vl-pill is-ready">Ready</span> : null}
                      {item.owned ? <span className="vl-pill is-ok">Owned</span> : null}
                      {item.mastered === true ? (
                        <span className="vl-pill is-ok">Mastered</span>
                      ) : item.mastered === false ? (
                        <span className="vl-pill is-warn">Unmastered</span>
                      ) : (
                        <span className="vl-pill">MR ?</span>
                      )}
                      {item.isPrime ? <span className="vl-pill">Prime</span> : null}
                      <span className="vl-pill">{item.category}</span>
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
          {!loading && items.length === 0 ? (
            <li style={{ padding: '8px 12px' }}>
              <EmptyState title="Nothing here" body="Try another filter or sync a fresher inventory." />
            </li>
          ) : null}
        </ul>
      </Panel>
    </>
  )
}
