import type { RelicDropSource, RewardEval, RivenRoll } from '../../shared/types'
import { formatRivenStatValue } from './rivenFormat'

/** Build a Warframe trade-chat line from a relic reward scan. */
export function formatRelicTradeLine(rewards: RewardEval[]): string {
  return rewards
    .filter((r) => r.name && r.matchScore >= 0.4)
    .map((r) => {
      const price =
        r.platinum != null ? `${Math.round(r.platinum)}p` : r.ducats != null ? `${r.ducats}d` : ''
      const tag = r.needed ? 'WTB' : 'WTS'
      return price ? `${tag} [${r.name}] ${price}` : `${tag} [${r.name}]`
    })
    .join('  ')
}

/** Build a WTS line for a graded riven roll. */
export function formatRivenTradeLine(roll: RivenRoll): string {
  const stats = roll.stats
    .map((s) => formatRivenStatValue(s))
    .filter(Boolean)
    .join(' ')
  const plat = roll.platinum != null ? ` ~${Math.round(roll.platinum)}p` : ''
  const pol = roll.polarity ? ` ${roll.polarity}` : ''
  return `WTS [${roll.weapon}]${pol} ${stats}${plat}`.replace(/\s+/g, ' ').trim()
}

export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function formatDropSourcesLine(sources: RelicDropSource[]): string {
  if (!sources.length) return 'No relic drops found'
  return sources
    .slice(0, 12)
    .map((s) => `${s.key} (${s.rarity}${s.chance != null ? ` ${s.chance}%` : ''})`)
    .join(' · ')
}
