import { useMemo } from 'react'
import { BaroInfo } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useNow } from '../../hooks/useNow'
import { formatCountdown, isExpired } from '../../lib/time'
import '../cycles/module.css'
import './baro.css'

type Props = {
  baro: BaroInfo | null
  wishlist?: string[]
  onToggleWish?: (item: string) => void
  /** Player ducats from inventory (optional). */
  playerDucats?: number | null
  /** Player credits from inventory (optional). */
  playerCredits?: number | null
  /** Sum of excess-part ducats available to dump at Baro (from inventory). */
  dumpableDucats?: number | null
  opacity?: number
  compact?: boolean
}

function formatCredits(n: number) {
  return n.toLocaleString('en-US')
}

function resolveBaro(baro: BaroInfo, now: number) {
  const arrivalMs = baro.arrival ? new Date(baro.arrival).getTime() : NaN
  const departureMs = baro.departure ? new Date(baro.departure).getTime() : NaN

  let active = baro.active
  if (!Number.isNaN(arrivalMs) && !Number.isNaN(departureMs)) {
    active = now >= arrivalMs && now < departureMs
  }

  const departed = !Number.isNaN(departureMs) && now >= departureMs
  const target = active ? baro.departure : departed ? null : baro.arrival

  return {
    active,
    departed,
    target,
    label: active ? 'Leaves in' : departed ? 'Visit ended' : 'Arrives in',
    status: active ? 'Arrived' : departed ? 'Departed' : 'In transit',
  }
}

function isWished(item: string, wishlist: string[]) {
  const n = item.toLowerCase()
  return wishlist.some((w) => n.includes(w.toLowerCase()) || w.toLowerCase().includes(n))
}

function affordLabel(
  entry: { ducats: number; credits: number },
  playerDucats: number | null | undefined,
  playerCredits: number | null | undefined,
): 'ok' | 'partial' | 'no' | null {
  if (playerDucats == null && playerCredits == null) return null
  const ducatsOk = playerDucats == null ? true : playerDucats >= entry.ducats
  const creditsOk = playerCredits == null ? true : playerCredits >= entry.credits
  if (ducatsOk && creditsOk) return 'ok'
  if (ducatsOk || creditsOk) return 'partial'
  return 'no'
}

