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

export function BaroPanel({ baro, wishlist = [], onToggleWish, opacity, compact }: Props) {
  const now = useNow()
  const resolved = baro ? resolveBaro(baro, now) : null
  const inventory = baro?.inventory ?? []
  const wishedLive = inventory.filter((i) => isWished(i.item, wishlist))
  const visibleItems = compact ? inventory.slice(0, 6) : inventory
  const hiddenCount = Math.max(0, inventory.length - visibleItems.length)

  return (
    <Panel
      title="Baro Ki'Teer"
      subtitle={
        wishedLive.length
          ? `${wishedLive.length} wishlist hit${wishedLive.length > 1 ? 's' : ''}`
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
