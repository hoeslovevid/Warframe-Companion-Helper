import {
  ArbitrationInfo,
  BaroInfo,
  CycleInfo,
  FissureInfo,
  NightwaveChallenge,
  NightwaveInfo,
  WorldstateSnapshot,
} from '../../shared/types'

const BASE = 'https://api.warframestat.us/pc'

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'Accept-Language': 'en' },
  })
  if (!res.ok) {
    throw new Error(`Worldstate request failed: ${res.status} ${path}`)
  }
  return (await res.json()) as T
}

function etaFromExpiry(expiry?: string): string {
  if (!expiry) return '—'
  const ms = new Date(expiry).getTime() - Date.now()
  if (Number.isNaN(ms)) return '—'
  if (ms <= 0) return 'expired'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

type CyclePayload = {
  id?: string
  state?: string
  timeLeft?: string
  expiry?: string
  isDay?: boolean
  isWarm?: boolean
  isVome?: boolean
  active?: string
  stateLabel?: string
}

type VoidTraderPayload = {
  active?: boolean
  location?: string
  activation?: string
  expiry?: string
  endString?: string
  startString?: string
  inventory?: Array<{
    uniqueName?: string
    item?: string
    ducats?: number
    credits?: number
  }>
}

function cleanBaroItemName(name: string): string {
  return name
    .replace(/^Avatar Image\s+/i, '')
    .replace(/\s+Login Song Item$/i, ' Login Music')
    .trim()
}

function mapBaro(voidTrader: VoidTraderPayload | null | undefined): BaroInfo | null {
  if (!voidTrader) return null

  const arrival = voidTrader.activation || ''
  const departure = voidTrader.expiry || ''
  const now = Date.now()
  const startMs = arrival ? new Date(arrival).getTime() : NaN
  const endMs = departure ? new Date(departure).getTime() : NaN

  let active = Boolean(voidTrader.active)
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
    active = now >= startMs && now < endMs
  } else if (!Number.isNaN(startMs) && Number.isNaN(endMs)) {
    active = now >= startMs
  } else if (voidTrader.active === undefined) {
    active = false
  }

  const inventory = (voidTrader.inventory || [])
    .map((entry) => ({
      uniqueName: entry.uniqueName || entry.item || '',
      item: cleanBaroItemName(entry.item || 'Unknown item'),
      ducats: Number(entry.ducats) || 0,
      credits: Number(entry.credits) || 0,
    }))
    .filter((entry) => entry.item)
    .sort((a, b) => a.item.localeCompare(b.item))

  return {
    active,
    location: voidTrader.location || 'Unknown',
    arrival,
    departure,
    eta: active
      ? voidTrader.endString || etaFromExpiry(departure)
      : voidTrader.startString || etaFromExpiry(arrival),
    inventory,
  }
}

function mapCycle(id: string, name: string, data: CyclePayload): CycleInfo {
  let state = data.state || data.active || data.stateLabel || 'Unknown'
  if (!data.state && data.isDay !== undefined) state = data.isDay ? 'Day' : 'Night'
  if (!data.state && data.isWarm !== undefined) state = data.isWarm ? 'Warm' : 'Cold'
  if (!data.state && data.isVome !== undefined) state = data.isVome ? 'Vome' : 'Fass'

  return {
    id,
    name,
    state: String(state),
    timeLeft: data.timeLeft || etaFromExpiry(data.expiry),
    expiry: data.expiry || '',
  }
}

/** warframestat returns machine tags like "Radio Legion Intermission15 Syndicate". */
function formatNightwaveTag(tag: string | undefined, season: number): string {
  if (!tag) return season > 0 ? `Season ${season}` : 'Nightwave'
  const cleaned = tag
    .replace(/\s*Syndicate$/i, '')
    .replace(/^Radio Legion\s+/i, '')
    .replace(/Intermission(\d+)/i, 'Intermission $1')
    .replace(/\s+/g, ' ')
    .trim()
  if (/^Intermission\s*\d+/i.test(cleaned)) {
    return season > 0 ? `Nightwave Intermission · S${season}` : `Nightwave ${cleaned}`
  }
  return season > 0 ? `${cleaned} · S${season}` : cleaned
}

function isUsableExpiry(expiry?: string): boolean {
  if (!expiry) return false
  const ms = new Date(expiry).getTime()
  if (Number.isNaN(ms)) return false
  // Reject epoch / far-future API sentinels
  if (ms < Date.UTC(2000, 0, 1)) return false
  if (ms > Date.now() + 1000 * 60 * 60 * 24 * 365 * 5) return false
  return true
}

function mapNightwave(payload: {
  active?: boolean
  season?: number
  tag?: string
  expiry?: string
  activation?: string
  phase?: number
  activeChallenges?: Array<{
    id?: string
    title?: string
    desc?: string
    reputation?: number
    isDaily?: boolean
    isElite?: boolean
    expiry?: string
  }>
} | null): NightwaveInfo | null {
  if (!payload) return null

  const season = payload.season ?? 0
  const expiry = payload.expiry || ''
  const expiryMs = expiry ? new Date(expiry).getTime() : NaN
  const activationMs = payload.activation ? new Date(payload.activation).getTime() : NaN
  const now = Date.now()

  let active = Boolean(payload.active ?? true)
  if (!Number.isNaN(expiryMs) && now >= expiryMs) active = false
  if (!Number.isNaN(activationMs) && now < activationMs) active = false

  const challenges: NightwaveChallenge[] = (payload.activeChallenges || [])
    .map((c) => ({
      id: c.id || `${c.title || 'challenge'}-${c.expiry || ''}`,
      title: c.title || 'Challenge',
      description: c.desc || '',
      reputation: Number(c.reputation) || 0,
      isDaily: Boolean(c.isDaily),
      isElite: Boolean(c.isElite),
      expiry: c.expiry || '',
    }))
    .filter((c) => c.title)
    .sort((a, b) => {
      // Dailies first, then elite, then by expiry
      if (a.isDaily !== b.isDaily) return a.isDaily ? -1 : 1
      if (a.isElite !== b.isElite) return a.isElite ? -1 : 1
      return (a.expiry || '').localeCompare(b.expiry || '')
    })

  return {
    active,
    season,
    tag: formatNightwaveTag(payload.tag, season),
    expiry,
    phase: payload.phase ?? 0,
    challenges,
  }
}

