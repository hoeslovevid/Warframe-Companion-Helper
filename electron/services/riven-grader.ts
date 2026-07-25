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

/** Prefer longest alias match; allow truncated OCR prefixes ("critical cha", "multisho"). */
function matchStat(rawName: string) {
  const n = normalize(rawName)
  if (!n || n.length < 3) return null
  let best: { canon: string; meta: (typeof STAT_META)[string] } | null = null
  let bestLen = 0
  for (const [canon, meta] of Object.entries(STAT_META)) {
    for (const alias of meta.aliases) {
      const prefixOk =
        (alias.startsWith(n) && n.length >= 4) || (n.startsWith(alias) && alias.length >= 4)
      if (
        n === alias ||
        n.includes(alias) ||
        (alias.includes(n) && n.length >= 4) ||
        prefixOk
      ) {
        if (alias.length > bestLen) {
          bestLen = alias.length
          best = { canon, meta }
        }
      }
    }
  }
  return best
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
): RivenStatLine | null {
  const value = parseNumberToken(valueRaw)
  if (value == null) return null
  const unit: '%' | 'flat' = percentFlag === '%' ? '%' : 'flat'
  const negative = value < 0 || /^\s*-/.test(valueRaw) || /^\s*-/.test(cleaned)
  const abs = Math.abs(value)
  const hit = matchStat(namePart)
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

  const latinOnly = text.match(/\b([A-Za-z]{3,}-[a-z]{3,})\b/)
  const weaponOnly = text.match(
    /\b([A-Z][a-z]+(?:\s+(?:Prime|Wraith|Vandal|Prisma|Coda|Kuva))?)\b/,
  )
  if (weaponOnly && latinOnly && !matchStat(weaponOnly[1])) {
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

  const tryPush = (
    valueRaw: string,
    percent: string,
    canon: string,
    valueStart: number,
    nameEnd: number,
  ) => {
    if (overlaps(valueStart, nameEnd)) return
    const raw = blob.slice(valueStart, nameEnd).trim()
    const stat = buildStatLine(valueRaw, percent, canon, raw)
    if (!stat) return
    const meta = STAT_META[canon]
    if (meta && Math.abs(stat.value) > meta.max * 1.85) return
    const existing = stats.findIndex((s) => s.name === stat.name)
    if (existing >= 0) {
      const prev = stats[existing]
      const prevDist = Math.abs(Math.abs(prev.value) - meta.max * 0.55)
      const nextDist = Math.abs(Math.abs(stat.value) - meta.max * 0.55)
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

      const left = blob.slice(Math.max(0, idx - 22), idx)
      const signed = left.match(/([+\-]\s*\d+(?:[.,]\d+)?)\s*(%?)\s*$/)
      if (signed) {
        tryPush(signed[1], signed[2] || '', canon, idx - signed[0].length, nameEnd)
        continue
      }

      // OCR often turns "+12.7%" into "x1.27" (plus→x, digit slip) before the stat name.
      const xConfused = left.match(/\bx\s*(\d+[.,]\d+)\s*$/i)
      if (xConfused) {
        const meta = STAT_META[canon]
        let n = Number(String(xConfused[1]).replace(',', '.'))
        if (!Number.isFinite(n) || n <= 0) continue
        // Real disposition is ~1.0–1.55; rolled % stats are rarely that small.
        if (meta?.unit === '%' && n < 3.5 && meta.max >= 20) n = Math.round(n * 100) / 10
        if (meta && n > meta.max * 1.85) continue
        tryPush(`+${n}`, '%', canon, idx - xConfused[0].length, nameEnd)
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
        let n = Number(String(xm[1]).replace(',', '.'))
        namePart = xm[2]
        const hitPreview = matchStat(namePart.replace(/\s*[+\-x]\s*\d[\s\S]*$/i, '').trim())
        if (hitPreview?.meta.unit === '%' && n < 3.5 && hitPreview.meta.max >= 20) {
          n = Math.round(n * 100) / 10
        }
        valueRaw = `+${n}`
        percent = '%'
      }
      namePart = (namePart || '').replace(/\s*[+\-]\s*\d[\s\S]*$/i, '').replace(/\s*x\s*\d[\s\S]*$/i, '').trim()
      if (!valueRaw || !namePart || namePart.length > 40) continue
      const hit = matchStat(namePart)
      if (!hit) continue
      if (stats.some((s) => s.name === hit.canon)) continue
      const stat = buildStatLine(valueRaw, percent || (hit.meta.unit === '%' ? '%' : ''), hit.canon, chunk.slice(0, 56))
      if (!stat) continue
      if (Math.abs(stat.value) > hit.meta.max * 1.85) continue
      stats.push(stat)
    }
  }

  return stats
}

/** Parse OCR block from one full riven card into structured stats + weapon guess. */
export function parseRivenOcr(ocrText: string, side: 'current' | 'reroll'): RivenRoll {
  const scrubbed = scrubOcr(ocrText)
  const stats = extractStatsFromBlob(scrubbed)
  const weapon = guessWeapon(scrubbed)
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
