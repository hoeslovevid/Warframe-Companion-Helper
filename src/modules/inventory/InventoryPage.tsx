import { useCallback, useEffect, useMemo, useState } from 'react'
import type { InventoryBrowseItem, InventoryBrowseKind } from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
import { Panel } from '../../components/Panel'
import { useInventory } from '../../hooks/useInventory'
import './inventory.css'

type Props = {
  onOpenSettings: () => void
}

const KIND_FILTERS: Array<{ id: InventoryBrowseKind | 'all' | 'sellable'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'sellable', label: 'Sellables' },
  { id: 'part', label: 'Parts / BPs' },
  { id: 'gear', label: 'Gear' },
  { id: 'relic', label: 'Relics' },
  { id: 'resource', label: 'Resources' },
  { id: 'currency', label: 'Currency' },
  { id: 'other', label: 'Other' },
]

function formatAge(ms: number | null): string {
  if (ms == null) return 'never'
  const m = Math.floor(ms / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function kindLabel(kind: InventoryBrowseKind): string {
  switch (kind) {
    case 'part':
      return 'Part'
    case 'gear':
      return 'Gear'
    case 'relic':
      return 'Relic'
    case 'resource':
      return 'Resource'
    case 'currency':
      return 'Currency'
    default:
      return 'Other'
  }
}

export function InventoryPage({ onOpenSettings }: Props) {
  const { status, busy, message, syncFromGame, refresh } = useInventory()
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<InventoryBrowseKind | 'all' | 'sellable'>('all')
  const [rows, setRows] = useState<InventoryBrowseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [listBusy, setListBusy] = useState<string | null>(null)
  const [listMsg, setListMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!window.voidlens?.browseInventory) return
    setLoading(true)
    try {
      const sellableOnly = kind === 'sellable'
      const next = await window.voidlens.browseInventory({
        search,
        kind: sellableOnly ? 'all' : kind,
        sellableOnly,
        limit: sellableOnly ? 200 : 800,
      })
      setRows(next)
    } finally {
      setLoading(false)
    }
  }, [search, kind])

  useEffect(() => {
    if (!status.loaded) {
      setRows([])
      return
    }
    void load()
  }, [status.loaded, status.revision, load])

  const totals = useMemo(() => {
    let stacks = 0
    let units = 0
    let excess = 0
    for (const r of rows) {
      stacks += 1
      units += r.count
      excess += r.excess || 0
    }
    return { stacks, units, excess }
  }, [rows])

  const listOnWfm = async (row: InventoryBrowseItem) => {
    if (!window.voidlens?.createWfmOrder) return
    const plat = row.platinum
    if (plat == null || plat < 1) {
      setListMsg('No platinum price for this item')
      return
    }
    const qty = Math.max(1, row.excess || 1)
    setListBusy(row.uniqueName)
    setListMsg(null)
    try {
      const res = await window.voidlens.createWfmOrder({
        itemSlugOrName: row.displayName,
        orderType: 'sell',
        platinum: Math.round(plat),
        quantity: qty,
        visible: true,
      })
      if (!res.ok) {
        setListMsg(res.error || 'List failed — sign in under Market')
        return
      }
      setListMsg(`Listed ${qty}× ${row.displayName} @ ${Math.round(plat)}p`)
    } finally {
      setListBusy(null)
    }
  }

  if (!status.loaded) {
    return (
      <>
        <header className="page-header">
          <h2 className="page-title">Inventory</h2>
          <div className="page-title-rule" />
          <p className="page-desc">Browse synced item counts from Warframe.</p>
        </header>
        <Panel title="Inventory required">
          <EmptyState
            title="No inventory loaded"
            body="Sync from the running game (Settings → Inventory) to browse parts, gear, and relics with exact stack counts."
          />
          <div className="toolbar" style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={onOpenSettings}>
              Open inventory settings
            </button>
          </div>
        </Panel>
      </>
    )
  }

  return (
    <div className="inventory-page">
      <header className="page-header">
        <h2 className="page-title">Inventory</h2>
        <div className="page-title-rule" />
        <p className="page-desc">
          {status.uniqueCount} unique · {status.itemCount} total · synced {formatAge(status.staleAgeMs)}
          {status.stale ? ' · stale' : ''}
        </p>
      </header>

      {status.stale ? (
        <p className="inventory-stale">
          Inventory looks stale ({formatAge(status.staleAgeMs)}). Sync again while Warframe is running
          for accurate Foundry / relic counts.
        </p>
      ) : null}

      <Panel
        title="Browser"
        subtitle={
          kind === 'sellable'
            ? 'Duplicate parts with prices — one-click warframe.market sell'
            : 'Names from WFCD / recipe catalogs when available'
        }
        actions={
          <div className="market-actions">
            <button
              className="btn ghost"
              disabled={busy || !status.consent}
              onClick={() => void syncFromGame()}
            >
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button className="btn ghost" onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        }
      >
        <div className="inventory-toolbar">
          <input
            value={search}
            placeholder="Search (e.g. Ember Chassis, Forma…)"
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="inventory-kinds">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`btn ghost${kind === f.id ? ' is-active' : ''}`}
                onClick={() => setKind(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {message ? <p className="muted">{message}</p> : null}
        {listMsg ? <p className="muted">{listMsg}</p> : null}
        <p className="muted inventory-meta">
          Showing {totals.stacks} stacks ({totals.units} units)
          {kind === 'sellable' ? ` · ${totals.excess} excess` : ''}
          {loading ? ' · loading…' : ''}
        </p>
        <ul className="inventory-list">
          {rows.length === 0 ? (
            <li className="muted">
              {kind === 'sellable'
                ? 'No duplicate parts with prices. Sync inventory and ensure WFInfo prices loaded.'
                : 'No matching items.'}
            </li>
          ) : (
            rows.map((r) => (
              <li key={r.uniqueName}>
                <div>
                  <strong>{r.displayName}</strong>
                  <div className="muted inventory-tags">
                    <span className={`inventory-kind kind-${r.kind}`}>{kindLabel(r.kind)}</span>
                    {r.isBlueprint ? <span className="inventory-tag">Blueprint</span> : null}
                    {r.isComponent ? <span className="inventory-tag">Component</span> : null}
                    {r.platinum != null ? (
                      <span className="inventory-tag">~{Math.round(r.platinum)}p</span>
                    ) : null}
                    {r.ducats != null ? (
                      <span className="inventory-tag">{r.ducats}d</span>
                    ) : null}
                    {r.excess > 0 ? (
                      <span className="inventory-tag">+{r.excess} excess</span>
                    ) : null}
                  </div>
                </div>
                <div className="inventory-row-actions">
                  {(kind === 'sellable' || (r.excess > 0 && r.platinum != null)) &&
                  r.platinum != null ? (
                    <button
                      type="button"
                      className="btn ghost"
                      disabled={listBusy === r.uniqueName}
                      onClick={() => void listOnWfm(r)}
                      title="Create warframe.market sell order (sign in under Market)"
                    >
                      {listBusy === r.uniqueName ? 'Listing…' : 'List WFM'}
                    </button>
                  ) : null}
                  <span className="inventory-count">×{r.count}</span>
                </div>
              </li>
            ))
          )}
        </ul>
      </Panel>
    </div>
  )
}