function mapArbitration(payload: {
  node?: string
  nodeKey?: string
  type?: string
  enemy?: string
  expiry?: string
  eta?: string
  expired?: boolean
} | null): ArbitrationInfo | null {
  if (!payload?.node) return null
  if (payload.expired) return null
  // warframestat placeholder when no arbitration is scheduled
  if (payload.node === 'SolNode000' || payload.nodeKey === 'SolNode000') return null
  if (payload.type === 'Unknown' && payload.enemy === 'Tenno') return null
  if (!isUsableExpiry(payload.expiry)) return null

  return {
    node: payload.node,
    type: payload.type || 'Unknown',
    enemy: payload.enemy || 'Unknown',
    expiry: payload.expiry || '',
    eta: payload.eta || etaFromExpiry(payload.expiry),
  }
}

export async function fetchWorldstate(): Promise<WorldstateSnapshot> {
  const [
    cetus,
    vallis,
    cambion,
    duviri,
    zariman,
    albrecht,
    fissures,
    voidTrader,
    nightwave,
    arbitration,
  ] = await Promise.all([
    getJson<CyclePayload>('/cetusCycle'),
    getJson<CyclePayload>('/vallisCycle'),
    getJson<CyclePayload>('/cambionCycle'),
    getJson<CyclePayload>('/duviriCycle').catch(() => ({}) as CyclePayload),
    getJson<CyclePayload>('/zarimanCycle').catch(() => ({}) as CyclePayload),
    getJson<CyclePayload>('/entratiLabCycle').catch(() =>
      getJson<CyclePayload>('/albrechtCycle').catch(() => ({}) as CyclePayload),
    ),
    getJson<
      Array<{
        id: string
        node: string
        missionType: string
        enemy: string
        tier: string
        eta: string
        isHard: boolean
        expiry: string
      }>
    >('/fissures'),
    getJson<VoidTraderPayload>('/voidTrader'),
    getJson<{
      active?: boolean
      season?: number
      tag?: string
      expiry?: string
      activation?: string
      phase?: number
      activeChallenges?: Array<{
        id?: string
        title?: string
        desc?: string
        reputation?: number
        isDaily?: boolean
        isElite?: boolean
        expiry?: string
      }>
    } | null>('/nightwave').catch(() => null),
    getJson<{
      node?: string
      nodeKey?: string
      type?: string
      enemy?: string
      expiry?: string
      eta?: string
      expired?: boolean
    } | null>('/arbitration').catch(() => null),
  ])

  const cycles: CycleInfo[] = [
    mapCycle('cetus', 'Cetus / Earth', cetus),
    mapCycle('vallis', 'Orb Vallis', vallis),
    mapCycle('cambion', 'Cambion Drift', cambion),
  ]

  if (duviri && (duviri.state || duviri.expiry || duviri.timeLeft)) {
    cycles.push(mapCycle('duviri', 'Duviri', duviri))
  }
  if (zariman && (zariman.state || zariman.expiry || zariman.timeLeft)) {
    cycles.push(mapCycle('zariman', 'Zariman', zariman))
  }
  if (albrecht && (albrecht.state || albrecht.expiry || albrecht.timeLeft)) {
    cycles.push(mapCycle('albrecht', "Albrecht's Laboratories", albrecht))
  }

  const fissureList: FissureInfo[] = (fissures || []).map((f) => ({
    id: f.id,
    node: f.node,
    missionType: f.missionType,
    enemy: f.enemy,
    tier: f.tier,
    eta: f.eta || etaFromExpiry(f.expiry),
    isHard: Boolean(f.isHard),
    expiry: f.expiry,
  }))

  // warframestat often omits `active` — derive from activation/expiry windows
  const baro = mapBaro(voidTrader)

  const nw = mapNightwave(nightwave)
  const arb = mapArbitration(arbitration)

  return {
    fetchedAt: new Date().toISOString(),
    cycles,
    fissures: fissureList,
    baro,
    nightwave: nw,
    arbitration: arb,
  }
}

/** True when any cached countdown boundary has passed (main-process rollover). */
export function hasExpiredWorldstate(data: WorldstateSnapshot, now = Date.now()): boolean {
  const expiries: string[] = []
  for (const c of data.cycles) if (c.expiry) expiries.push(c.expiry)
  for (const f of data.fissures) if (f.expiry) expiries.push(f.expiry)
  if (data.baro) {
    if (data.baro.active && data.baro.departure) expiries.push(data.baro.departure)
    else if (!data.baro.active && data.baro.arrival) expiries.push(data.baro.arrival)
  }
  if (data.arbitration?.expiry) expiries.push(data.arbitration.expiry)
  if (data.nightwave?.expiry) expiries.push(data.nightwave.expiry)
  for (const c of data.nightwave?.challenges || []) {
    if (c.expiry) expiries.push(c.expiry)
  }

  return expiries.some((e) => {
    const end = new Date(e).getTime()
    // Ignore absurd far-future API sentinels
    if (!Number.isFinite(end) || end > now + 1000 * 60 * 60 * 24 * 365 * 5) return false
    return end <= now
  })
}