export function BaroPanel({
  baro,
  wishlist = [],
  onToggleWish,
  playerDucats,
  playerCredits,
  dumpableDucats,
  opacity,
  compact,
}: Props) {
  const now = useNow()
  const resolved = baro ? resolveBaro(baro, now) : null
  const inventory = baro?.inventory ?? []
  const wishedLive = inventory.filter((i) => isWished(i.item, wishlist))
  const visibleItems = compact ? inventory.slice(0, 6) : inventory
  const hiddenCount = Math.max(0, inventory.length - visibleItems.length)

  const wishAfford = wishedLive.map((i) => ({
    item: i,
    afford: affordLabel(i, playerDucats, playerCredits),
  }))
  const canBuyWish = wishAfford.filter((w) => w.afford === 'ok').length

  const plan = useMemo(() => {
    if (!wishedLive.length) return null
    const needDucats = wishedLive.reduce((s, i) => s + (i.ducats || 0), 0)
    const needCredits = wishedLive.reduce((s, i) => s + (i.credits || 0), 0)
    const haveD = playerDucats ?? 0
    const haveC = playerCredits ?? 0
    const shortD = Math.max(0, needDucats - haveD)
    const shortC = Math.max(0, needCredits - haveC)
    const dump = dumpableDucats ?? 0
    return {
      needDucats,
      needCredits,
      shortD,
      shortC,
      dump,
      canCoverDucats: shortD <= 0 || (dump > 0 && dump >= shortD),
      afterDump: haveD + dump,
    }
  }, [wishedLive, playerDucats, playerCredits, dumpableDucats])

  return (
    <Panel
      title="Baro Ki'Teer"
      subtitle={
        wishedLive.length
          ? `${wishedLive.length} wishlist hit${wishedLive.length > 1 ? 's' : ''}${
              canBuyWish ? ` · ${canBuyWish} affordable` : ''
            }`
          : inventory.length
            ? `${inventory.length} items`
            : 'Void Trader'
      }
      opacity={opacity}
      className={compact ? undefined : 'baro-panel--wide'}
    >
      {!baro || !resolved ? (
        <p className="mod-empty">No trader data</p>
      ) : (
        <div className="mod-stack">
          {playerDucats != null || playerCredits != null ? (
            <p className="mod-empty" style={{ marginBottom: 0 }}>
              You have{' '}
              {playerDucats != null ? <strong>{formatCredits(playerDucats)} ⓓ</strong> : null}
              {playerDucats != null && playerCredits != null ? ' · ' : null}
              {playerCredits != null ? <strong>{formatCredits(playerCredits)} ₡</strong> : null}
            </p>
          ) : null}
          {plan && wishedLive.length ? (
            <div className="baro-plan">
              <div className="mod-stat">
                <span className="mod-stat__label">Wishlist total</span>
                <span className="mod-stat__value">
                  {formatCredits(plan.needDucats)} ⓓ
                  {plan.needCredits > 0 ? ` · ${formatCredits(plan.needCredits)} ₡` : ''}
                </span>
              </div>
              {plan.shortD > 0 || plan.shortC > 0 ? (
                <div className="mod-stat">
                  <span className="mod-stat__label">Short</span>
                  <span className="mod-stat__value is-warn">
                    {plan.shortD > 0 ? `${formatCredits(plan.shortD)} ⓓ` : ''}
                    {plan.shortD > 0 && plan.shortC > 0 ? ' · ' : ''}
                    {plan.shortC > 0 ? `${formatCredits(plan.shortC)} ₡` : ''}
                  </span>
                </div>
              ) : (
                <p className="mod-empty" style={{ color: 'var(--vl-teal)', margin: 0 }}>
                  Can afford full wishlist
                </p>
              )}
              {plan.shortD > 0 && dumpableDucats != null ? (
                <p className="mod-empty" style={{ margin: 0, fontSize: '0.78rem' }}>
                  {plan.canCoverDucats
                    ? `Dump ~${formatCredits(plan.shortD)} ⓓ from extras (you have ~${formatCredits(plan.dump)} ⓓ dumpable) to cover the gap.`
                    : `Extras cover ~${formatCredits(plan.dump)} ⓓ dumpable — still short ~${formatCredits(Math.max(0, plan.shortD - plan.dump))} ⓓ. Open Inventory → Ducat dump.`}
                </p>
              ) : null}
            </div>
          ) : null}
          {wishedLive.length && resolved.active ? (
            <p className="mod-empty" style={{ color: 'var(--vl-gold-soft)' }}>
              Wishlist in stock: {wishedLive.map((i) => i.item).join(', ')}
            </p>
          ) : null}
          <div className="mod-stat">
            <span className="mod-stat__label">Status</span>
            <span className={`mod-stat__value ${resolved.active ? 'is-ok' : ''}`}>
              {resolved.status}
            </span>
          </div>
          <div className="mod-stat">
            <span className="mod-stat__label">Relay</span>
            <span className="mod-stat__value">{baro.location}</span>
          </div>
          <div className="mod-stat">
            <span className="mod-stat__label">{resolved.label}</span>
            <span className="mod-stat__value">
              {resolved.target
                ? formatCountdown(resolved.target, now)
                : isExpired(baro.departure, now)
                  ? 'Waiting for next schedule'
                  : '—'}
            </span>
          </div>

          {inventory.length === 0 ? (
            <p className="mod-empty">
              {resolved.active
                ? 'No inventory listed for this visit'
                : 'Inventory appears when Baro is at a relay'}
            </p>
          ) : (
            <div className="baro-inv">
              <div className="baro-inv__head">
                <span>Item</span>
                <span>Ducats</span>
                <span>Credits</span>
              </div>
              <ul className="baro-inv__list">
                {visibleItems.map((entry) => {
                  const wished = isWished(entry.item, wishlist)
                  const afford = affordLabel(entry, playerDucats, playerCredits)
                  return (
                    <li
                      key={entry.uniqueName || entry.item}
                      className="baro-inv__row"
                      style={wished ? { color: 'var(--vl-gold-soft)' } : undefined}
                    >
                      <span className="baro-inv__name" title={entry.item}>
                        {onToggleWish && !compact ? (
                          <button
                            className="btn ghost"
                            style={{ marginRight: 6, padding: '0 6px', fontSize: '0.75rem' }}
                            onClick={() => onToggleWish(entry.item)}
                            title={wished ? 'Remove from wishlist' : 'Add to wishlist'}
                          >
                            {wished ? '★' : '☆'}
                          </button>
                        ) : wished ? (
                          '★ '
                        ) : null}
                        {entry.item}
                        {afford === 'ok' ? (
                          <span className="vl-pill is-ok" style={{ marginLeft: 6 }}>
                            Can buy
                          </span>
                        ) : afford === 'partial' ? (
                          <span className="vl-pill is-warn" style={{ marginLeft: 6 }}>
                            Partial
                          </span>
                        ) : afford === 'no' && wished ? (
                          <span className="vl-pill is-warn" style={{ marginLeft: 6 }}>
                            Short
                          </span>
                        ) : null}
                      </span>
                      <span className="baro-inv__ducats">{entry.ducats}</span>
                      <span className="baro-inv__credits">{formatCredits(entry.credits)}</span>
                    </li>
                  )
                })}
              </ul>
              {hiddenCount > 0 ? (
                <p className="baro-inv__more">+{hiddenCount} more in companion</p>
              ) : null}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
