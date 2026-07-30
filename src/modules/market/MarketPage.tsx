import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppSettings, WfmOrder, WfmSession } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useRelicScan } from '../../hooks/useRelicScan'
import { useRivenScan } from '../../hooks/useRivenScan'
import './market.css'

type Props = {
  settings: AppSettings
  enabled: boolean
  onUpdate: (partial: Partial<AppSettings>) => void
  onOpenHelp?: () => void
}

type QuoteRow = { name: string; platinum: number; volume: number }

const emptySession: WfmSession = {
  linked: false,
  ingameName: null,
  platform: null,
  reputation: null,
  status: null,
  error: null,
}

export function MarketPage({ settings, enabled, onUpdate, onOpenHelp }: Props) {
  const [draft, setDraft] = useState('')
  const [quotes, setQuotes] = useState<QuoteRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<WfmSession>(emptySession)
  const [jwtDraft, setJwtDraft] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [orders, setOrders] = useState<WfmOrder[]>([])
  const [ordersError, setOrdersError] = useState<string | null>(null)
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [cancelBusyId, setCancelBusyId] = useState<string | null>(null)
  const { state: relics } = useRelicScan()
  const { state: rivens } = useRivenScan()

  const watchlist = settings.marketWatchlist

  const refreshOrders = useCallback(async () => {
    setOrdersLoading(true)
    setOrdersError(null)
    try {
      const res = await window.voidlens.getWfmOrders()
      setOrders(res.orders)
      setOrdersError(res.error)
    } catch (err) {
      setOrders([])
      setOrdersError(err instanceof Error ? err.message : 'Failed to load orders')
    } finally {
      setOrdersLoading(false)
    }
  }, [])

  const refreshSession = useCallback(async () => {
    try {
      const s = await window.voidlens.getWfmSession()
      setSession(s)
      if (s.linked) void refreshOrders()
      else {
        setOrders([])
        setOrdersError(null)
      }
    } catch {
      setSession(emptySession)
    }
  }, [refreshOrders])

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
    void refreshSession()
  }, [enabled, refresh, refreshSession])

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

  const linkJwt = async () => {
    setAuthBusy(true)
    try {
      const s = await window.voidlens.setWfmJwt(jwtDraft)
      setSession(s)
      if (s.linked) {
        setJwtDraft('')
        void refreshOrders()
      }
    } finally {
      setAuthBusy(false)
    }
  }

  const unlink = async () => {
    setAuthBusy(true)
    try {
      const s = await window.voidlens.clearWfmJwt()
      setSession(s)
      setOrders([])
      setOrdersError(null)
    } finally {
      setAuthBusy(false)
    }
  }

  const cancelOrder = async (id: string) => {
    setCancelBusyId(id)
    try {
      const res = await window.voidlens.deleteWfmOrder(id)
      if (!res.ok) {
        setOrdersError(res.error || 'Cancel failed')
        return
      }
      await refreshOrders()
    } finally {
      setCancelBusyId(null)
    }
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
        title="warframe.market account"
        subtitle="Paste your browser JWT — password never leaves the site"
        actions={
          session.linked ? (
            <button className="btn ghost" onClick={() => void unlink()} disabled={authBusy}>
              Sign out
            </button>
          ) : null
        }
      >
        {session.linked ? (
          <div className="market-session">
            <div>
              <strong>{session.ingameName}</strong>
              <div className="muted">
                {session.platform || 'pc'}
                {session.reputation != null ? ` · ${session.reputation} rep` : ''}
                {session.status ? ` · ${session.status}` : ''}
              </div>
            </div>
            <div className="market-actions">
              <button
                className="btn ghost"
                onClick={() =>
                  void window.voidlens.openExternal(
                    `https://warframe.market/profile/${encodeURIComponent(session.ingameName || '')}`,
                  )
                }
              >
                Profile
              </button>
              <button
                className="btn ghost"
                onClick={() => void refreshOrders()}
                disabled={ordersLoading}
              >
                {ordersLoading ? 'Loading…' : 'Refresh orders'}
              </button>
            </div>
          </div>
        ) : (
          <div className="market-jwt">
            <ol className="market-jwt-steps muted">
              <li>
                Open{' '}
                <button
                  type="button"
                  className="linkish"
                  onClick={() => void window.voidlens.openExternal('https://warframe.market/')}
                >
                  warframe.market
                </button>{' '}
                and sign in
              </li>
              <li>DevTools → Application/Storage → Cookies → warframe.market → JWT</li>
              <li>Copy the cookie value and paste it below</li>
            </ol>
            {onOpenHelp ? (
              <p className="muted market-jwt-help">
                Need screenshots-level detail?{' '}
                <button type="button" className="linkish" onClick={onOpenHelp}>
                  Full steps in Help
                </button>
              </p>
            ) : null}
            <textarea
              value={jwtDraft}
              placeholder="Paste JWT cookie value…"
              rows={3}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setJwtDraft(e.target.value)}
            />
            <div className="market-jwt-actions">
              <button
                className="btn primary"
                onClick={() => void linkJwt()}
                disabled={authBusy || !jwtDraft.trim()}
              >
                {authBusy ? 'Verifying…' : 'Link account'}
              </button>
            </div>
            {session.error ? <p className="market-error">{session.error}</p> : null}
            <p className="muted market-jwt-note">
              Token is stored encrypted on this PC when the OS allows it. You can create and cancel
              listings here; in-game trade completion still happens in Warframe.
            </p>
          </div>
        )}

        {session.linked ? (
          <div className="market-orders">
            <h4 className="market-orders-title">My orders</h4>
            {ordersError ? <p className="market-error">{ordersError}</p> : null}
            <ul className="market-list">
              {orders.length === 0 && !ordersLoading ? (
                <li className="muted">No open buy/sell orders.</li>
              ) : (
                orders.map((o) => (
                  <li key={o.id}>
                    <div>
                      <strong>
                        <span className={`market-order-type ${o.orderType}`}>
                          {o.orderType === 'sell' ? 'Sell' : 'Buy'}
                        </span>{' '}
                        {o.itemName}
                      </strong>
                      <div className="muted">
                        {o.platinum}p × {o.quantity}
                        {!o.visible ? ' · hidden' : ''}
                      </div>
                    </div>
                    <div className="market-actions">
                      {o.itemUrlName ? (
                        <button
                          className="btn ghost"
                          onClick={() =>
                            void window.voidlens.openExternal(
                              `https://warframe.market/items/${o.itemUrlName}`,
                            )
                          }
                        >
                          Open
                        </button>
                      ) : null}
                      <button
                        className="btn ghost danger"
                        disabled={cancelBusyId === o.id}
                        onClick={() => void cancelOrder(o.id)}
                      >
                        {cancelBusyId === o.id ? '…' : 'Cancel'}
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </Panel>

      <div className="section-gap" />

      <Panel
        title="Watchlist"
        subtitle="Median sell plat (PC) — no account needed"
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
