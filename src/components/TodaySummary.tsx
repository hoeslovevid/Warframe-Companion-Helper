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
  inventoryStale?: boolean
  onNavigate?: (tab: string) => void
  onSyncInventory?: () => void
  onApplyBaroProfile?: () => void
}

function matchesPath(f: FissureInfo, settings: AppSettings) {
  if (settings.fissurePathMode === 'steel') return f.isHard
  if (settings.fissurePathMode === 'normal') return !f.isHard
  return true
}

export function TodaySummary({
  data,
  settings,
  inventoryStale,
  onNavigate,
  onSyncInventory,
  onApplyBaroProfile,
}: Props) {
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
  const soonest = fissures[0] || null

  const brief =
    dailies.length > 0
      ? {
          label: 'Session focus',
          value: `${dailies.length} Nightwave daily${dailies.length === 1 ? '' : 's'} left`,
          meta: weeklies.length
            ? `${weeklies.length} weekly still open · season ${
                data.nightwave?.expiry
                  ? formatCountdown(data.nightwave.expiry, now)
                  : '—'
              }`
            : data.nightwave?.expiry
              ? `Season ends ${formatCountdown(data.nightwave.expiry, now)}`
              : 'Keep an eye on weeklies when they refresh',
        }
      : soonest
        ? {
            label: 'Next fissure',
            value: `${soonest.tier} ${soonest.missionType}${soonest.isHard ? ' · SP' : ''}`,
            meta: `${soonest.node} · ${formatCountdown(soonest.expiry, now)}`,
          }
        : baro?.active
          ? {
              label: 'Baro is in relay',
              value: baro.location || 'Relay visit',
              meta: `Leaves ${formatCountdown(baro.departure, now)}${
                settings.baroWishlist.length
                  ? ` · ${settings.baroWishlist.length} wishlisted`
                  : ''
              }`,
            }
          : archon
            ? {
                label: 'Archon Hunt',
                value: archon.boss || 'Active',
                meta: `${archon.faction} · ${formatCountdown(archon.expiry, now)}`,
              }
            : {
                label: 'Session brief',
                value: 'Worldstate quiet',
                meta: 'Enable modules or refresh when something looks off',
              }

  const nextActions: Array<{ label: string; run: () => void }> = []
  if (inventoryStale && onSyncInventory) {
    nextActions.push({ label: 'Sync inventory', run: onSyncInventory })
  }
  if (baro?.active && settings.baroWishlist.length && onApplyBaroProfile) {
    nextActions.push({ label: 'Baro day profile', run: onApplyBaroProfile })
  }
  if (dailies.length > 0 && onNavigate) {
    nextActions.push({ label: 'Nightwave focus', run: () => onNavigate('dashboard') })
  }
  if (settings.modules.relicRecommend && onNavigate) {
    nextActions.push({ label: 'Relic recommend', run: () => onNavigate('relicPlanner') })
  }
  if (settings.modules.market && onNavigate) {
    nextActions.push({ label: 'Market session', run: () => onNavigate('market') })
  }

  return (
    <Panel title="Today" subtitle="What matters this session" className="today-panel">
      <div className="today-brief">
        <div className="today-brief__primary">
          <div className="today-brief__label">{brief.label}</div>
          <p className="today-brief__value">{brief.value}</p>
          <p className="today-brief__meta">{brief.meta}</p>
          {nextActions.length ? (
            <div className="today-next" style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <span className="today-cell__label" style={{ width: '100%' }}>
                What next
              </span>
              {nextActions.slice(0, 4).map((a) => (
                <button key={a.label} type="button" className="btn ghost" onClick={a.run}>
                  {a.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="today-grid">
          <div className="today-cell">
            <div className="today-cell__label">Archon</div>
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
            <div className="today-cell__label">Baro</div>
            {baro ? (
              <>
                <div className="today-cell__value">
                  {baro.active ? baro.location || 'In relay' : 'En route'}
                </div>
                <div className="today-cell__meta">
                  {baro.active
                    ? `Leaves ${formatCountdown(baro.departure, now)}`
                    : `Arrives ${formatCountdown(baro.arrival || baro.eta, now)}`}
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

          <div className="today-cell">
            <div className="today-cell__label">Sortie</div>
            {data.sortie ? (
              <>
                <div className="today-cell__value">{data.sortie.boss}</div>
                <div className="today-cell__meta">
                  {data.sortie.faction}
                  {data.sortie.expiry
                    ? ` · ${formatCountdown(data.sortie.expiry, now)}`
                    : ''}
                </div>
              </>
            ) : (
              <div className="today-cell__value muted">Unavailable</div>
            )}
          </div>
        </div>

        {(data.alerts || []).length > 0 ? (
          <div className="today-fissures">
            <div className="today-cell__label">Alerts</div>
            <ul className="today-fissure-list">
              {(data.alerts || [])
                .filter((a) => !a.expiry || !isExpired(a.expiry, now))
                .slice(0, 3)
                .map((a) => (
                  <li key={a.id}>
                    <span>
                      {a.node} · {a.missionType}
                    </span>
                    <span className="today-fissure-list__eta">
                      {a.reward}
                      {a.expiry ? ` · ${formatCountdown(a.expiry, now)}` : ''}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}

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
      </div>
    </Panel>
  )
}
