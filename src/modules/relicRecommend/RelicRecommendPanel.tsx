import { useCallback, useEffect, useRef, useState } from 'react'
import type { RelicPlannerQuery, RelicPlannerRow } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useInventory } from '../../hooks/useInventory'
import { useSettings } from '../../hooks/useVoidLens'
import '../cycles/module.css'

type Props = {
  opacity?: number
  compact?: boolean
}

export function RelicRecommendPanel({ opacity, compact }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const { settings } = useSettings()
  const { status: inventory } = useInventory()
  const [visible, setVisible] = useState(false)
  const [rows, setRows] = useState<RelicPlannerRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const q = settings.relicRecommend
  const favoritesKey = (settings.farmFavorites || []).join('\0')

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    // Defer planner work until the panel is actually on-screen (dashboard scroll / overlay).
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setVisible(true)
      },
      { root: null, threshold: 0.05, rootMargin: '40px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const refresh = useCallback(async () => {
    if (!window.voidlens?.getRelicPlanner) return
    setLoading(true)
    try {
      const query: RelicPlannerQuery = {
        ownedOnly: q?.ownedOnly !== false,
        sort: q?.sort || 'missing',
        tier: q?.tier || 'all',
        prime: q?.prime || 'any',
        favoritesFirst: q?.favoritesFirst !== false,
        limit: q?.limit || 8,
      }
      const next = await window.voidlens.getRelicPlanner(query)
      setRows(next.rows)
      setError(next.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q?.ownedOnly, q?.sort, q?.tier, q?.prime, q?.favoritesFirst, q?.limit, favoritesKey])

  useEffect(() => {
    if (!visible) return
    const t = window.setTimeout(() => void refresh(), 80)
    return () => window.clearTimeout(t)
  }, [visible, refresh, inventory.revision, inventory.loaded])

  const sortLabel =
    q?.sort === 'platinum'
      ? 'plat'
      : q?.sort === 'ducats'
        ? 'ducats'
        : q?.sort === 'owned'
          ? 'owned'
          : q?.sort === 'name'
            ? 'name'
            : 'missing'

  return (
    <div ref={rootRef}>
      <Panel
        title="Relic Recommend"
        subtitle={
          compact
            ? `Top owned · ${sortLabel}`
            : `Best owned relics to run · sorted by ${sortLabel}`
        }
        opacity={opacity}
      >
        {!visible ? (
          <p className="mod-empty muted" style={{ opacity: 0.6 }}>
            —
          </p>
        ) : !inventory.loaded ? (
          <p className="mod-empty">Sync inventory to rank owned relics.</p>
        ) : loading && rows.length === 0 ? (
          <p className="mod-empty">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mod-empty">{error || 'No owned relics match these filters.'}</p>
        ) : (
          <ul className="mod-list" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {rows.map((row, i) => (
              <li
                key={row.key}
                className="mod-stat"
                style={{ alignItems: 'flex-start', gap: 8, marginBottom: 4 }}
              >
                <span className="mod-stat__label" style={{ minWidth: 18 }}>
                  {i + 1}
                </span>
                <span className="mod-stat__value" style={{ textAlign: 'left', flex: 1 }}>
                  {row.name}
                  {row.hasFavorite ? ' ★' : ''}
                  <span
                    className="muted"
                    style={{ display: 'block', fontSize: '0.72rem', fontWeight: 500 }}
                  >
                    ×{row.owned}
                    {row.missingCount > 0 ? ` · ${row.missingCount} needed` : ' · complete'}
                    {row.bestPlatinum != null ? ` · ~${Math.round(row.bestPlatinum)}p` : ''}
                    {row.bestDucats != null ? ` · ${row.bestDucats}d` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
