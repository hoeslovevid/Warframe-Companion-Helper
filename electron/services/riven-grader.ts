import { RivenRoll, RivenStatLine, RivenTier } from '../../shared/types'
import {
  applyPrefDesirability,
  gradeWithPreferences,
  loadRivenPreferences,
} from './riven-preferences'

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
    aliases: ['status chance'],
    max: 110,
    unit: '%',
    weight: 1.15,
  },
  'status duration': { aliases: ['status duration'], max: 110, unit: '%', weight: 0.7 },
  reload: { aliases: ['reload', 'reload speed'], max: 70, unit: '%', weight: 0.85 },
  'magazine capacity': {
    aliases: ['magazine', 'magazine capacity', 'mag capacity'],
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
    aliases: ['damage to corpus'],
    max: 60,
    unit: '%',
    weight: 0.4,
  },
  'damage to grineer': {
    aliases: ['damage to grineer'],
    max: 60,
    unit: '%',
    weight: 0.4,
  },
  'damage to infested': {
    aliases: ['damage to infested'],
    max: 60,
    unit: '%',
    weight: 0.35,
  },
  range: { aliases: ['range', 'melee range'], max: 2.2, unit: 'flat', weight: 1.05 },
  'combo duration': { aliases: ['combo duration'], max: 10, unit: 'flat', weight: 0.85 },
  'initial combo': { aliases: ['initial combo'], max: 30, unit: 'flat', weight: 0.9 },
  'finisher damage': { aliases: ['finisher damage'], max: 110, unit: '%', weight: 0.55 },
  'heavy attack efficiency': {
    aliases: ['heavy attack efficiency', 'heavy efficiency'],
    max: 90,
    unit: '%',
    weight: 0.7,
  },
  'combo chance': {
    aliases: ['combo chance', 'additional combo count chance', 'combo count chance'],
    max: 110,
    unit: '%',
    weight: 0.85,
  },
  'slide critical chance': {
    aliases: ['slide crit', 'slide critical', 'slide critical chance', 'slide attack critical chance'],
    max: 180,
    unit: '%',
    weight: 0.55,
  },
}

