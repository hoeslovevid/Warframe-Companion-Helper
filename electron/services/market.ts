/**
 * Phase 2: warframe.market price lookups with disk cache.
 */
export type MarketQuote = {
  slug: string
  average: number | null
  volume: number | null
}

export async function fetchItemQuote(_slug: string): Promise<MarketQuote | null> {
  return null
}
