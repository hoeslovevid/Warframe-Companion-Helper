/**
 * Unified warframe.market helpers (item orders + re-exports).
 */
import { lookupMarketPrices, suggestUndercutPrice } from './market-prices'
import type { MarketUndercutSuggestion } from '../../shared/types'

export type MarketQuote = {
  name: string
  platinum: number
  volume: number
}

export async function fetchItemQuotes(names: string[]): Promise<MarketQuote[]> {
  const map = await lookupMarketPrices(names)
  return names
    .map((name) => {
      const hit = map.get(name)
      return hit ? { name, platinum: hit.platinum, volume: hit.volume } : null
    })
    .filter((x): x is MarketQuote => !!x)
}

export async function fetchUndercutSuggestion(
  name: string,
): Promise<MarketUndercutSuggestion | null> {
  return suggestUndercutPrice(name)
}

export { lookupMarketPrices, suggestUndercutPrice }
