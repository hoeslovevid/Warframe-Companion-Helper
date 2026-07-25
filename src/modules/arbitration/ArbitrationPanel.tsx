import { ArbitrationInfo } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useNow } from '../../hooks/useNow'
import { formatCountdown } from '../../lib/time'
import '../cycles/module.css'

type Props = {
  arbitration: ArbitrationInfo | null
  opacity?: number
}

export function ArbitrationPanel({ arbitration, opacity }: Props) {
  const now = useNow()

  return (
    <Panel title="Arbitration" subtitle="Current node" opacity={opacity}>
      {!arbitration ? (
        <p className="mod-empty">
          No active arbitration right now. When one is scheduled, the node and timer appear here.
        </p>
      ) : (
        <div className="mod-stack">
          <div className="mod-stat">
            <span className="mod-stat__label">Node</span>
            <span className="mod-stat__value">{arbitration.node}</span>
          </div>
          <div className="mod-stat">
            <span className="mod-stat__label">Mission</span>
            <span className="mod-stat__value">
              {arbitration.type} · {arbitration.enemy}
            </span>
          </div>
          <div className="mod-stat">
            <span className="mod-stat__label">Ends in</span>
            <span className="mod-stat__value">{formatCountdown(arbitration.expiry, now)}</span>
          </div>
        </div>
      )}
    </Panel>
  )
}
