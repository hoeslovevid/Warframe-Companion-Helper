import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings, InventoryBrowseItem, WfmOrder } from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
import { Panel } from '../../components/Panel'
import { useInventory } from '../../hooks/useInventory'
import { copyText } from '../../lib/tradeClipboard'
import {
  formatSellWhisper,
  isBlacklisted,
  listedNameSet,
  minSellFor,
  stockRowStatus,
  suggestSellPrice,
  upsertMinSell,
} from './marketHelpers'

type Props = {
  settings: AppSettings
  orders: WfmOrder[]
  linked: boolean
  onOpenAccount: () => void
  onUpdate: (partial: Partial<AppSettings>) => void
  onOrdersChanged: () => void
}

const BULK_LIMIT = 10

export function MarketStockPanel({
  settings,
  orders,
  linked,
  onOpenAccount,
  onUpdate,
  onOrdersChanged,
}: Props) {
  const { status: inventory } = useInventory()
  const [rows, setRows] = useState<InventoryBrowseItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busyName, setBusyName] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  const blacklist = settings.marketListBlacklist || []
  const mins = settings.marketMinPrices || []
  const listed = useMemo(() => listedNameSet(orders), [orders])

  const load = useCallback(async () => {
    if (!window.voidlens?.browseInventory || !inventory.loaded) {
      setRows([])
      return
    }
    setLoading(true)
    try {
      const next = await window.voidlens.browseInventory({
        sellableOnly: true,
        enrichPrices: true,
        sort: 'platinum',
        limit: 150,
      })
      setRows(next)
    } finally {
      setLoading(false)
    }
  }, [inventory.loaded, inventory.revision])

  useEffect(() => {
    void load()
  }, [load])

  const resolvePlat = async (row: InventoryBrowseItem): Promise<number | null> => {
    const tip = await window.voidlens.suggestMarketUndercut?.(row.displayName)
    const min = minSellFor(row.displayName, mins)
    if (tip?.floor) return suggestSellPrice(tip.floor, min)
    if (row.platinum != null && row.platinum >= 1) return suggestSellPrice(row.platinum, min)
    return null
  }

  const listOne = async (row: InventoryBrowseItem): Promise<boolean> => {
    if (!linked || !window.voidlens?.createWfmOrder) {
      onOpenAccount()
      return false
    }
    setBusyName(row.uniqueName)
    setMsg(null)
    try {
      const plat = await resolvePlat(row)
      if (plat == null || plat < 1) {
        setMsg('No price for this item')
        return false
      }
      const qty = Math.max(1, row.excess || 1)
      const res = await window.voidlens.createWfmOrder({
        itemSlugOrName: row.displayName,
        orderType: 'sell',
        platinum: Math.round(plat),
        quantity: qty,
        visible: true,
      })
      if (!res.ok) {
        setMsg(res.error || 'List failed')
        return false
      }
      setMsg(`Listed ${qty}× ${row.displayName} @ ${Math.round(plat)}p`)
      return true
    } finally {
      setBusyName(null)
    }
  }

  const bulkList = async () => {
    if (!linked) {
      onOpenAccount()
      return
    }
    const ready = rows
      .filter((r) => stockRowStatus(r, listed, blacklist) === 'ready')
      .slice(0, BULK_LIMIT)
    if (!ready.length) {
      setMsg('Nothing ready to list')
      return
    }
    setBulkBusy(true)
    setMsg(null)
    let ok = 0
    let fail = 0
    try {
      for (const row of ready) {
        const listedOk = await listOne(row)
        if (listedOk) ok += 1
        else fail += 1
        await new Promise((r) => setTimeout(r, 450))
      }
      setMsg(`Bulk list: ${ok} ok${fail ? `, ${fail} failed` : ''}`)
      onOrdersChanged()
    } finally {
      setBulkBusy(false)
    }
  }

  const block = (name: string) => {
    if (isBlacklisted(name, blacklist)) return
    onUpdate({ marketListBlacklist: [...blacklist, name] })
  }

  const setMin = (name: string, value: string) => {
    const n = Math.floor(Number(value))
    if (!Number.isFinite(n) || n < 1) {
      onUpdate({
        marketMinPrices: (mins || []).filter((m) => m.name.toLowerCase() !== name.toLowerCase()),
      })
      return
    }
    onUpdate({ marketMinPrices: upsertMinSell(mins, name, n) })
  }

  const copyWhisper = async (row: InventoryBrowseItem) => {
    const plat = await resolvePlat(row)
    if (!plat) return
    const text = formatSellWhisper(row.displayName, plat, Math.max(1, row.excess || 1))
    if (!(await copyText(text))) return
    setCopied(row.uniqueName)
    window.setTimeout(() => setCopied(null), 1400)
  }

  if (!inventory.loaded) {
    return (
      <Panel title="Stock" subtitle="Inventory extras ready to list">
        <EmptyState
          title="Inventory required"
          body="Sync inventory to match excess parts against your open WFM sell orders."
        />
      </Panel>
    )
  }

  const ready = rows.filter((r) => stockRowStatus(r, listed, blacklist) === 'ready')
  const listedRows = rows.filter((r) => stockRowStatus(r, listed, blacklist) === 'listed')
  const blocked = rows.filter((r) => stockRowStatus(r, listed, blacklist) === 'blocked')

  return (
    <Panel
      title="Stock"
      subtitle="Extras vs open sells · min floor · list at floor − 1"
      actions={
        <div className="market-actions">
          <button className="btn ghost" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
          <button
            className="btn primary"
            type="button"
            disabled={!linked || bulkBusy || ready.length === 0}
            onClick={() => void bulkList()}
            title={`List up to ${BULK_LIMIT} ready items at undercut (respects min)`}
          >
            {bulkBusy ? 'Listing…' : `List top ${Math.min(BULK_LIMIT, ready.length || BULK_LIMIT)}`}
          </button>
        </div>
      }
    >
      {!linked ? (
        <p className="muted">
          Link your warframe.market account to list from here.{' '}
          <button type="button" className="linkish" onClick={onOpenAccount}>
            Account
          </button>
        </p>
      ) : null}
      {msg ? <p className="muted">{msg}</p> : null}
      <p className="muted inventory-meta">
        {ready.length} ready · {listedRows.length} already listed · {blocked.length} blacklisted
      </p>
      {rows.length === 0 ? (
        <EmptyState title="No sellable extras" body="Duplicate prime parts with prices will show here." />
      ) : (
        <ul className="market-card-list">
          {rows.map((r) => {
            const status = stockRowStatus(r, listed, blacklist)
            const min = minSellFor(r.displayName, mins)
            return (
              <li key={r.uniqueName} className="market-card">
                <div className="market-card__body">
                  <div className="market-card__title">
                    <strong>{r.displayName}</strong>
                    {status === 'listed' ? (
                      <span className="market-chip market-chip--listed">Listed</span>
                    ) : null}
                    {status === 'blocked' ? (
                      <span className="market-chip market-chip--blocked">Blocked</span>
                    ) : null}
                  </div>
                  <div className="market-card__meta muted">
                    <span>+{r.excess} excess</span>
                    {r.platinum != null ? <span>~{Math.round(r.platinum)}p med</span> : null}
                    {r.ducats != null ? <span>{r.ducats}d</span> : null}
                    <label className="market-min-label">
                      Min
                      <input
                        type="number"
                        min={1}
                        className="market-min-input"
                        value={min ?? ''}
                        placeholder="—"
                        aria-label={`Min sell for ${r.displayName}`}
                        onChange={(e) => setMin(r.displayName, e.target.value)}
                      />
                    </label>
                  </div>
                </div>
                <div className="market-actions">
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() => void copyWhisper(r)}
                    title="Copy WTS whisper"
                  >
                    {copied === r.uniqueName ? 'Copied' : 'Whisper'}
                  </button>
                  {status === 'ready' ? (
                    <>
                      <button
                        type="button"
                        className="btn primary"
                        disabled={!linked || busyName === r.uniqueName || bulkBusy}
                        onClick={() =>
                          void listOne(r).then((ok) => {
                            if (ok) onOrdersChanged()
                          })
                        }
                        title="Create sell order at undercut (respects min)"
                      >
                        {busyName === r.uniqueName ? '…' : 'List'}
                      </button>
                      <button type="button" className="btn ghost" onClick={() => block(r.displayName)}>
                        Block
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
