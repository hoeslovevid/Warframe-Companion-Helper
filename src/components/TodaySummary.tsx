import {
  AppSettings,
  FissureInfo,
  WorldstateSnapshot,
} from '../../shared/types'
import { useNow } from '../hooks/useNow'
import { formatCountdown, isExpired } from '../lib/time'
import { Panel } from './Panel'
import '../modules/cycles/module.css'
import './today-summary.css'

type Props = {
  data: WorldstateSnapshot
  settings: AppSettings
}

function matchesPath(f: FissureInfo, settings: AppSettings) {
  if (settings.fissurePathMode === 'steel') return f.isHard
  if (settings.fissurePathMode === 'normal') return !f.isHard
  return true
}

export function TodaySummary({ data, settings }: Props) {
  const now = useNow()
  const done = new Set(settings.nightwaveDoneIds || [])

  const dailies = (data.nightwave?.challenges || []).filter(
    (c) =>
      c.isDaily &&
      !done.has(c.id) &&
      (!c.expiry || !isExpired(c.expiry, now)),
  )
  const weeklies = (data.nightwave?.challenges || []).filter(
    (c) =>
      !c.isDaily &&
      !done.has(c.id) &&
      (!c.expiry || !isExpired(c.expiry, now)),
  )

  const fissures = data.fissures
    .filter((f) => settings.fissureTiers.includes(f.tier))
    .filter((f) => matchesPath(f, settings))
    .filter((f) => settings.fissureShowStorms || !f.isStorm)
    .filter((f) => !isExpired(f.expiry, now))
    .slice()
    .sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime())
    .slice(0, 4)

  const invasions = data.invasions.filter((i) => !isExpired(i.expiry, now)).slice(0, 3)
  const baro = data.baro
  const archon = data.archonHunt

  return (
    <Panel title="Today" subtitle="Quick glance at what matters this session" className="today-panel">
      <div className="today-grid">
        <div className="today-cell">
          <div className="today-cell__label">Nightwave</div>
          {data.nightwave?.active ? (
            <>
              <div className="today-cell__value">
                {dailies.length} daily{dailies.length === 1 ? '' : 's'} left
              </div>
              <div className="today-cell__meta">
                {weeklies.length} weekly · season ends{' '}
                {data.nightwave.expiry
                  ? formatCountdown(data.nightwave.expiry, now)
                  : '—'}
              </div>
            </>
          ) : (
            <div className="today-cell__value muted">No season data</div>
          )}
        </div>

        <div className="today-cell">
          <div className="today-cell__label">Archon Hunt</div>
          {archon ? (
            <>
              <div className="today-cell__value">{archon.boss || 'Active'}</div>
              <div className="today-cell__meta">
                {archon.faction} · {formatCountdown(archon.expiry, now)}
              </div>
            </>
          ) : (
            <div className="today-cell__value muted">Unavailable</div>
          )}
        </div>

        <div className="today-cell">
          <div className="today-cell__label">Baro Ki'Teer</div>
          {baro ? (
            <>
              <div className="today-cell__value">
                {baro.active ? baro.location || 'In relay' : 'En route'}
              </div>
              <div className="today-cell__meta">
                {baro.active
                  ? `Leaves ${formatCountdown(baro.departure, now)}`
                  : `Arrives ${formatCountdown(baro.arrival || baro.eta, now)}`}
                {settings.baroWishlist.length
                  ? ` · ${settings.baroWishlist.length} wishlisted`
                  : ''}
              </div>
            </>
          ) : (
            <div className="today-cell__value muted">No schedule</div>
          )}
        </div>

        <div className="today-cell">
          <div className="today-cell__label">Invasions</div>
          <div className="today-cell__value">{invasions.length} open</div>
          <div className="today-cell__meta">
            {invasions.length
              ? invasions.map((i) => i.node).join(' · ')
              : 'None matching filters'}
          </div>
        </div>
      </div>

      {fissures.length > 0 ? (
        <div className="today-fissures">
          <div className="today-cell__label">Soonest fissures</div>
          <ul className="today-fissure-list">
            {fissures.map((f) => (
              <li key={f.id}>
                <span>
                  {f.tier} {f.missionType}
                  {f.isHard ? ' · SP' : ''}
                  {f.isStorm ? ' · Storm' : ''}
                </span>
                <span className="today-fissure-list__eta">
                  {f.node} · {formatCountdown(f.expiry, now)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  )
}
