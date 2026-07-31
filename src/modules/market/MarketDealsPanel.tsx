import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppSettings, MarketQuote } from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
import { Panel } from '../../components/Panel'
import { flipSpread, itemMarketUrl } from './marketHelpers'

type Props = {
  settings: AppSettings
  onUpdate: (partial: Partial<AppSettings>) => void
}

export function MarketDealsPanel({ settings, onUpdate }: Props) {
  const watchlist = settings.marketWatchlist || []
  const minSpread = settings.marketFlipMinSpread ?? 5
  const [quotes, setQuotes] = useState<MarketQuote[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!watchlist.length || !window.voidlens?.lookupMarketPrices) {
      setQuotes([])
      return
    }
    setLoading(true)
    try {
      setQuotes((await window.voidlens.lookupMarketPrices(watchlist)) as MarketQuote[])
    } finally {
      setLoading(false)
    }
  }, [watchlist])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const deals = useMemo(() => {
    return watchlist
      .map((name) => {
        const q = quotes.find((x) => x.name.toLowerCase() === name.toLowerCase())
        const flip = flipSpread(q)
        return { name, q, flip }
      })
      .filter((d) => d.flip && d.flip.edge >= minSpread)
      .sort((a, b) => (b.flip?.edge || 0) - (a.flip?.edge || 0))
  }, [watchlist, quotes, minSpread])

  return (
    <Panel
      title="Flip scan"
      subtitle={`Watchlist edges ≥ ${minSpread}p (median − floor − 1)`}
      actions={
        <div className="market-actions">
          <label className="market-min-label">
            Min edge
            <input
              type="number"
              min={1}
              className="market-min-input"
              value={minSpread}
              onChange={(e) =>
                onUpdate({
                  marketFlipMinSpread: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                })
              }
            />
          </label>
          <button className="btn ghost" type="button" disabled={loading} onClick={() => void refresh()}>
            {loading ? '…' : 'Refresh'}
          </button>
        </div>
      }
    >
      {!watchlist.length ? (
        <EmptyState
          title="Watchlist empty"
          body="Add items on Watchlist, then scan here for buy-low / list-high room."
        />
      ) : deals.length === 0 ? (
        <EmptyState
          title="No wide spreads"
          body={`Nothing on your watchlist has ≥ ${minSpread}p edge right now.`}
        />
      ) : (
        <ul className="market-card-list">
          {deals.map((d) => (
            <li key={d.name} className="market-card">
              <div className="market-card__body">
                <div className="market-card__title">
                  <strong>{d.name}</strong>
                  <span className="market-chip market-chip--hit">{d.flip?.label}</span>
                </div>
                <div className="market-card__meta muted">
                  <span>Floor {d.q?.floor ?? d.q?.platinum}p</span>
                  <span>Med ~{d.q?.platinum}p</span>
                  <span>Vol {d.q?.volume ?? '—'}</span>
                </div>
              </div>
              <div className="market-actions">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => void window.voidlens.openExternal(itemMarketUrl(d.name))}
                >
                  Open
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
