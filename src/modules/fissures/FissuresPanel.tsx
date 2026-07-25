import { FissureInfo, FissureSort } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useNow } from '../../hooks/useNow'
import { formatCountdown, isExpired } from '../../lib/time'
import '../cycles/module.css'

const TIER_ORDER = ['Lith', 'Meso', 'Neo', 'Axi', 'Requiem']

type Props = {
  fissures: FissureInfo[]
  tiers: string[]
  showSteelPath?: boolean
  sort?: FissureSort
  opacity?: number
  compact?: boolean
}

export function FissuresPanel({
  fissures,
  tiers,
  showSteelPath = true,
  sort = 'eta',
  opacity,
  compact,
}: Props) {
  const now = useNow()
  const filtered = fissures
    .filter((f) => tiers.includes(f.tier))
    .filter((f) => showSteelPath || !f.isHard)
    .filter((f) => !isExpired(f.expiry, now))
    .slice()
    .sort((a, b) => {
      if (sort === 'tier') {
        const ta = TIER_ORDER.indexOf(a.tier)
        const tb = TIER_ORDER.indexOf(b.tier)
        if (ta !== tb) return ta - tb
      }
      return new Date(a.expiry).getTime() - new Date(b.expiry).getTime()
    })

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
            No fissures for your filters. Enable tiers / Steel Path under Modules, then refresh.
          </li>
        ) : null}
      </ul>
    </Panel>
  )
}
