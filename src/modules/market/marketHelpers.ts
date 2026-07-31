import type {
  InventoryBrowseItem,
  MarketMinPrice,
  MarketQuote,
  WfmOrder,
} from '../../../shared/types'

export function itemMarketUrl(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  return `https://warframe.market/items/${slug}`
}

export function formatTradeWhisper(order: WfmOrder): string {
  const tag = order.orderType === 'buy' ? 'WTB' : 'WTS'
  const qty = order.quantity > 1 ? ` x${order.quantity}` : ''
  return `WFW ${tag} [${order.itemName}]${qty} ${order.platinum}p`.replace(/\s+/g, ' ').trim()
}

export function formatSellWhisper(itemName: string, platinum: number, quantity = 1): string {
  const qty = quantity > 1 ? ` x${quantity}` : ''
  return `WFW WTS [${itemName}]${qty} ${Math.round(platinum)}p`.replace(/\s+/g, ' ').trim()
}

export function minSellFor(
  name: string,
  mins: MarketMinPrice[] | undefined,
): number | null {
  if (!mins?.length) return null
  const n = name.toLowerCase()
  const hit = mins.find((m) => m.name.toLowerCase() === n)
  return hit ? hit.minPlatinum : null
}

export function upsertMinSell(
  mins: MarketMinPrice[] | undefined,
  name: string,
  minPlatinum: number,
): MarketMinPrice[] {
  const cleaned = name.trim()
  const plat = Math.max(1, Math.floor(minPlatinum))
  const list = [...(mins || [])]
  const i = list.findIndex((m) => m.name.toLowerCase() === cleaned.toLowerCase())
  if (i >= 0) list[i] = { name: list[i].name, minPlatinum: plat }
  else list.push({ name: cleaned, minPlatinum: plat })
  return list
}

export function removeMinSell(mins: MarketMinPrice[] | undefined, name: string): MarketMinPrice[] {
  const n = name.toLowerCase()
  return (mins || []).filter((m) => m.name.toLowerCase() !== n)
}

/** Floor − 1, never below per-item min sell. */
export function suggestSellPrice(floor: number, minPlatinum: number | null | undefined): number {
  const under = Math.max(1, Math.floor(floor) - 1)
  if (minPlatinum != null && minPlatinum > 0) return Math.max(under, Math.floor(minPlatinum))
  return under
}

export type FlipSpread = {
  spread: number
  label: string
}

/** Median − floor: rough room to flip / list tightness. */
export function flipSpread(quote: MarketQuote | undefined): FlipSpread | null {
  if (!quote) return null
  const floor = quote.floor || quote.platinum
  const med = quote.platinum
  const spread = Math.max(0, med - floor)
  if (spread === 0) return { spread: 0, label: 'Tight' }
  return { spread, label: `+${spread}p` }
}

export type OrderHealth = {
  floor: number | null
  median: number | null
  volume: number | null
  /** Sell: live floor is below your price. Buy: unused for now. */
  undercut: boolean
  /** Sell: your price is margin+ above floor (too expensive). */
  stale: boolean
  /** Suggested reprice for sells: max(1, floor - 1, minSell). */
  suggest: number | null
  label: string | null
}

export function orderHealth(
  order: WfmOrder,
  quote: MarketQuote | undefined,
  staleMargin: number,
  minPlatinum?: number | null,
): OrderHealth {
  if (!quote) {
    return {
      floor: null,
      median: null,
      volume: null,
      undercut: false,
      stale: false,
      suggest: null,
      label: null,
    }
  }
  const floor = quote.floor || quote.platinum
  const suggest = suggestSellPrice(floor, minPlatinum)
  if (order.orderType === 'sell') {
    const undercut = floor < order.platinum
    const stale = order.platinum > floor + Math.max(0, staleMargin)
    let label: string | null = null
    if (undercut) label = `Floor ${floor}p — undercut`
    else if (stale) label = `Floor ${floor}p — stale (+${order.platinum - floor})`
    else if (order.platinum === floor || order.platinum === suggest)
      label = `At market · floor ${floor}p`
    else label = `Floor ${floor}p`
    if (minPlatinum != null && suggest > Math.max(1, floor - 1)) {
      label = `${label} · min ${minPlatinum}p`
    }
    return {
      floor,
      median: quote.platinum,
      volume: quote.volume,
      undercut,
      stale,
      suggest,
      label,
    }
  }
  return {
    floor,
    median: quote.platinum,
    volume: quote.volume,
    undercut: false,
    stale: false,
    suggest: null,
    label: `Live sell floor ${floor}p`,
  }
}

export function isBlacklisted(name: string, blacklist: string[]): boolean {
  const n = name.toLowerCase()
  return blacklist.some((b) => n === b.toLowerCase() || n.includes(b.toLowerCase()))
}

export function listedNameSet(orders: WfmOrder[]): Set<string> {
  return new Set(
    orders
      .filter((o) => o.orderType === 'sell')
      .map((o) => o.itemName.toLowerCase()),
  )
}

export function stockRowStatus(
  row: InventoryBrowseItem,
  listed: Set<string>,
  blacklist: string[],
): 'listed' | 'blocked' | 'ready' {
  if (isBlacklisted(row.displayName, blacklist)) return 'blocked'
  if (listed.has(row.displayName.toLowerCase())) return 'listed'
  return 'ready'
}
