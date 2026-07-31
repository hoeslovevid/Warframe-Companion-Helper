import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings, MarketQuote } from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
import { Panel } from '../../components/Panel'
import { itemMarketUrl } from './marketHelpers'

type Props = {
  settings: AppSettings
  onUpdate: (partial: Partial<AppSettings>) => void
}

export function MarketBuysPanel({ settings, onUpdate }: Props) {
  const targets = settings.marketBuyTargets || []
  const [nameDraft, setNameDraft] = useState('')
  const [maxDraft, setMaxDraft] = useState('20')
  const [quotes, setQuotes] = useState<MarketQuote[]>([])
  const [loading, setLoading] = useState(false)

  const names = useMemo(() => targets.map((t) => t.name), [targets])

  const refresh = useCallback(async () => {
    if (!names.length || !window.voidlens?.lookupMarketPrices) {
      setQuotes([])
      return
    }
    setLoading(true)
    try {
      const rows = await window.voidlens.lookupMarketPrices(names)
      setQuotes(rows as MarketQuote[])
    } finally {
      setLoading(false)
    }
  }, [names])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const quoteBy = useMemo(() => {
    const m = new Map<string, MarketQuote>()
    for (const q of quotes) m.set(q.name.toLowerCase(), q)
    return m
  }, [quotes])

  const add = () => {
    const name = nameDraft.trim()
    const maxPlatinum = Math.max(1, Math.floor(Number(maxDraft) || 1))
    if (!name) return
    if (targets.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setNameDraft('')
      return
    }
    onUpdate({ marketBuyTargets: [...targets, { name, maxPlatinum }] })
    setNameDraft('')
  }

  const remove = (name: string) => {
    onUpdate({ marketBuyTargets: targets.filter((t) => t.name !== name) })
  }

  const setMax = (name: string, maxPlatinum: number) => {
    onUpdate({
      marketBuyTargets: targets.map((t) =>
        t.name === name ? { ...t, maxPlatinum: Math.max(1, maxPlatinum) } : t,
      ),
    })
  }

  const hits = targets.filter((t) => {
    const q = quoteBy.get(t.name.toLowerCase())
    return q && (q.floor || q.platinum) <= t.maxPlatinum
  })

  return (
    <Panel
      title="Buy targets"
      subtitle="Alert when live sell floor ≤ your max"
      actions={
        <div className="market-actions">
          <label className="market-check">
            <input
              type="checkbox"
              checked={settings.marketBuyAlertEnabled !== false}
              onChange={(e) => onUpdate({ marketBuyAlertEnabled: e.target.checked })}
            />
            Desktop alerts
          </label>
          <button className="btn ghost" type="button" onClick={() => void refresh()} disabled={loading}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      }
    >
      {hits.length ? (
        <p className="market-buy-hit">
          {hits.length} target{hits.length === 1 ? '' : 's'} at or under max:{' '}
          {hits.map((h) => h.name).join(', ')}
        </p>
      ) : null}
      <div className="market-add">
        <input
          value={nameDraft}
          placeholder="Item (e.g. Nikana Prime Blade)"
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add()
          }}
        />
        <input
          type="number"
          min={1}
          value={maxDraft}
          onChange={(e) => setMaxDraft(e.target.value)}
          placeholder="Max p"
          aria-label="Max platinum"
          style={{ maxWidth: 88 }}
        />
        <button className="btn primary" type="button" onClick={add}>
          Add
        </button>
      </div>
      {targets.length === 0 ? (
        <EmptyState
          title="No buy targets"
          body="Track parts you’re hunting — we’ll flag when the live floor drops to your max."
        />
      ) : (
        <div className="market-table market-table--buys" role="table">
          <div className="market-table__head" role="row">
            <span role="columnheader">Item</span>
            <span role="columnheader">Max</span>
            <span role="columnheader">Floor</span>
            <span role="columnheader">Med</span>
            <span role="columnheader" className="market-table__actions-col">
              Actions
            </span>
          </div>
          {targets.map((t) => {
            const q = quoteBy.get(t.name.toLowerCase())
            const floor = q?.floor ?? q?.platinum
            const hit = floor != null && floor <= t.maxPlatinum
            return (
              <div
                className={`market-table__row${hit ? ' is-buy-hit' : ''}`}
                role="row"
                key={t.name}
              >
                <span className="market-table__name" role="cell">
                  {t.name}
                  {hit ? <span className="market-chip market-chip--hit">Hit</span> : null}
                </span>
                <span role="cell">
                  <input
                    type="number"
                    min={1}
                    value={t.maxPlatinum}
                    onChange={(e) => setMax(t.name, Number(e.target.value))}
                    aria-label={`Max platinum for ${t.name}`}
                    style={{ width: 64 }}
                  />
                </span>
                <span className="market-plat" role="cell">
                  {floor != null ? `${floor}p` : loading ? '…' : '—'}
                </span>
                <span className="muted" role="cell">
                  {q ? `~${q.platinum}p` : '—'}
                </span>
                <span className="market-actions" role="cell">
                  <button
                    className="btn ghost"
                    type="button"
                    onClick={() => void window.voidlens.openExternal(itemMarketUrl(t.name))}
                  >
                    Open
                  </button>
                  <button className="btn ghost" type="button" onClick={() => remove(t.name)}>
                    Remove
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}
