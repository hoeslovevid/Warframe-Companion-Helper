import { RivenStatLine } from '../../shared/types'

/** Faction damage is shown in-game as a multiplier (x1.5); keep that on the overlay. */
export function formatRivenStatValue(stat: RivenStatLine): string {
  const neg = stat.negative || stat.value < 0
  const abs = Math.abs(stat.value)
  if (stat.name.startsWith('damage to ') && stat.unit === '%') {
    const mult = 1 + abs / 100
    const text = Number(mult.toFixed(2)).toString()
    return `${neg ? '-' : ''}x${text}`
  }
  return `${neg ? '-' : '+'}${abs}${stat.unit === '%' ? '%' : ''}`
}
