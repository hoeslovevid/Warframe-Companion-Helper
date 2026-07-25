import { NightwaveInfo } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useNow } from '../../hooks/useNow'
import { formatCountdown, isExpired } from '../../lib/time'
import '../cycles/module.css'

type Props = {
  nightwave: NightwaveInfo | null
  doneIds?: string[]
  onToggleDone?: (id: string) => void
  opacity?: number
  compact?: boolean
}

export function NightwavePanel({
  nightwave,
  doneIds = [],
  onToggleDone,
  opacity,
  compact,
}: Props) {
  const now = useNow()
  const challenges = (nightwave?.challenges || []).filter(
    (c) => !c.expiry || !isExpired(c.expiry, now),
  )
  const open = challenges.filter((c) => !doneIds.includes(c.id))
  const done = challenges.filter((c) => doneIds.includes(c.id))
  const shown = [...open, ...(compact ? [] : done)].slice(0, compact ? 4 : 10)

  return (
    <Panel
      title="Nightwave"
      subtitle={
        nightwave
          ? compact
            ? nightwave.tag
            : `${nightwave.tag} · ${open.length} open`
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
              {shown.map((c) => {
                const isDone = doneIds.includes(c.id)
                return (
                  <li
                    key={c.id}
                    className="mod-row"
                    style={isDone ? { opacity: 0.55 } : undefined}
                  >
                    <div>
                      <div className="mod-row__title">
                        {c.isElite ? 'Elite · ' : c.isDaily ? 'Daily · ' : 'Weekly · '}
                        {c.title}
                        {isDone ? ' ✓' : ''}
                      </div>
                      {!compact && c.description ? (
                        <div className="mod-row__meta">{c.description}</div>
                      ) : null}
                    </div>
                    <div className="mod-row__value" style={{ display: 'grid', gap: 4 }}>
                      {c.expiry ? formatCountdown(c.expiry, now) : c.reputation || '—'}
                      {onToggleDone && !compact ? (
                        <button
                          className="btn ghost"
                          style={{ fontSize: '0.7rem', padding: '2px 6px' }}
                          onClick={() => onToggleDone(c.id)}
                        >
                          {isDone ? 'Undo' : 'Done'}
                        </button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Panel>
  )
}
