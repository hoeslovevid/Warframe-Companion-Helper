import { ArchonHuntInfo } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useNow } from '../../hooks/useNow'
import { formatCountdown } from '../../lib/time'
import '../cycles/module.css'

type Props = {
  archonHunt: ArchonHuntInfo | null
  opacity?: number
  compact?: boolean
}

export function ArchonPanel({ archonHunt, opacity, compact }: Props) {
  const now = useNow()
  return (
    <Panel
      title="Archon Hunt"
      subtitle={archonHunt ? archonHunt.boss : 'Weekly'}
      opacity={opacity}
    >
      {!archonHunt ? (
        <p className="mod-empty">No Archon Hunt data</p>
      ) : (
        <div className="mod-stack">
          <div className="mod-stat">
            <span className="mod-stat__label">Boss</span>
            <span className="mod-stat__value is-ok">{archonHunt.boss}</span>
          </div>
          <div className="mod-stat">
            <span className="mod-stat__label">Faction</span>
            <span className="mod-stat__value">{archonHunt.faction}</span>
          </div>
          <div className="mod-stat">
            <span className="mod-stat__label">Resets</span>
            <span className="mod-stat__value">{formatCountdown(archonHunt.expiry, now)}</span>
          </div>
          <ul className="mod-list">
            {archonHunt.missions.slice(0, compact ? 3 : 5).map((m, i) => (
              <li key={`${m.node}-${i}`} className="mod-row">
                <div>
                  <div className="mod-row__title">
                    {i + 1}. {m.type}
                  </div>
                  <div className="mod-row__meta">{m.node}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
