import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppSettings, WfmContract, WfmOrder, WfmSession } from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
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
type MarketTab = 'watchlist' | 'orders' | 'contracts' | 'account'

const emptySession: WfmSession = {
  linked: false,
  ingameName: null,
  platform: null,
  reputation: null,
  status: null,
  error: null,
}

const TABS: Array<{ id: MarketTab; label: string }> = [
  { id: 'watchlist', label: 'Watchlist' },
  { id: 'orders', label: 'Orders' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'account', label: 'Account' },
]

function itemMarketUrl(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return `https://warframe.market/items/${slug}`
}

function contractPriceLabel(c: WfmContract) {
  if (c.isDirectSell) {
    return `${c.buyoutPrice ?? c.startingPrice}p`
  }
  const bits = [`start ${c.startingPrice}p`]
  if (c.buyoutPrice != null) bits.push(`buyout ${c.buyoutPrice}p`)
  if (c.topBid != null) bits.push(`bid ${c.topBid}p`)
  return bits.join(' · ')
}

function contractKindLabel(kind: WfmContract['kind']) {
  if (kind === 'riven') return 'Riven'
  if (kind === 'lich') return 'Lich'
  if (kind === 'sister') return 'Sister'
  return 'Auction'
}

export function MarketPage({ settings, enabled, onUpdate, onOpenHelp }: Props) {
  const [tab, setTab] = useState<MarketTab>('watchlist')
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
  const [showCreateOrder, setShowCreateOrder] = useState(false)
  const [showCreateContract, setShowCreateContract] = useState(false)
  const [orderItemQuery, setOrderItemQuery] = useState('')
  const [orderHints, setOrderHints] = useState<Array<{ id: string; slug: string; name: string }>>([])
  const [orderItemId, setOrderItemId] = useState('')
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('sell')
  const [orderPlat, setOrderPlat] = useState('10')
  const [undercutBusy, setUndercutBusy] = useState(false)
  const [undercutHint, setUndercutHint] = useState<string | null>(null)
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
  const [contractAttrs, setContractAttrs] = useState(
    '+critical_chance 100\n+critical_damage 100\n+multishot 90',
  )
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
      setShowCreateOrder(false)
      await refreshOrders()
    } finally {
      setOrderBusy(false)
    }
  }

  const applyUndercut = async () => {
    const name = orderItemQuery.trim()
    if (!name || !window.voidlens?.suggestMarketUndercut) return
    setUndercutBusy(true)
    setUndercutHint(null)
    try {
      const tip = await window.voidlens.suggestMarketUndercut(name)
      if (!tip) {
        setUndercutHint('No live sell orders found')
        return
      }
      setOrderPlat(String(tip.suggest))
      setUndercutHint(`Floor ${tip.floor}p · median ~${tip.median}p · suggest ${tip.suggest}p`)
    } finally {
      setUndercutBusy(false)
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
      setShowCreateContract(false)
      await refreshContracts()
    } finally {
      setContractBusy(false)
    }
  }

  const recentRelics = (relics.rewards || [])
    .filter((r) => r.platinum != null)
    .slice(0, 6)

  if (!enabled) {
    return (
      <Panel title="Market" subtitle="Module disabled">
        <EmptyState
          title="Module off"
          body="Enable Market under Modules to track platinum quotes and manage warframe.market listings."
        />
      </Panel>
    )
  }

  return (
    <div className="market-page">
      <header className="page-header">
        <h2 className="page-title">Market</h2>
        <div className="page-title-rule" />
        <p className="page-desc">
          Track platinum, manage warframe.market orders and contracts, and pull prices from the
          latest relic / riven scans.
        </p>
      </header>

      <section className={`market-session-bar ${session.linked ? 'is-linked' : ''}`}>
        {session.linked ? (
          <>
            <div className="market-session-bar__identity">
              <span className="market-session-bar__dot" aria-hidden />
              <div>
                <strong>{session.ingameName}</strong>
                <div className="muted">
                  {session.platform || 'pc'}
                  {session.reputation != null ? ` · ${session.reputation} rep` : ''}
                  {session.status ? ` · ${session.status}` : ''}
                  {` · ${orders.length} orders · ${contracts.length} contracts`}
                </div>
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
                {ordersLoading || contractsLoading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button className="btn ghost" onClick={() => void unlink()} disabled={authBusy}>
                Sign out
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <strong>Not signed in</strong>
              <div className="muted">Watchlist works offline · listing needs a JWT link</div>
            </div>
            <button className="btn primary" onClick={() => setTab('account')}>
              Link account
            </button>
          </>
        )}
      </section>

      <div className="vl-segment vl-segment--wrap market-tabs" role="tablist" aria-label="Market sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`vl-segment__btn ${tab === t.id ? 'is-on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'orders' && session.linked && orders.length > 0 ? (
              <span className="market-tab-count">{orders.length}</span>
            ) : null}
            {t.id === 'contracts' && session.linked && contracts.length > 0 ? (
              <span className="market-tab-count">{contracts.length}</span>
            ) : null}
            {t.id === 'watchlist' && watchlist.length > 0 ? (
              <span className="market-tab-count">{watchlist.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="market-layout">
        <div className="market-main">
          {tab === 'watchlist' ? (
            <Panel
              title="Watchlist"
              subtitle="Median sell platinum (PC) — no account needed"
              actions={
                <button className="btn ghost" onClick={() => void refresh()} disabled={loading}>
                  {loading ? 'Refreshing…' : 'Refresh prices'}
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

              {watchlist.length === 0 ? (
                <EmptyState
                  title="Watchlist empty"
                  body="Add prime parts or sets to track median sell platinum."
                />
              ) : (
                <div className="market-table" role="table">
                  <div className="market-table__head" role="row">
                    <span role="columnheader">Item</span>
                    <span role="columnheader">Plat</span>
                    <span role="columnheader">Volume</span>
                    <span role="columnheader" className="market-table__actions-col">
                      Actions
                    </span>
                  </div>
                  {watchlist.map((name) => {
                    const q = quoteByName.get(name.toLowerCase())
                    return (
                      <div className="market-table__row" role="row" key={name}>
                        <span className="market-table__name" role="cell">
                          {name}
                        </span>
                        <span className="market-plat" role="cell">
                          {q
                            ? `~${q.platinum}p`
                            : loading
                              ? '…'
                              : '—'}
                        </span>
                        <span className="muted" role="cell">
                          {q ? `${q.volume}` : '—'}
                        </span>
                        <span className="market-actions" role="cell">
                          <button
                            className="btn ghost"
                            onClick={() => void window.voidlens.openExternal(itemMarketUrl(name))}
                          >
                            Open
                          </button>
                          <button className="btn ghost" onClick={() => removeItem(name)}>
                            Remove
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          ) : null}

          {tab === 'orders' ? (
            <Panel
              title="Buy / sell orders"
              subtitle="Your open warframe.market listings"
              actions={
                session.linked ? (
                  <button
                    className={`btn ${showCreateOrder ? 'ghost' : 'primary'}`}
                    onClick={() => setShowCreateOrder((v) => !v)}
                  >
                    {showCreateOrder ? 'Hide form' : 'New order'}
                  </button>
                ) : null
              }
            >
              {!session.linked ? (
                <EmptyState
                  title="Sign in required"
                  body="Link your warframe.market JWT under Account to create and manage orders."
                  actions={
                    <button className="btn primary" onClick={() => setTab('account')}>
                      Go to Account
                    </button>
                  }
                />
              ) : (
                <>
                  {showCreateOrder ? (
                    <div className="market-create market-create--panel">
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
                        <div className="vl-segment" role="group" aria-label="Order type">
                          <button
                            type="button"
                            className={`vl-segment__btn ${orderType === 'sell' ? 'is-on' : ''}`}
                            onClick={() => setOrderType('sell')}
                          >
                            Sell
                          </button>
                          <button
                            type="button"
                            className={`vl-segment__btn ${orderType === 'buy' ? 'is-on' : ''}`}
                            onClick={() => setOrderType('buy')}
                          >
                            Buy
                          </button>
                        </div>
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
                          className="btn ghost"
                          type="button"
                          disabled={undercutBusy || !orderItemQuery.trim() || orderType !== 'sell'}
                          onClick={() => void applyUndercut()}
                          title="Set platinum to live lowest sell − 1"
                        >
                          {undercutBusy ? '…' : 'Undercut'}
                        </button>
                        <button
                          className="btn primary"
                          disabled={orderBusy || (!orderItemId && !orderItemQuery.trim())}
                          onClick={() => void submitOrder()}
                        >
                          {orderBusy ? 'Listing…' : 'Create'}
                        </button>
                      </div>
                      {undercutHint ? <p className="muted">{undercutHint}</p> : null}
                      {orderMsg ? (
                        <p className={orderMsg.startsWith('Listed') ? 'muted' : 'market-error'}>
                          {orderMsg}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {ordersError ? <p className="market-error">{ordersError}</p> : null}

                  {orders.length === 0 && !ordersLoading ? (
                    <EmptyState
                      title="No open orders"
                      body="Create a buy or sell listing, or refresh after posting on the website."
                      actions={
                        !showCreateOrder ? (
                          <button className="btn primary" onClick={() => setShowCreateOrder(true)}>
                            New order
                          </button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <ul className="market-card-list">
                      {orders.map((o) => (
                        <li key={o.id} className="market-card">
                          <div className="market-card__body">
                            <div className="market-card__title">
                              <span className={`market-chip market-chip--${o.orderType}`}>
                                {o.orderType === 'sell' ? 'Sell' : 'Buy'}
                              </span>
                              <strong>{o.itemName}</strong>
                            </div>
                            <div className="market-card__meta muted">
                              <span className="market-plat">{o.platinum}p</span>
                              <span>× {o.quantity}</span>
                              {!o.visible ? <span>Hidden</span> : null}
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
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Panel>
          ) : null}

          {tab === 'contracts' ? (
            <Panel
              title="Contracts"
              subtitle="Riven, Kuva Lich, and Sister auctions"
              actions={
                session.linked ? (
                  <button
                    className={`btn ${showCreateContract ? 'ghost' : 'primary'}`}
                    onClick={() => setShowCreateContract((v) => !v)}
                  >
                    {showCreateContract ? 'Hide form' : 'New contract'}
                  </button>
                ) : null
              }
            >
              {!session.linked ? (
                <EmptyState
                  title="Sign in required"
                  body="Link your warframe.market JWT under Account to manage auctions."
                  actions={
                    <button className="btn primary" onClick={() => setTab('account')}>
                      Go to Account
                    </button>
                  }
                />
              ) : (
                <>
                  {showCreateContract ? (
                    <div className="market-create market-create--panel">
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
                          {contractBusy ? 'Creating…' : 'Create'}
                        </button>
                      </div>
                      {contractMsg ? (
                        <p
                          className={
                            contractMsg.includes('created') ? 'muted' : 'market-error'
                          }
                        >
                          {contractMsg}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {contractsError ? <p className="market-error">{contractsError}</p> : null}

                  {contracts.length === 0 && !contractsLoading ? (
                    <EmptyState
                      title="No open contracts"
                      body="Post a riven / lich / sister listing, or refresh after creating one on the site."
                      actions={
                        !showCreateContract ? (
                          <button
                            className="btn primary"
                            onClick={() => setShowCreateContract(true)}
                          >
                            New contract
                          </button>
                        ) : undefined
                      }
                    />
                  ) : (
                    <ul className="market-card-list">
                      {contracts.map((c) => (
                        <li key={c.id} className="market-card">
                          <div className="market-card__body">
                            <div className="market-card__title">
                              <span className={`market-chip market-chip--${c.kind}`}>
                                {contractKindLabel(c.kind)}
                              </span>
                              <strong>{c.title}</strong>
                            </div>
                            <div className="market-card__meta muted">
                              <span className="market-plat">{contractPriceLabel(c)}</span>
                              <span>{c.isDirectSell ? 'Buyout' : 'Auction'}</span>
                              {!c.visible ? <span>Hidden</span> : null}
                              {c.detail ? <span>{c.detail}</span> : null}
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
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Panel>
          ) : null}

          {tab === 'account' ? (
            <Panel
              title="warframe.market account"
              subtitle="Paste your browser JWT — password never leaves the site"
            >
              {session.linked ? (
                <div className="market-account-linked">
                  <p>
                    Linked as <strong>{session.ingameName}</strong>
                    {session.reputation != null ? ` · ${session.reputation} rep` : ''}
                  </p>
                  <p className="muted market-jwt-note">
                    Token is stored encrypted on this PC when the OS allows it. In-game trade
                    completion still happens in Warframe.
                  </p>
                  <div className="market-actions">
                    <button
                      className="btn ghost"
                      onClick={() =>
                        void window.voidlens.openExternal(
                          `https://warframe.market/profile/${encodeURIComponent(session.ingameName || '')}`,
                        )
                      }
                    >
                      Open profile
                    </button>
                    <button className="btn ghost danger" onClick={() => void unlink()} disabled={authBusy}>
                      Sign out
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
                    Token is stored encrypted on this PC when the OS allows it. You can create and
                    cancel listings here; in-game trade completion still happens in Warframe.
                  </p>
                </div>
              )}
            </Panel>
          ) : null}
        </div>

        <aside className="market-side">
          <Panel title="Latest relic scan" subtitle="From the reward popup">
            {recentRelics.length ? (
              <ul className="market-scan-list">
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
              <p className="muted market-side-empty">No priced relic rewards yet.</p>
            )}
          </Panel>
          <Panel title="Latest riven scan" subtitle="Auction estimates">
            {rivens.current || rivens.reroll ? (
              <ul className="market-scan-list">
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
              <p className="muted market-side-empty">No riven scan yet.</p>
            )}
          </Panel>
        </aside>
      </div>
    </div>
  )
}
