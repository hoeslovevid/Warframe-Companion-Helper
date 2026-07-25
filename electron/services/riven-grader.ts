import { RivenRoll, RivenStatLine, RivenTier } from '../../shared/types'

/**
 * Approximate max rolled values at ~1.0 disposition / rank 8 (community averages).
 * Used for relative quality scoring — not a full disposition table.
 */
const STAT_META: Record<
  string,
  { aliases: string[]; max: number; unit: '%' | 'flat'; goodWhenNegative?: boolean; weight?: number }
> = {
  'critical chance': {
    aliases: ['crit chance', 'critical chance'],
    max: 180,
    unit: '%',
    weight: 1.2,
  },
  'critical damage': {
    aliases: ['crit damage', 'critical damage'],
    max: 140,
    unit: '%',
    weight: 1.25,
  },
  multishot: { aliases: ['multishot'], max: 110, unit: '%', weight: 1.3 },
  damage: { aliases: ['damage', 'base damage'], max: 200, unit: '%', weight: 1.1 },
  'fire rate': { aliases: ['fire rate', 'attack speed'], max: 90, unit: '%', weight: 1.0 },
  'status chance': {
    aliases: ['status chance', 'status'],
    max: 110,
    unit: '%',
    weight: 1.15,
  },
  'status duration': { aliases: ['status duration'], max: 110, unit: '%', weight: 0.7 },
  reload: { aliases: ['reload', 'reload speed'], max: 70, unit: '%', weight: 0.85 },
  'magazine capacity': {
    aliases: ['magazine', 'magazine capacity', 'mag'],
    max: 70,
    unit: '%',
    weight: 0.8,
  },
  'ammo maximum': { aliases: ['ammo maximum', 'ammo max'], max: 90, unit: '%', weight: 0.55 },
  'projectile speed': {
    aliases: ['projectile speed', 'flight speed'],
    max: 110,
    unit: '%',
    weight: 0.5,
  },
  punchthrough: { aliases: ['punch through', 'punchthrough'], max: 3.2, unit: 'flat', weight: 0.9 },
  'toxin damage': { aliases: ['toxin', 'toxin damage'], max: 110, unit: '%', weight: 0.95 },
  'heat damage': { aliases: ['heat', 'heat damage'], max: 110, unit: '%', weight: 0.95 },
  'cold damage': { aliases: ['cold', 'cold damage'], max: 110, unit: '%', weight: 0.9 },
  'electricity damage': {
    aliases: ['electricity', 'electric', 'electricity damage'],
    max: 110,
    unit: '%',
    weight: 0.9,
  },
  'slash damage': { aliases: ['slash', 'slash damage'], max: 120, unit: '%', weight: 1.0 },
  'puncture damage': {
    aliases: ['puncture', 'puncture damage'],
    max: 120,
    unit: '%',
    weight: 0.75,
  },
  'impact damage': { aliases: ['impact', 'impact damage'], max: 120, unit: '%', weight: 0.65 },
  zoom: { aliases: ['zoom'], max: 70, unit: '%', goodWhenNegative: true, weight: 0.6 },
  recoil: { aliases: ['recoil'], max: 90, unit: '%', goodWhenNegative: true, weight: 0.85 },
  'weapon recoil': {
    aliases: ['weapon recoil'],
    max: 90,
    unit: '%',
    goodWhenNegative: true,
    weight: 0.85,
  },
  'damage to corpus': {
    aliases: ['damage to corpus', 'corpus'],
    max: 60,
    unit: '%',
    weight: 0.4,
  },
  'damage to grineer': {
    aliases: ['damage to grineer', 'grineer'],
    max: 60,
    unit: '%',
    weight: 0.4,
  },
  'damage to infested': {
    aliases: ['damage to infested', 'infested'],
    max: 60,
    unit: '%',
    weight: 0.35,
  },
  range: { aliases: ['range', 'melee range'], max: 2.2, unit: 'flat', weight: 1.05 },
  'combo duration': { aliases: ['combo duration'], max: 10, unit: 'flat', weight: 0.85 },
  'initial combo': { aliases: ['initial combo'], max: 30, unit: 'flat', weight: 0.9 },
  'finisher damage': { aliases: ['finisher damage'], max: 110, unit: '%', weight: 0.55 },
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9%.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchStat(rawName: string) {
  const n = normalize(rawName)
  for (const [canon, meta] of Object.entries(STAT_META)) {
    if (meta.aliases.some((a) => n.includes(a) || a.includes(n))) {
      return { canon, meta }
    }
  }
  return null
}

/** Parse OCR block from one riven card into structured stats + weapon guess. */
export function parseRivenOcr(ocrText: string, side: 'current' | 'reroll'): RivenRoll {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  let weapon = 'Unknown Riven'
  const stats: RivenStatLine[] = []

  for (const line of lines) {
    const cleaned = line.replace(/\s+/g, ' ').trim()
    // Skip UI chrome
    if (/^(accept|decline|cycle|kuva|confirm|cancel|riven)$/i.test(cleaned)) continue

    const m = cleaned.match(/^([+\-]?\s*\d+(?:[.,]\d+)?)\s*(%?)\s*(.+)$/i)
    if (m) {
      const value = Number(m[1].replace(',', '.').replace(/\s/g, ''))
      if (!Number.isFinite(value)) continue
      const unit: '%' | 'flat' = m[2] === '%' ? '%' : 'flat'
      const namePart = m[3].trim()
      const negative = value < 0 || /^\-/.test(m[1]) || /^-/.test(cleaned)
      const abs = Math.abs(value)
      const hit = matchStat(namePart)
      const canon = hit?.canon || normalize(namePart)
      const max = hit?.meta.max || (unit === '%' ? 100 : 10)
      const quality = Math.max(0, Math.min(100, (abs / max) * 100))
      const desirable = hit
        ? hit.meta.goodWhenNegative
          ? negative
          : !negative
        : !negative

      stats.push({
        raw: cleaned,
        name: hit?.canon || namePart,
        value: negative ? -abs : abs,
        unit: hit?.meta.unit || unit,
        negative,
        quality,
        desirable,
      })
      continue
    }

    // Weapon / title line (no leading number)
    if (!/\d/.test(cleaned) && cleaned.length > 2 && cleaned.length < 40) {
      if (!/mod|polarity|rank|mr\b/i.test(cleaned)) {
        weapon = cleaned.replace(/\briven\b/i, '').trim() || weapon
      }
    }
  }

  const { score, tier } = gradeRoll(stats)
  return {
    side,
    weapon,
    ocrText,
    stats,
    score,
    tier,
  }
}

export function gradeRoll(stats: RivenStatLine[]): { score: number; tier: RivenTier } {
  if (!stats.length) return { score: 0, tier: 'F' }

  let weighted = 0
  let weightSum = 0
  let penalty = 0

  for (const s of stats) {
    const hit = matchStat(s.name)
    const w = hit?.meta.weight ?? 0.7
    if (s.desirable) {
      weighted += s.quality * w
      weightSum += w
    } else {
      // Bad negative or unwanted positive
      penalty += (s.quality / 100) * 18 * w
    }
  }

  const base = weightSum > 0 ? weighted / weightSum : 0
  // Slight bonus for more desirable positives (2–3)
  const posCount = stats.filter((s) => s.desirable && !s.negative).length
  const countBonus = Math.min(8, Math.max(0, posCount - 1) * 3)
  const score = Math.max(0, Math.min(100, base + countBonus - penalty))

  return { score: Math.round(score), tier: scoreToTier(score) }
}

export function scoreToTier(score: number): RivenTier {
  if (score >= 88) return 'S'
  if (score >= 75) return 'A'
  if (score >= 60) return 'B'
  if (score >= 45) return 'C'
  if (score >= 30) return 'D'
  return 'F'
}

export function recommendRolls(
  current: RivenRoll | null,
  reroll: RivenRoll | null,
): 'keep' | 'take' | 'similar' | 'none' {
  if (!current || !reroll) return 'none'
  const delta = reroll.score - current.score
  if (Math.abs(delta) < 4) return 'similar'
  return delta > 0 ? 'take' : 'keep'
}
