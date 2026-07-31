import type { InventoryBrowseItem, RelicDropSource, RelicPlannerRow, RewardEval, RivenRoll } from '../../shared/types'
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

/** Best-pick only lines (for reward screens). */
export function formatBestPickTradeLine(rewards: RewardEval[]): string {
  const best = rewards.filter((r) => r.bestPick && r.name && r.matchScore >= 0.4)
  const source = best.length ? best : rewards.filter((r) => r.name && r.matchScore >= 0.4)
  return formatRelicTradeLine(source)
}

/** Whisper-style template for a single item. */
export function formatWhisperTemplate(
  itemName: string,
  opts?: { platinum?: number | null; buy?: boolean },
): string {
  const tag = opts?.buy ? 'WTB' : 'WTS'
  const plat = opts?.platinum != null ? ` ${Math.round(opts.platinum)}p` : ''
  return `WFW ${tag} [${itemName}]${plat}`.replace(/\s+/g, ' ').trim()
}

/** Bulk WTS dump for sellable / ducat extras. */
export function formatSellablesDump(rows: InventoryBrowseItem[], limit = 24): string {
  return rows
    .filter((r) => r.excess > 0 && r.displayName)
    .slice(0, limit)
    .map((r) => {
      const price =
        r.platinum != null
          ? `${Math.round(r.platinum)}p`
          : r.ducats != null
            ? `${r.ducats}d`
            : ''
      const qty = r.excess > 1 ? ` x${r.excess}` : ''
      return price ? `WTS [${r.displayName}]${qty} ${price}` : `WTS [${r.displayName}]${qty}`
    })
    .join('  ')
}

/** List recommended relics for trade / party chat. */
export function formatRelicRecommendLine(rows: RelicPlannerRow[]): string {
  return rows
    .slice(0, 8)
    .map((r) => {
      const bits = [`×${r.owned}`]
      if (r.missingCount > 0) bits.push(`${r.missingCount} needed`)
      if (r.bestPlatinum != null) bits.push(`~${Math.round(r.bestPlatinum)}p`)
      return `${r.key} (${bits.join(', ')})`
    })
    .join(' · ')
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
