import { InvasionInfo } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import '../cycles/module.css'

type Props = {
  invasions: InvasionInfo[]
  opacity?: number
  compact?: boolean
}

export function InvasionsPanel({ invasions, opacity, compact }: Props) {
  const list = invasions.slice(0, compact ? 5 : 10)
  return (
    <Panel
      title="Invasions"
      subtitle={invasions.length ? `${invasions.length} active` : 'None active'}
      opacity={opacity}
    >
      {list.length === 0 ? (
        <p className="mod-empty">No active invasions</p>
      ) : (
        <ul className="mod-list">
          {list.map((inv) => (
            <li key={inv.id} className="mod-row">
              <div>
                <div className="mod-row__title">{inv.node}</div>
                <div className="mod-row__meta">
                  {inv.attacker} vs {inv.defender}
                  {inv.desc ? ` · ${inv.desc}` : ''}
                </div>
              </div>
              <div className="mod-row__value">{Math.round(inv.completion)}%</div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
