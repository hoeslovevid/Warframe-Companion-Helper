import { NightwaveInfo } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useNow } from '../../hooks/useNow'
import { formatCountdown } from '../../lib/time'
import '../cycles/module.css'

type Props = {
  nightwave: NightwaveInfo | null
  opacity?: number
}

export function NightwavePanel({ nightwave, opacity }: Props) {
  const now = useNow()

  return (
    <Panel title="Nightwave" subtitle="Season status" opacity={opacity}>
      {!nightwave ? (
        <p className="mod-empty">No Nightwave data</p>
      ) : (
        <div className="mod-stack">
          <div className="mod-stat">
            <span className="mod-stat__label">Season</span>
            <span className="mod-stat__value">
              {nightwave.tag || `Season ${nightwave.season}`}
            </span>
          </div>
          <div className="mod-stat">
            <span className="mod-stat__label">Phase</span>
            <span className="mod-stat__value">{nightwave.phase}</span>
          </div>
          <div className="mod-stat">
            <span className="mod-stat__label">Active</span>
            <span className={`mod-stat__value ${nightwave.active ? 'is-ok' : ''}`}>
              {nightwave.active ? 'Yes' : 'No'}
            </span>
          </div>
          {nightwave.expiry ? (
            <div className="mod-stat">
              <span className="mod-stat__label">Season ends</span>
              <span className="mod-stat__value">{formatCountdown(nightwave.expiry, now)}</span>
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  )
}
