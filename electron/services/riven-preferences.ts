import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

export type PrefStat = {
  code: string
  canon: string
  rank: number
  starred?: boolean
  slot?: number
}

export type WeaponProfile = {
  positives: PrefStat[]
  negatives: PrefStat[]
  notes?: string
}

export type WeaponPrefs = {
  name: string
  key: string
  profiles: WeaponProfile[]
}

type PrefFile = {
  source: string
  credit: string
  weapons: WeaponPrefs[]
}

let cache: PrefFile | null = null
let byKey: Map<string, WeaponPrefs> | null = null

function candidatePaths(): string[] {
  const packed = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'riven-preferences.json')
    : path.join(app.getAppPath(), 'resources', 'riven-preferences.json')
  return [
    packed,
    path.join(app.getAppPath(), 'resources', 'riven-preferences.json'),
    path.join(__dirname, '../../resources/riven-preferences.json'),
  ]
}

export function loadRivenPreferences(): PrefFile | null {
  if (cache) return cache
  for (const file of candidatePaths()) {
    try {
      if (!fs.existsSync(file)) continue
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as PrefFile
      if (!Array.isArray(raw.weapons) || !raw.weapons.length) continue
      cache = raw
      byKey = new Map(raw.weapons.map((w) => [w.key, w]))
      console.info(
        `[Everything Warframe] Riven preferences loaded: ${raw.weapons.length} weapons (${raw.credit})`,
      )
      return cache
    } catch (err) {
      console.warn('[Everything Warframe] Failed to load riven preferences', file, err)
    }
  }
  console.warn('[Everything Warframe] Riven preferences JSON not found — using generic grading')
  return null
}

function weaponKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Strip riven Latin name / chrome so "Ignis Acri-critabin" → "Ignis". */
export function weaponBaseName(weaponName: string): string {
  return weaponName
    .replace(/\briven\b/i, '')
    .replace(/\s+[A-Za-z]{3,}-[a-z]{3,}\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Find sheet prefs for an OCR weapon title (Ignis / Ignis Wraith / etc.). */
export function lookupWeaponPrefs(weaponName: string): WeaponPrefs | null {
  loadRivenPreferences()
  if (!byKey || !weaponName) return null
  const raw = weaponBaseName(weaponName)
  if (!raw || /^unknown/i.test(raw)) return null

  const key = weaponKey(raw)
  if (byKey.has(key)) return byKey.get(key) || null

  // Try dropping variant suffixes: "Ignis Wraith" → "Ignis", "Soma Prime" → "Soma"
  const base = raw
    .replace(
      /\b(prime|wraith|vandal|prisma|coda|kuva|dex|telos|secura|sancti|synoid|rakta|vaykor)\b/gi,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()
  const baseKey = weaponKey(base)
  if (baseKey && byKey.has(baseKey)) return byKey.get(baseKey) || null

  // Prefer longest sheet key contained in the OCR name (or vice versa)
  let best: WeaponPrefs | null = null
  for (const w of byKey.values()) {
    if (key.includes(w.key) || w.key.includes(key)) {
      if (!best || w.key.length > best.key.length) best = w
    }
  }
  return best
}

/**
 * Preference weight for a positive/negative stat against a profile.
 * Returns 0–1.5-ish multiplier contribution (higher = more desired).
 */
export function prefWeightForStat(
  profile: WeaponProfile,
  canon: string,
  isNegative: boolean,
): { weight: number; matched: boolean; goodNegative: boolean } {
  if (isNegative) {
    const hits = profile.negatives.filter((n) => n.canon === canon)
    if (!hits.length) return { weight: 0.35, matched: false, goodNegative: false }
    const best = Math.min(...hits.map((h) => h.rank))
    // Best negative (rank 0) is highly desirable when rolled as a curse
    const weight = best === 0 ? 1.25 : best === 1 ? 1.05 : 0.9
    return { weight, matched: true, goodNegative: true }
  }

  const hits = profile.positives.filter((p) => p.canon === canon)
  if (!hits.length) return { weight: 0.35, matched: false, goodNegative: false }
  const best = Math.min(...hits.map((h) => h.rank))
  const slotBoost = hits.some((h) => h.slot === 1) ? 0.15 : hits.some((h) => h.slot === 2) ? 0.08 : 0
  const weight = (best === 0 ? 1.35 : best === 1 ? 1.1 : 0.85) + slotBoost
  return { weight, matched: true, goodNegative: false }
}

/** Score a roll against one profile; higher is better. */
export function scoreAgainstProfile(
  profile: WeaponProfile,
  stats: Array<{ name: string; quality: number; negative: boolean; desirable: boolean }>,
): number {
  if (!stats.length) return 0
  let weighted = 0
  let weightSum = 0
  let penalty = 0
  let matchBonus = 0

  for (const s of stats) {
    const pref = prefWeightForStat(profile, s.name, s.negative)
    if (s.negative) {
      if (pref.goodNegative) {
        // Good curse: reward roll quality of the negative
        weighted += s.quality * pref.weight
        weightSum += pref.weight
        matchBonus += 4
      } else {
        penalty += (s.quality / 100) * 22
      }
      continue
    }

    // Positive
    if (pref.matched) {
      weighted += s.quality * pref.weight
      weightSum += pref.weight
      matchBonus += 5
    } else {
      // Unwanted positive — still some value from raw roll, but soft penalty
      weighted += s.quality * 0.35
      weightSum += 0.35
      penalty += 6
    }
  }

  const base = weightSum > 0 ? weighted / weightSum : 0
  const posMatched = stats.filter((s) => !s.negative && prefWeightForStat(profile, s.name, false).matched)
    .length
  const countBonus = Math.min(10, Math.max(0, posMatched - 1) * 4)
  return Math.max(0, Math.min(100, base + countBonus + Math.min(12, matchBonus) - penalty))
}

/** Best profile score for a weapon (multiple usability rows in the sheet). */
export function gradeWithPreferences(
  weaponName: string,
  stats: Array<{ name: string; quality: number; negative: boolean; desirable: boolean }>,
): {
  score: number
  weaponMatched: boolean
  notes?: string
  profile: WeaponProfile
  sheetWeapon: string
} | null {
  const prefs = lookupWeaponPrefs(weaponName)
  if (!prefs?.profiles.length) return null

  let best = -1
  let bestProfile = prefs.profiles[0]
  for (const profile of prefs.profiles) {
    const s = scoreAgainstProfile(profile, stats)
    if (s > best) {
      best = s
      bestProfile = profile
    }
  }
  return {
    score: Math.round(best),
    weaponMatched: true,
    notes: bestProfile.notes,
    profile: bestProfile,
    sheetWeapon: prefs.name,
  }
}

/** Mark stats desirable/undesirable using the winning sheet profile. */
export function applyPrefDesirability(profile: WeaponProfile, stats: Array<{ name: string; negative: boolean; desirable: boolean }>) {
  for (const s of stats) {
    if (s.negative) {
      s.desirable = prefWeightForStat(profile, s.name, true).goodNegative
    } else {
      s.desirable = prefWeightForStat(profile, s.name, false).matched
    }
  }
}