/** Fix common Warframe UI OCR mistakes before matching. */
function scrubOcr(s: string) {
  return s
    .replace(/[|*·•‚’‘]/g, ' ')
    // Elemental icon often splits "Cold" → "Col in" / "Col d" / bare "Col"
    .replace(/\bCol\s*i?n\b/gi, 'Cold')
    .replace(/\bCol\s*d\b/gi, 'Cold')
    .replace(/\bC0ld\b/gi, 'Cold')
    .replace(/\bCol\b/gi, 'Cold')
    .replace(/\bPun(?:ct(?:ure)?)?\b/gi, 'Puncture')
    .replace(/\bH0t\b|\bHea1\b/gi, 'Heat')
    .replace(/\bT0xin\b|\bToxln\b/gi, 'Toxin')
    .replace(/\bElec(?:tr(?:icity)?)?\b/gi, 'Electricity')
    .replace(/lnfected|lnfeste[dc]?/gi, 'Infested')
    .replace(/Grlneer/gi, 'Grineer')
    .replace(/Corp[uü]s/gi, 'Corpus')
    .replace(/\blgnis\b/gi, 'Ignis')
    .replace(/Mu1ti/gi, 'Multi')
    .replace(/Critica1/gi, 'Critical')
    .replace(/Critica?\s*Cha(?:n(?:ce)?)?/gi, 'Critical Chance')
    .replace(/\bChanc[ec]\b/gi, 'Chance')
    .replace(/Damaqe|Damag[eo]/gi, 'Damage')
    .replace(/Multish0t|Multisho(?:t)?/gi, 'Multishot')
    .replace(/Punch\s*Thr(?:ough)?/gi, 'Punch Through')
    .replace(/%\s*\*/g, '% ')
    .replace(/\*\s*%/g, '%')
    .replace(/([+\-]\d+(?:[.,]\d+)?)(%?)([A-Za-z])/g, '$1$2 $3')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalize(s: string) {
  return scrubOcr(s)
    .toLowerCase()
    .replace(/zo0m/g, 'zoom')
    .replace(/mu1ti/g, 'multi')
    .replace(/critica1/g, 'critical')
    .replace(/\bdamag[eo]\b/g, 'damage')
    .replace(/[^a-z0-9%.\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Prefer exact / contained alias matches. Do NOT match a short OCR name into a
 * longer alias (`critical chance` must not win `slide critical chance`).
 * Slide crit requires an explicit "slide" token in the OCR name.
 */
function matchStat(rawName: string) {
  const n = normalize(rawName)
  if (!n || n.length < 3) return null
  const hasSlide = /\bslide\b/.test(n)
  let best: { canon: string; meta: (typeof STAT_META)[string] } | null = null
  let bestScore = -1
  for (const [canon, meta] of Object.entries(STAT_META)) {
    if (canon === 'slide critical chance' && !hasSlide) continue
    for (const alias of meta.aliases) {
      let score = -1
      if (n === alias) score = 1000 + alias.length
      else if (n.includes(alias) && alias.length >= 4) score = 700 + alias.length
      else if (n.startsWith(alias) && alias.length >= 4) score = 600 + alias.length
      else if (
        alias.startsWith(n) &&
        n.length >= Math.max(4, Math.ceil(alias.length * 0.55))
      ) {
        // Truncated OCR of this alias ("critical cha", "multisho")
        score = 400 + n.length
      }
      if (score > bestScore) {
        bestScore = score
        best = { canon, meta }
      }
    }
  }
  return best
}

function isFactionDamageCanon(canon: string) {
  return canon.startsWith('damage to ')
}

/**
 * Resolve OCR `x1.27` / real `x1.5 Damage to …` into a signed percent token.
 * Faction damage is a true multiplier in-game (x1.5 = +50%); other % stats
 * often OCR as x-confused (+12.7% → x1.27).
 */
function resolveXToken(
  n: number,
  canon: string,
): { valueRaw: string; percent: string } | null {
  const meta = STAT_META[canon]
  if (!Number.isFinite(n) || n <= 0) return null
  if (isFactionDamageCanon(canon) && n >= 1 && n < 3.5) {
    const pct = Math.round((n - 1) * 1000) / 10
    if (meta && pct > meta.max * 1.85) return null
    return { valueRaw: `+${pct}`, percent: '%' }
  }
  if (meta?.unit === '%' && n < 3.5 && meta.max >= 20) {
    const pct = Math.round(n * 100) / 10
    if (pct > meta.max * 1.85) return null
    return { valueRaw: `+${pct}`, percent: '%' }
  }
  if (meta && n > meta.max * 1.85) return null
  return { valueRaw: `+${n}`, percent: meta?.unit === '%' ? '%' : '' }
}

function parseNumberToken(raw: string): number | null {
  const value = Number(raw.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(value) ? value : null
}

function buildStatLine(
  valueRaw: string,
  percentFlag: string,
  namePart: string,
  cleaned: string,
  /** When set, use this canon directly (alias search already decided). */
  trustedCanon?: string,
): RivenStatLine | null {
  const value = parseNumberToken(valueRaw)
  if (value == null) return null
  const unit: '%' | 'flat' = percentFlag === '%' ? '%' : 'flat'
  const negative = value < 0 || /^\s*-/.test(valueRaw) || /^\s*-/.test(cleaned)
  const abs = Math.abs(value)
  const hit =
    trustedCanon && STAT_META[trustedCanon]
      ? { canon: trustedCanon, meta: STAT_META[trustedCanon] }
      : matchStat(namePart)
  const max = hit?.meta.max || (unit === '%' ? 100 : 10)
  const quality = Math.max(0, Math.min(100, (abs / max) * 100))
  const desirable = hit ? (hit.meta.goodWhenNegative ? negative : !negative) : !negative

  return {
    raw: cleaned,
    name: hit?.canon || namePart.trim(),
    value: negative ? -abs : abs,
    unit: hit?.meta.unit || unit,
    negative,
    quality,
    desirable,
  }
}

/** Rivens have ≤4 lines; drop duplicate values / slide↔crit twins from multi-pass OCR. */
function dedupeStats(stats: RivenStatLine[]): RivenStatLine[] {
  const out: RivenStatLine[] = []
  for (const s of stats) {
    const twin = out.findIndex((p) => {
      if (Math.abs(Math.abs(p.value) - Math.abs(s.value)) > 0.051) return false
      if (p.name === s.name) return true
      const critPair =
        (p.name === 'critical chance' && s.name === 'slide critical chance') ||
        (p.name === 'slide critical chance' && s.name === 'critical chance')
      return critPair
    })
    if (twin < 0) {
      out.push(s)
      continue
    }
    const prev = out[twin]
    // Prefer plain critical chance over slide when values match.
    if (prev.name === 'slide critical chance' && s.name === 'critical chance') {
      out[twin] = s
    } else if (s.quality > prev.quality) {
      out[twin] = s
    }
  }
  return out.slice(0, 4)
}

const STATISH_WORD =
  /^(status|critical|cold|heat|toxin|damage|zoom|reload|puncture|impact|slash|electricity|multishot|magazine|ammo|fire|combo|range|recoil|slide|chance|speed|duration|efficiency|finisher|projectile|punch|through|corpus|grineer|infested|initial|heavy|attack|weapon)$/i

const CARD_CHROME =
  /^(accept|decline|cycle|kuva|confirm|cancel|riven|keep|take|current|new|reroll|vs|ok|yes|no|polarity|disposition|mastery)$/i

function isWeaponCandidate(line: string): boolean {
  if (line.length < 3 || line.length > 42) return false
  if (/\d/.test(line)) return false
  if (CARD_CHROME.test(line)) return false
  if (/mod|polarity|rank|mr\b|current|reroll|vs\b|kuva|cycle/i.test(line)) return false
  // Riven Latin names look like "Acri-critabin"
  if (/^[A-Za-z]+-[a-z]+$/i.test(line)) return false
  if (matchStat(line)) return false
  return /[A-Za-z]/.test(line)
}

function guessWeapon(text: string): string {
  // Full title: "Ignis Acri-critabin" / "Ignis Wraith Crita-geliada"
  const full = text.match(
    /\b([A-Z][a-z]+(?:\s+(?:Prime|Wraith|Vandal|Prisma|Coda|Kuva))?)\s+([A-Za-z]{3,}-[a-z]{3,})/i,
  )
  if (full) return `${full[1].trim()} ${full[2].trim()}`

  // Solid Latin (no hyphen): "Latron Critadex", "Latron Herado", "Paris Puracron"
  for (const m of text.matchAll(
    /\b([A-Z][a-z]+(?:\s+(?:Prime|Wraith|Vandal|Prisma|Coda|Kuva))?)\s+([A-Z][a-z]{4,20})\b/g,
  )) {
    const weapon = m[1].trim()
    const latin = m[2].trim()
    if (STATISH_WORD.test(weapon) || STATISH_WORD.test(latin)) continue
    if (matchStat(weapon) || matchStat(latin) || matchStat(`${weapon} ${latin}`)) continue
    if (/chance|damage|speed|rate|duration|capacity|through|multishot/i.test(latin)) continue
    return `${weapon} ${latin}`
  }

  const latinOnly = text.match(/\b([A-Za-z]{3,}-[a-z]{3,})\b/)
  const weaponOnly = text.match(
    /\b([A-Z][a-z]+(?:\s+(?:Prime|Wraith|Vandal|Prisma|Coda|Kuva))?)\b/,
  )
  if (weaponOnly && latinOnly && !matchStat(weaponOnly[1]) && !STATISH_WORD.test(weaponOnly[1])) {
    return `${weaponOnly[1]} ${latinOnly[1]}`
  }
  if (latinOnly) return latinOnly[1]

  for (const line of text.split(/\r?\n/)) {
    const cleaned = scrubOcr(line)
    if (isWeaponCandidate(cleaned)) return cleaned
  }
  return 'Unknown Riven'
}

/**
 * Pull every ±value + known-stat pair out of a mashed OCR blob.
 * Handles lines like: "+55.2%*Cold +97%Critical Chance ... -39.9%Multishot"
 */
function extractStatsFromBlob(ocrText: string): RivenStatLine[] {
  const blob = scrubOcr(ocrText.replace(/\r?\n/g, ' '))
  const stats: RivenStatLine[] = []
  const usedRanges: Array<{ start: number; end: number }> = []

  const overlaps = (start: number, end: number) =>
    usedRanges.some((r) => start < r.end && end > r.start)

  // Longest aliases first so "critical chance" wins over nothing shorter colliding.
  const aliasList: Array<{ alias: string; canon: string }> = []
  for (const [canon, meta] of Object.entries(STAT_META)) {
    for (const alias of meta.aliases) {
      aliasList.push({ alias, canon })
    }
  }
  aliasList.sort((a, b) => b.alias.length - a.alias.length)

  const lower = blob.toLowerCase()

  const findByValue = (valueRaw: string) => {
    const v = parseNumberToken(valueRaw)
    if (v == null) return -1
    return stats.findIndex((s) => Math.abs(Math.abs(s.value) - Math.abs(v)) < 0.051)
  }

  const tryPush = (
    valueRaw: string,
    percent: string,
    canon: string,
    valueStart: number,
    nameEnd: number,
  ) => {
    if (overlaps(valueStart, nameEnd)) return
    if (canon === 'slide critical chance' && !/\bslide\b/i.test(blob.slice(valueStart, nameEnd))) {
      return
    }
    const raw = blob.slice(valueStart, nameEnd).trim()
    const stat = buildStatLine(valueRaw, percent, canon, raw, canon)
    if (!stat) return
    const meta = STAT_META[canon]
    if (meta && Math.abs(stat.value) > meta.max * 1.85) return

    const sameValue = findByValue(valueRaw)
    if (sameValue >= 0) {
      const prev = stats[sameValue]
      // Same number again (multi-pass OCR) — keep one; prefer plain crit over slide.
      if (prev.name === 'slide critical chance' && canon === 'critical chance') {
        stats[sameValue] = stat
      }
      usedRanges.push({ start: valueStart, end: nameEnd })
      return
    }

    const existing = stats.findIndex((s) => s.name === stat.name)
    if (existing >= 0) {
      const prev = stats[existing]
      const prevDist = Math.abs(Math.abs(prev.value) - (meta?.max ?? 100) * 0.55)
      const nextDist = Math.abs(Math.abs(stat.value) - (meta?.max ?? 100) * 0.55)
      if (nextDist < prevDist) stats[existing] = stat
      usedRanges.push({ start: valueStart, end: nameEnd })
      return
    }
    stats.push(stat)
    usedRanges.push({ start: valueStart, end: nameEnd })
  }

  for (const { alias, canon } of aliasList) {
    let from = 0
    while (from < lower.length) {
      const idx = lower.indexOf(alias, from)
      if (idx < 0) break
      const nameEnd = idx + alias.length
      from = idx + 1
      if (overlaps(idx, nameEnd)) continue
      // Slide crit must actually say "slide" — never treat plain Critical Chance as slide.
      if (canon === 'slide critical chance' && !/\bslide\b/.test(lower.slice(Math.max(0, idx - 6), nameEnd))) {
        continue
      }

      const left = blob.slice(Math.max(0, idx - 22), idx)
      const signed = left.match(/([+\-]\s*\d+(?:[.,]\d+)?)\s*(%?)\s*$/)
      if (signed) {
        tryPush(signed[1], signed[2] || '', canon, idx - signed[0].length, nameEnd)
        continue
      }

      // Real faction mults are "x1.5 Damage to …"; other % stats often OCR as x-confused.
      const xToken = left.match(/\bx\s*(\d+[.,]\d+)\s*$/i)
      if (xToken) {
        const n = Number(String(xToken[1]).replace(',', '.'))
        const resolved = resolveXToken(n, canon)
        if (!resolved) continue
        tryPush(
          resolved.valueRaw,
          resolved.percent,
          canon,
          idx - xToken[0].length,
          nameEnd,
        )
      }
    }
  }

  // Fallback: each ±value / x-value chunk → fuzzy-match the following words
  if (stats.length < 4) {
    const chunks = blob
      .split(/(?=[+\-]\s*\d|\bx\s*\d)/i)
      .map((c) => c.trim())
      .filter(Boolean)
    for (const chunk of chunks) {
      let m = chunk.match(/^([+\-]\s*\d+(?:[.,]\d+)?)\s*(%?)\s*(.+)$/i)
      let valueRaw = m?.[1]
      let percent = m?.[2] || ''
      let namePart = m?.[3]
      if (!m) {
        const xm = chunk.match(/^x\s*(\d+[.,]\d+)\s+(.+)$/i)
        if (!xm) continue
        const n = Number(String(xm[1]).replace(',', '.'))
        namePart = xm[2]
        const hitPreview = matchStat(namePart.replace(/\s*[+\-x]\s*\d[\s\S]*$/i, '').trim())
        if (!hitPreview) continue
        const resolved = resolveXToken(n, hitPreview.canon)
        if (!resolved) continue
        valueRaw = resolved.valueRaw
        percent = resolved.percent
      }
      namePart = (namePart || '').replace(/\s*[+\-]\s*\d[\s\S]*$/i, '').replace(/\s*x\s*\d[\s\S]*$/i, '').trim()
      if (!valueRaw || !namePart || namePart.length > 40) continue
      if (findByValue(valueRaw) >= 0) continue
      const hit = matchStat(namePart)
      if (!hit) continue
      if (stats.some((s) => s.name === hit.canon)) continue
      const stat = buildStatLine(
        valueRaw,
        percent || (hit.meta.unit === '%' ? '%' : ''),
        hit.canon,
        chunk.slice(0, 56),
        hit.canon,
      )
      if (!stat) continue
      if (Math.abs(stat.value) > hit.meta.max * 1.85) continue
      stats.push(stat)
    }
  }

  return dedupeStats(stats)
}

/** Parse OCR block from one full riven card into structured stats + weapon guess. */
export function parseRivenOcr(ocrText: string, side: 'current' | 'reroll'): RivenRoll {
  loadRivenPreferences()
  const scrubbed = scrubOcr(ocrText)
  const stats = extractStatsFromBlob(scrubbed)
  const weapon = guessWeapon(scrubbed)
  const graded = gradeRoll(stats, weapon)
  return {
    side,
    weapon,
    ocrText,
    stats,
    score: graded.score,
    tier: graded.tier,
    prefsMatched: graded.prefsMatched,
    prefsNotes: graded.prefsNotes,
  }
}

/**
 * Grade a roll. When `weapon` matches the Megrim/Valkyrial sheet (rows 20+, A–F),
 * preferred positives/negatives drive the score; otherwise use generic weights.
 */
export function gradeRoll(
  stats: RivenStatLine[],
  weapon?: string,
): {
  score: number
  tier: RivenTier
  prefsMatched?: boolean
  prefsNotes?: string
} {
  if (!stats.length) return { score: 0, tier: 'F' }

  const pref = weapon ? gradeWithPreferences(weapon, stats) : null
  if (pref) {
    applyPrefDesirability(pref.profile, stats)
    // Blend sheet fit with raw roll quality so god-rolls still outrank trash values
    const generic = gradeRollGeneric(stats)
    const score = Math.round(pref.score * 0.72 + generic.score * 0.28)
    return {
      score,
      tier: scoreToTier(score),
      prefsMatched: true,
      prefsNotes: pref.notes,
    }
  }

  const generic = gradeRollGeneric(stats)
  return { ...generic, prefsMatched: false }
}

function gradeRollGeneric(stats: RivenStatLine[]): { score: number; tier: RivenTier } {
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
