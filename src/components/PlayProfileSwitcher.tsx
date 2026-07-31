import { AppSettings, InventoryStatus, WorldstateSnapshot } from '../../shared/types'
import { PLAY_PROFILES, PlayProfileId, applyPlayProfile } from '../lib/playProfiles'
import './play-profiles.css'

type Props = {
  settings: AppSettings
  suggestedId: PlayProfileId | null
  suggestReason?: string | null
  onApply: (partial: Partial<AppSettings>) => void
  onDismissSuggest?: () => void
}

export function PlayProfileSwitcher({
  settings,
  suggestedId,
  suggestReason,
  onApply,
  onDismissSuggest,
}: Props) {
  return (
    <section className="play-profiles" aria-label="Play profiles">
      <div className="play-profiles__head">
        <div>
          <h3 className="play-profiles__title">Session profile</h3>
          <p className="play-profiles__sub">
            One click tunes overlay modules for what you’re farming.
          </p>
        </div>
      </div>
      {suggestedId && settings.activePlayProfile !== suggestedId ? (
        <div className="play-profiles__suggest" role="status">
          <span>
            Suggested: <strong>{PLAY_PROFILES.find((p) => p.id === suggestedId)?.label}</strong>
            {suggestReason ? ` — ${suggestReason}` : ''}
          </span>
          <span className="play-profiles__suggest-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => onApply(applyPlayProfile(settings, suggestedId))}
            >
              Switch
            </button>
            {onDismissSuggest ? (
              <button type="button" className="btn ghost" onClick={onDismissSuggest}>
                Dismiss
              </button>
            ) : null}
          </span>
        </div>
      ) : null}
      <div className="play-profiles__grid">
        {PLAY_PROFILES.map((profile) => {
          const active = settings.activePlayProfile === profile.id
          return (
            <button
              key={profile.id}
              type="button"
              className={`play-profiles__card ${active ? 'is-active' : ''}`}
              title={profile.description}
              onClick={() => onApply(applyPlayProfile(settings, profile.id))}
            >
              <span className="play-profiles__card-label">{profile.label}</span>
              <span className="play-profiles__card-desc">{profile.description}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** Infer a profile from live activity (relic/riven scan, Baro, cycles). */
export function suggestPlayProfile(opts: {
  relicActive: boolean
  rivenActive: boolean
  baroActive: boolean
  inventory: InventoryStatus | null
  data: WorldstateSnapshot
}): { id: PlayProfileId; reason: string } | null {
  if (opts.relicActive) return { id: 'fissure-grind', reason: 'relic reward screen detected' }
  if (opts.rivenActive) return { id: 'riven-farm', reason: 'riven compare screen detected' }
  if (opts.baroActive) return { id: 'baro-day', reason: 'Baro is at a relay' }
  const nw = opts.data.nightwave?.challenges?.length ?? 0
  if (nw >= 4) return { id: 'nightwave', reason: 'Nightwave challenges available' }
  return null
}
