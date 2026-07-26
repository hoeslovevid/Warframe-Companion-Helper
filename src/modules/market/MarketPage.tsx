import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppSettings } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useRelicScan } from '../../hooks/useRelicScan'
import { useRivenScan } from '../../hooks/useRivenScan'
import './market.css'

type Props = {
  settings: AppSettings
  enabled: boolean
  onUpdate: (partial: Partial<AppSettings>) => void
}

type QuoteRow = { name: string; platinum: number; volume: number }

export function MarketPage({ settings, enabled, onUpdate }: Props) {
  const [draft, setDraft] = useState('')
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { state: relics } = useRelicScan()
  const { state: rivens } = useRivenScan()

  const watchlist = settings.marketWatchlist

  const refresh = useCallback(async () => {
    if (!watchlist.length) {
      setQuotes([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const rows = await window.voidlens.lookupMarketPrices(watchlist)
      setQuotes(rows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Market lookup failed')
    } finally {
      setLoading(false)
    }
  }, [watchlist])

  useEffect(() => {
    if (!enabled) return
    void refresh()
  }, [enabled, refresh])

  const quoteByName = useMemo(() => {
    const m = new Map<string, QuoteRow>()
    for (const q of quotes) m.set(q.name.toLowerCase(), q)
    return m
  }, [quotes])

  const addItem = () => {
    const name = draft.trim()
    if (!name) return
    if (watchlist.some((w) => w.toLowerCase() === name.toLowerCase())) {
      setDraft('')
      return
    }
    onUpdate({ marketWatchlist: [...watchlist, name] })
    setDraft('')
  }

  const removeItem = (name: string) => {
    onUpdate({ marketWatchlist: watchlist.filter((w) => w !== name) })
  }

  const recentRelics = (relics.rewards || [])
    .filter((r) => r.platinum != null)
    .slice(0, 6)

  if (!enabled) {
    return (
      <Panel title="Market" subtitle="Module disabled">
        <p className="muted">Enable Market under Modules to track platinum quotes.</p>
      </Panel>
    )
  }

  return (
    <div className="market-page">
      <Panel
        title="Market"
        subtitle="warframe.market median sell plat (PC)"
        actions={
          <button className="btn ghost" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      >
        <div className="market-add">
          <input
            value={draft}
            placeholder="Item name (e.g. Nikana Prime Blade)"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addItem()
            }}
          />
          <button className="btn primary" onClick={addItem}>
            Add
          </button>
        </div>
        {error ? <p className="market-error">{error}</p> : null}

        <ul className="market-list">
          {watchlist.length === 0 ? (
            <li className="muted">Watchlist empty — add prime parts or sets to track.</li>
          ) : (
            watchlist.map((name) => {
              const q = quoteByName.get(name.toLowerCase())
              return (
                <li key={name}>
                  <div>
                    <strong>{name}</strong>
                    <div className="muted">
                      {q
                        ? `~${q.platinum}p · ${q.volume} sells`
                        : loading
                          ? 'Looking up…'
                          : 'No orders found'}
                    </div>
                  </div>
                  <div className="market-actions">
                    <button
                      className="btn ghost"
                      onClick={() =>
                        void window.voidlens.openExternal(
                          `https://warframe.market/items/${name
                            .toLowerCase()
                            .replace(/['’]/g, '')
                            .replace(/[^a-z0-9]+/g, '_')
                            .replace(/^_|_$/g, '')}`,
                        )
                      }
                    >
                      Open
                    </button>
                    <button className="btn ghost" onClick={() => removeItem(name)}>
                      Remove
                    </button>
                  </div>
                </li>
              )
            })
          )}
        </ul>
      </Panel>

      <div className="section-gap" />

      <div className="grid-2">
        <Panel title="Latest relic scan" subtitle="From the reward popup">
          {recentRelics.length ? (
            <ul className="market-list compact">
              {recentRelics.map((r) => (
                <li key={`${r.slot}-${r.name}`}>
                  <span>
                    {r.name}
                    {r.bestPick ? <span className="market-best"> Best</span> : null}
                  </span>
                  <span className="market-plat">~{r.platinum}p</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No priced relic rewards yet.</p>
          )}
        </Panel>

        <Panel title="Latest riven scan" subtitle="Auction estimates">
          {rivens.current || rivens.reroll ? (
            <ul className="market-list compact">
              {rivens.current ? (
                <li>
                  <span>Current · {rivens.current.weapon}</span>
                  <span className="market-plat">
                    {rivens.current.platinum != null ? `~${rivens.current.platinum}p` : '—'}
                  </span>
                </li>
              ) : null}
              {rivens.reroll ? (
                <li>
                  <span>Reroll · {rivens.reroll.weapon}</span>
                  <span className="market-plat">
                    {rivens.reroll.platinum != null ? `~${rivens.reroll.platinum}p` : '—'}
                  </span>
                </li>
              ) : null}
            </ul>
          ) : (
            <p className="muted">No riven scan yet.</p>
          )}
        </Panel>
      </div>
    </div>
  )
}
