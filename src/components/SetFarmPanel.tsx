import type { SetFarmPart, SetFarmRelicSource, SetFarmResult } from '../../shared/types'
import { ItemThumb } from './ItemThumb'

type Props = {
  farm: SetFarmResult
  /** Compact layout for embedding under Relic Planner search. */
  compact?: boolean
  onOpenFoundry?: (uniqueName: string) => void
}

function formatSource(s: SetFarmRelicSource): string {
  const chance = s.chance != null ? ` ${s.chance}%` : ''
  const owned = s.owned > 0 ? ` · ×${s.owned}` : ''
  const vault = s.vaulted ? ' · vaulted' : ''
  return `${s.key} (${s.rarity}${chance}${owned}${vault})`
}

function PartSources({ part }: { part: SetFarmPart }) {
  if (part.have) return null

  const hasOwned = part.sourcesOwned.length > 0
  const hasOther = part.sourcesOther.length > 0

  if (!hasOwned && !hasOther) {
    return (
      <div className="set-farm__sources">
        <span className="muted" style={{ fontSize: '0.75rem' }}>
          No relic drops listed (resource / shop / other)
        </span>
      </div>
    )
  }

  return (
    <div className="set-farm__sources-stack">
      {hasOwned ? (
        <div className="set-farm__sources is-owned">
          <span className="set-farm__sources-label">From your relics</span>
          {part.sourcesOwned.map((s) => (
            <span key={s.key} className="set-farm__chip is-owned">
              {formatSource(s)}
            </span>
          ))}
        </div>
      ) : (
        <div className="set-farm__sources">
          <span className="set-farm__sources-label">No matching owned relics</span>
        </div>
      )}
      {hasOther ? (
        <div className="set-farm__sources">
          <span className="set-farm__sources-label">
            {hasOwned ? 'Other drops' : 'Other / vaulted drops'}
          </span>
          {part.sourcesOther.map((s) => (
            <span key={s.key} className="set-farm__chip">
              {formatSource(s)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function SetFarmPanel({ farm, compact, onOpenFoundry }: Props) {
  if (farm.error) {
    return <p className="muted">{farm.error}</p>
  }
  if (!farm.parts.length) return null

  const missing = farm.parts.filter((p) => !p.have)
  const farmable = missing.filter(
    (p) => p.sourcesOwned.length > 0 || p.sourcesOther.length > 0,
  )
  const resources = missing.filter(
    (p) => p.sourcesOwned.length === 0 && p.sourcesOther.length === 0,
  )

  return (
    <div className={`set-farm ${compact ? 'set-farm--compact' : ''}`}>
      <div className="set-farm__header">
        <ItemThumb imageName={farm.imageName} name={farm.name} size={compact ? 'md' : 'lg'} />
        <div className="set-farm__header-text">
          <div className="set-farm__title-row">
            <h4 className="set-farm__title">{farm.name}</h4>
            {onOpenFoundry ? (
              <button
                type="button"
                className="btn ghost"
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                onClick={() => onOpenFoundry(farm.uniqueName)}
              >
                Open in Foundry
              </button>
            ) : null}
          </div>
          <div className="foundry-list__meta">
            {farm.ownedFinished ? (
              <span className="vl-pill is-ok">Finished item owned</span>
            ) : null}
            <span className={`vl-pill ${farm.missingCount ? 'is-warn' : 'is-ok'}`}>
              {farm.haveCount}/{farm.parts.length} parts
            </span>
            {farm.missingCount > 0 ? (
              <span className="vl-pill is-warn">{farm.missingCount} missing</span>
            ) : (
              <span className="vl-pill is-ready">Set complete</span>
            )}
          </div>
        </div>
      </div>

      <div className="foundry-section-title">Parts checklist</div>
      <ul className="set-farm__parts">
        {farm.parts.map((part) => (
          <li key={part.uniqueName} className={part.have ? 'is-ok' : 'is-missing'}>
            <div className="foundry-row">
              <ItemThumb imageName={part.imageName} name={part.name} size="sm" />
              <div className="foundry-row__body">
                <span className="set-farm__part-name">{part.name}</span>
              </div>
            </div>
            <span className={part.have ? 'is-ok' : 'is-missing'}>
              {part.have
                ? `Have ${part.owned}/${part.required}`
                : `Need ${part.missing} · own ${part.owned}`}
            </span>
          </li>
        ))}
      </ul>

      {missing.length > 0 ? (
        <>
          <div className="foundry-section-title">Where to farm missing parts</div>
          {farmable.length ? (
            <ul className="set-farm__farm-list">
              {farmable.map((part) => (
                <li key={`farm-${part.uniqueName}`}>
                  <div className="set-farm__farm-part">
                    <ItemThumb imageName={part.imageName} name={part.name} size="sm" />
                    <strong>{part.name}</strong>
                  </div>
                  <PartSources part={part} />
                </li>
              ))}
            </ul>
          ) : null}
          {resources.length ? (
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>
              Also missing (not from relics):{' '}
              {resources.map((r) => r.name).join(', ')}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
