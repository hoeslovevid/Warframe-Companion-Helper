import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppSettings, WfmContract, WfmOrder, WfmSession } from '../../../shared/types'
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
  const [contracts, setContracts] = useState<WfmContract[]>([])
  const [contractsError, setContractsError] = useState<string | null>(null)
  const [contractsLoading, setContractsLoading] = useState(false)
  const [cancelContractBusyId, setCancelContractBusyId] = useState<string | null>(null)
  const [orderItemQuery, setOrderItemQuery] = useState('')
  const [orderHints, setOrderHints] = useState<Array<{ id: string; slug: string; name: string }>>([])
  const [orderItemId, setOrderItemId] = useState('')
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('sell')
  const [orderPlat, setOrderPlat] = useState('10')
  const [orderQty, setOrderQty] = useState('1')
  const [orderVisible, setOrderVisible] = useState(true)
  const [orderBusy, setOrderBusy] = useState(false)
  const [orderMsg, setOrderMsg] = useState<string | null>(null)
  const [contractKind, setContractKind] = useState<'riven' | 'lich' | 'sister'>('riven')
  const [contractWeapon, setContractWeapon] = useState('')
  const [contractStart, setContractStart] = useState('100')
  const [contractBuyout, setContractBuyout] = useState('100')
  const [contractDirect, setContractDirect] = useState(true)
  const [contractVisible, setContractVisible] = useState(true)
  const [contractRivenName, setContractRivenName] = useState('')
  const [contractAttrs, setContractAttrs] = useState('+critical_chance 100\n+critical_damage 100\n+multishot 90')
  const [contractRank, setContractRank] = useState('0')
  const [contractRolls, setContractRolls] = useState('0')
  const [contractPolarity, setContractPolarity] = useState('madurai')
  const [contractElement, setContractElement] = useState('heat')
  const [contractDamage, setContractDamage] = useState('25')
  const [contractEphemera, setContractEphemera] = useState(false)
  const [contractQuirk, setContractQuirk] = useState('')
  const [contractBusy, setContractBusy] = useState(false)
  const [contractMsg, setContractMsg] = useState<string | null>(null)
  const { state: relics } = useRelicScan()
  const { state: rivens } = useRivenScan()

  const watchlist = settings.marketWatchlist

  const refreshContracts = useCallback(async () => {
    setContractsLoading(true)
    setContractsError(null)
    try {
      const res = await window.voidlens.getWfmContracts()
      setContracts(res.contracts)
      setContractsError(res.error)
    } catch (err) {
      setContracts([])
      setContractsError(err instanceof Error ? err.message : 'Failed to load contracts')
    } finally {
      setContractsLoading(false)
    }
  }, [])

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
      if (s.linked) {
        void refreshOrders()
        void refreshContracts()
      } else {
        setOrders([])
        setOrdersError(null)
        setContracts([])
        setContractsError(null)
      }
    } catch {
      setSession(emptySession)
    }
  }, [refreshOrders, refreshContracts])

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

  useEffect(() => {
    if (!session.linked) return
    const q = orderItemQuery.trim()
    if (q.length < 2) {
      setOrderHints([])
      return
    }
    const handle = window.setTimeout(() => {
      void window.voidlens.searchWfmItems(q).then(setOrderHints).catch(() => setOrderHints([]))
    }, 250)
    return () => window.clearTimeout(handle)
  }, [orderItemQuery, session.linked])

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
        void refreshContracts()
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
      setContracts([])
      setContractsError(null)
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

  const cancelContract = async (id: string) => {
    setCancelContractBusyId(id)
    try {
      const res = await window.voidlens.deleteWfmContract(id)
      if (!res.ok) {
        setContractsError(res.error || 'Cancel failed')
        return
      }
      await refreshContracts()
    } finally {
      setCancelContractBusyId(null)
    }
  }

  const submitOrder = async () => {
    setOrderBusy(true)
    setOrderMsg(null)
    try {
      const res = await window.voidlens.createWfmOrder({
        itemId: orderItemId || undefined,
        itemSlugOrName: orderItemId ? undefined : orderItemQuery,
        orderType,
        platinum: Number(orderPlat),
        quantity: Number(orderQty),
        visible: orderVisible,
      })
      if (!res.ok) {
        setOrderMsg(res.error || 'Create failed')
        return
      }
      setOrderMsg(`Listed ${orderType} order`)
      setOrderItemQuery('')
      setOrderItemId('')
      await refreshOrders()
    } finally {
      setOrderBusy(false)
    }
  }

  const submitContract = async () => {
    setContractBusy(true)
    setContractMsg(null)
    try {
      const res = await window.voidlens.createWfmContract({
        kind: contractKind,
        weaponUrlName: contractWeapon,
        startingPrice: Number(contractStart),
        buyoutPrice: contractBuyout.trim() ? Number(contractBuyout) : null,
        isDirectSell: contractDirect,
        visible: contractVisible,
        rivenName: contractRivenName,
        attributesText: contractAttrs,
        modRank: Number(contractRank),
        reRolls: Number(contractRolls),
        polarity: contractPolarity,
        element: contractElement,
        damage: Number(contractDamage),
        havingEphemera: contractEphemera,
        quirk: contractQuirk,
      })
      if (!res.ok) {
        setContractMsg(res.error || 'Create failed')
        return
      }
      setContractMsg('Contract created')
      await refreshContracts()
    } finally {
      setContractBusy(false)
    }
  }

  const contractPriceLabel = (c: WfmContract) => {
    if (c.isDirectSell) {
      return `${c.buyoutPrice ?? c.startingPrice}p`
    }
    const bits = [`start ${c.startingPrice}p`]
    if (c.buyoutPrice != null) bits.push(`buyout ${c.buyoutPrice}p`)
    if (c.topBid != null) bits.push(`bid ${c.topBid}p`)
    return bits.join(' · ')
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
                onClick={() => {
                  void refreshOrders()
                  void refreshContracts()
                }}
                disabled={ordersLoading || contractsLoading}
              >
                {ordersLoading || contractsLoading ? 'Loading…' : 'Refresh listings'}
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
          <>
            <div className="market-orders">
              <h4 className="market-orders-title">New order</h4>
              <div className="market-create">
                <input
                  value={orderItemQuery}
                  placeholder="Item name (e.g. Nikana Prime Blade)"
                  onChange={(e) => {
                    setOrderItemQuery(e.target.value)
                    setOrderItemId('')
                  }}
                />
                {orderHints.length ? (
                  <ul className="market-hints">
                    {orderHints.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => {
                            setOrderItemQuery(h.name)
                            setOrderItemId(h.id)
                            setOrderHints([])
                          }}
                        >
                          {h.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="market-create-row">
                  <select
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value as 'buy' | 'sell')}
                  >
                    <option value="sell">Sell</option>
                    <option value="buy">Buy</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={orderPlat}
                    onChange={(e) => setOrderPlat(e.target.value)}
                    placeholder="Plat"
                    aria-label="Platinum"
                  />
                  <input
                    type="number"
                    min={1}
                    value={orderQty}
                    onChange={(e) => setOrderQty(e.target.value)}
                    placeholder="Qty"
                    aria-label="Quantity"
                  />
                  <label className="market-check">
                    <input
                      type="checkbox"
                      checked={orderVisible}
                      onChange={(e) => setOrderVisible(e.target.checked)}
                    />
                    Visible
                  </label>
                  <button
                    className="btn primary"
                    disabled={orderBusy || (!orderItemId && !orderItemQuery.trim())}
                    onClick={() => void submitOrder()}
                  >
                    {orderBusy ? '…' : 'Create'}
                  </button>
                </div>
                {orderMsg ? (
                  <p className={orderMsg.startsWith('Listed') ? 'muted' : 'market-error'}>{orderMsg}</p>
                ) : null}
              </div>
            </div>

            <div className="market-orders">
              <h4 className="market-orders-title">New contract</h4>
              <div className="market-create">
                <div className="market-create-row">
                  <select
                    value={contractKind}
                    onChange={(e) =>
                      setContractKind(e.target.value as 'riven' | 'lich' | 'sister')
                    }
                  >
                    <option value="riven">Riven</option>
                    <option value="lich">Kuva Lich</option>
                    <option value="sister">Sister</option>
                  </select>
                  <input
                    value={contractWeapon}
                    onChange={(e) => setContractWeapon(e.target.value)}
                    placeholder="weapon_url_name (e.g. nikana)"
                  />
                </div>
                {contractKind === 'riven' ? (
                  <>
                    <input
                      value={contractRivenName}
                      onChange={(e) => setContractRivenName(e.target.value)}
                      placeholder="Riven name (e.g. crita-vis)"
                    />
                    <div className="market-create-row">
                      <input
                        type="number"
                        value={contractRank}
                        onChange={(e) => setContractRank(e.target.value)}
                        placeholder="Rank"
                        aria-label="Mod rank"
                      />
                      <input
                        type="number"
                        value={contractRolls}
                        onChange={(e) => setContractRolls(e.target.value)}
                        placeholder="Rolls"
                        aria-label="Rerolls"
                      />
                      <select
                        value={contractPolarity}
                        onChange={(e) => setContractPolarity(e.target.value)}
                      >
                        <option value="madurai">Madurai</option>
                        <option value="naramon">Naramon</option>
                        <option value="vazarin">Vazarin</option>
                        <option value="zenurik">Zenurik</option>
                        <option value="unairu">Unairu</option>
                      </select>
                    </div>
                    <textarea
                      rows={4}
                      value={contractAttrs}
                      onChange={(e) => setContractAttrs(e.target.value)}
                      placeholder={'+critical_chance 187.2\n-ammo_maximum 6'}
                    />
                  </>
                ) : (
                  <div className="market-create-row">
                    <input
                      value={contractElement}
                      onChange={(e) => setContractElement(e.target.value)}
                      placeholder="element (heat, cold…)"
                    />
                    <input
                      type="number"
                      value={contractDamage}
                      onChange={(e) => setContractDamage(e.target.value)}
                      placeholder="Damage %"
                    />
                    {contractKind === 'sister' ? (
                      <input
                        value={contractQuirk}
                        onChange={(e) => setContractQuirk(e.target.value)}
                        placeholder="quirk_url_name"
                      />
                    ) : null}
                    <label className="market-check">
                      <input
                        type="checkbox"
                        checked={contractEphemera}
                        onChange={(e) => setContractEphemera(e.target.checked)}
                      />
                      Ephemera
                    </label>
                  </div>
                )}
                <div className="market-create-row">
                  <input
                    type="number"
                    min={1}
                    value={contractStart}
                    onChange={(e) => setContractStart(e.target.value)}
                    placeholder="Start plat"
                  />
                  <input
                    type="number"
                    min={1}
                    value={contractBuyout}
                    onChange={(e) => setContractBuyout(e.target.value)}
                    placeholder="Buyout plat"
                  />
                  <label className="market-check">
                    <input
                      type="checkbox"
                      checked={contractDirect}
                      onChange={(e) => setContractDirect(e.target.checked)}
                    />
                    Buyout listing
                  </label>
                  <label className="market-check">
                    <input
                      type="checkbox"
                      checked={contractVisible}
                      onChange={(e) => setContractVisible(e.target.checked)}
                    />
                    Visible
                  </label>
                  <button
                    className="btn primary"
                    disabled={contractBusy || !contractWeapon.trim()}
                    onClick={() => void submitContract()}
                  >
                    {contractBusy ? '…' : 'Create'}
                  </button>
                </div>
                {contractMsg ? (
                  <p className={contractMsg.includes('created') ? 'muted' : 'market-error'}>
                    {contractMsg}
                  </p>
                ) : null}
              </div>
            </div>

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

            <div className="market-orders">
              <h4 className="market-orders-title">My contracts</h4>
              <p className="muted market-jwt-note">
                Riven, Kuva Lich, and Sister of Parvos auctions from warframe.market.
              </p>
              {contractsError ? <p className="market-error">{contractsError}</p> : null}
              <ul className="market-list">
                {contracts.length === 0 && !contractsLoading ? (
                  <li className="muted">No open contracts.</li>
                ) : (
                  contracts.map((c) => (
                    <li key={c.id}>
                      <div>
                        <strong>
                          <span className={`market-order-type contract-${c.kind}`}>
                            {c.kind === 'riven'
                              ? 'Riven'
                              : c.kind === 'lich'
                                ? 'Lich'
                                : c.kind === 'sister'
                                  ? 'Sister'
                                  : 'Auction'}
                          </span>{' '}
                          {c.title}
                        </strong>
                        <div className="muted">
                          {contractPriceLabel(c)}
                          {c.isDirectSell ? ' · buyout' : ' · auction'}
                          {!c.visible ? ' · hidden' : ''}
                          {c.detail ? ` · ${c.detail}` : ''}
                        </div>
                      </div>
                      <div className="market-actions">
                        <button
                          className="btn ghost"
                          onClick={() => void window.voidlens.openExternal(c.marketUrl)}
                        >
                          Open
                        </button>
                        <button
                          className="btn ghost danger"
                          disabled={cancelContractBusyId === c.id}
                          onClick={() => void cancelContract(c.id)}
                        >
                          {cancelContractBusyId === c.id ? '…' : 'Cancel'}
                        </button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </>
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
