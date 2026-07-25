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
    <Panel
      title="Arbitration"
      subtitle="Schedule · rare drops Phase 3"
      opacity={opacity}
    >
      {!arbitration ? (
        <p className="mod-empty">No active arbitration reported</p>
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
          <p className="mod-empty">
            End-of-run rare item summaries from EE.log land in Phase 3.
          </p>
        </div>
      )}
    </Panel>
  )
}
