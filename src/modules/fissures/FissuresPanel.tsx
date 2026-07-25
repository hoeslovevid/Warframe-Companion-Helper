import { FissureInfo } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useNow } from '../../hooks/useNow'
import { formatCountdown, isExpired } from '../../lib/time'
import '../cycles/module.css'

type Props = {
  fissures: FissureInfo[]
  tiers: string[]
  opacity?: number
  compact?: boolean
}

export function FissuresPanel({ fissures, tiers, opacity, compact }: Props) {
  const now = useNow()
  const filtered = fissures
    .filter((f) => tiers.includes(f.tier))
    .filter((f) => !isExpired(f.expiry, now))

  return (
    <Panel
      title="Fissures"
      subtitle={compact ? undefined : `${filtered.length} active`}
      opacity={opacity}
    >
      <ul className="mod-list">
        {filtered.slice(0, compact ? 8 : 20).map((f) => (
          <li key={f.id} className="mod-row">
            <div>
              <div className="mod-row__title">
                {f.tier}
                {f.isHard ? ' Steel Path' : ''} · {f.missionType}
              </div>
              <div className="mod-row__meta">
                {f.node} · {f.enemy}
              </div>
            </div>
            <div className="mod-row__value">{formatCountdown(f.expiry, now)}</div>
          </li>
        ))}
        {filtered.length === 0 ? (
          <li className="mod-empty">
            No fissures for your selected tiers. Open <strong>Modules → Fissure filters</strong> to
            enable Lith / Meso / Neo / Axi / Requiem, then refresh worldstate.
          </li>
        ) : null}
      </ul>
    </Panel>
  )
}
