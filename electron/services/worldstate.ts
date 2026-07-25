import {
  ArbitrationInfo,
  BaroInfo,
  CycleInfo,
  FissureInfo,
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
      phase?: number
    } | null>('/nightwave').catch(() => null),
    getJson<{
      node?: string
      type?: string
      enemy?: string
      expiry?: string
      eta?: string
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

  const nw: NightwaveInfo | null = nightwave
    ? {
        active: Boolean(nightwave.active ?? true),
        season: nightwave.season ?? 0,
        tag: nightwave.tag || 'Nightwave',
        expiry: nightwave.expiry || '',
        phase: nightwave.phase ?? 0,
      }
    : null

  const arb: ArbitrationInfo | null =
    arbitration && arbitration.node
      ? {
          node: arbitration.node,
          type: arbitration.type || 'Unknown',
          enemy: arbitration.enemy || 'Unknown',
          expiry: arbitration.expiry || '',
          eta: arbitration.eta || etaFromExpiry(arbitration.expiry),
        }
      : null

  return {
    fetchedAt: new Date().toISOString(),
    cycles,
    fissures: fissureList,
    baro,
    nightwave: nw,
    arbitration: arb,
  }
}
