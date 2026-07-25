import { NightwaveInfo } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useNow } from '../../hooks/useNow'
import { formatCountdown, isExpired } from '../../lib/time'
import '../cycles/module.css'

type Props = {
  nightwave: NightwaveInfo | null
  opacity?: number
  compact?: boolean
}

export function NightwavePanel({ nightwave, opacity, compact }: Props) {
  const now = useNow()
  const challenges = (nightwave?.challenges || []).filter(
    (c) => !c.expiry || !isExpired(c.expiry, now),
  )
  const shown = challenges.slice(0, compact ? 4 : 8)

  return (
    <Panel
      title="Nightwave"
      subtitle={
        nightwave
          ? compact
            ? nightwave.tag
            : `${nightwave.tag} · ${challenges.length} active`
          : 'Season status'
      }
      opacity={opacity}
    >
      {!nightwave ? (
        <p className="mod-empty">No Nightwave data</p>
      ) : (
        <div className="mod-stack">
          {!compact ? (
            <>
              <div className="mod-stat">
                <span className="mod-stat__label">Season</span>
                <span className="mod-stat__value">{nightwave.tag}</span>
              </div>
              <div className="mod-stat">
                <span className="mod-stat__label">Status</span>
                <span className={`mod-stat__value ${nightwave.active ? 'is-ok' : ''}`}>
                  {nightwave.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              {nightwave.expiry ? (
                <div className="mod-stat">
                  <span className="mod-stat__label">Season ends</span>
                  <span className="mod-stat__value">
                    {formatCountdown(nightwave.expiry, now)}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}

          {shown.length === 0 ? (
            <p className="mod-empty">No active challenges right now</p>
          ) : (
            <ul className="mod-list">
              {shown.map((c) => (
                <li key={c.id} className="mod-row">
                  <div>
                    <div className="mod-row__title">
                      {c.isElite ? 'Elite · ' : c.isDaily ? 'Daily · ' : 'Weekly · '}
                      {c.title}
                    </div>
                    {!compact && c.description ? (
                      <div className="mod-row__meta">{c.description}</div>
                    ) : null}
                    {compact && c.reputation > 0 ? (
                      <div className="mod-row__meta">{c.reputation} standing</div>
                    ) : null}
                  </div>
                  <div className="mod-row__value">
                    {c.expiry ? formatCountdown(c.expiry, now) : c.reputation || '—'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  )
}
