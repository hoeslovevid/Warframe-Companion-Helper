import { CycleInfo } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useNow } from '../../hooks/useNow'
import { formatCountdown } from '../../lib/time'
import './module.css'

type Props = {
  cycles: CycleInfo[]
  opacity?: number
  compact?: boolean
}

export function CyclesPanel({ cycles, opacity, compact }: Props) {
  const now = useNow()

  return (
    <Panel
      title="World Cycles"
      subtitle={compact ? undefined : 'Live open-world timers'}
      opacity={opacity}
    >
      <ul className="mod-list">
        {cycles.map((cycle) => (
          <li key={cycle.id} className="mod-row">
            <div>
              <div className="mod-row__title">{cycle.name}</div>
              <div className="mod-row__meta">{cycle.state}</div>
            </div>
            <div className="mod-row__value">
              {formatCountdown(cycle.expiry, now)}
            </div>
          </li>
        ))}
        {cycles.length === 0 ? <li className="mod-empty">No cycle data yet</li> : null}
      </ul>
    </Panel>
  )
}
