/**
 * Build resources/riven-preferences.json from the Megrim/Valkyrial sheet CSV.
 * Uses Google Sheet rows 20+ and columns A–F (Name, 3 positive slots, Negatives, Notes).
 *
 * Source: https://docs.google.com/spreadsheets/d/1OQGKpWXeoPaN0Cy7mTvVZMRcwvZXgIC3EO1AIRAkwDg
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const csvPath = path.join(root, 'resources', 'riven-preferences-source.csv')
const outPath = path.join(root, 'resources', 'riven-preferences.json')

const ABBREV = {
  MS: 'multishot',
  DMG: 'damage',
  CC: 'critical chance',
  CD: 'critical damage',
  SC: 'status chance',
  SD: 'status duration',
  FR: 'fire rate',
  AS: 'fire rate', // attack speed → fire rate aliases in grader
  RNG: 'range',
  PT: 'punchthrough',
  RLS: 'reload',
  CCC: 'combo chance',
  IC: 'initial combo',
  EFF: 'heavy attack efficiency',
  FIN: 'finisher damage',
  SLIDE: 'slide critical chance',
  TOX: 'toxin damage',
  ELEC: 'electricity damage',
  IMP: 'impact damage',
  PUNC: 'puncture damage',
  SL: 'slash damage',
  MAG: 'magazine capacity',
  AMMO: 'ammo maximum',
  PFS: 'projectile speed',
  REC: 'recoil',
  Z: 'zoom',
  COLD: 'cold damage',
  HEAT: 'heat damage',
  DTG: 'damage to grineer',
  DTC: 'damage to corpus',
  DTI: 'damage to infested',
}

/** Simple CSV line split that respects quotes. */
function splitCsvLine(line) {
  const out = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQ = !inQ
      }
      continue
    }
    if (ch === ',' && !inQ) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

/**
 * Parse "CD > TOX" / "CC / TOX > FR / DMG" into ranked canon names.
 * Higher priority → lower rank number (0 = best).
 */
function parsePrefExpr(raw) {
  if (!raw || !String(raw).trim()) return []
  const tiers = String(raw)
    .split('>')
    .map((t) => t.trim())
    .filter(Boolean)
  const ranked = []
  tiers.forEach((tier, rank) => {
    const alts = tier.split('/').map((a) => a.trim()).filter(Boolean)
    for (const alt of alts) {
      const m = alt.match(/^([A-Za-z]+)(\*)?(?:\([^)]*\))?/)
      if (!m) continue
      const code = m[1].toUpperCase()
      if (code === 'ANY' || code === 'NONE') continue
      const canon = ABBREV[code]
      if (!canon) continue
      ranked.push({
        code,
        canon,
        rank,
        starred: Boolean(m[2]),
      })
    }
  })
  return ranked
}

function normalizeWeaponName(raw) {
  return String(raw || '')
    .replace(/^\[|\]$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function weaponKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

const text = fs.readFileSync(csvPath, 'utf8')
const lines = text.split(/\r?\n/)
// Sheet rows are 1-indexed; row 20 = lines[19]
const dataLines = lines.slice(19)

/** @type {Map<string, { name: string, profiles: any[] }>} */
const byWeapon = new Map()
let current = null

for (const line of dataLines) {
  if (!line || !line.trim()) continue
  const cols = splitCsvLine(line)
  const a = (cols[0] || '').trim()
  const b = (cols[1] || '').trim()
  const c = (cols[2] || '').trim()
  const d = (cols[3] || '').trim()
  const e = (cols[4] || '').trim()
  const f = (cols[5] || '').trim()

  // Skip totally empty preference rows
  if (!a && !b && !c && !d && !e) continue

  if (a) {
    const name = normalizeWeaponName(a)
    if (!name) continue
    const key = weaponKey(name)
    current = byWeapon.get(key)
    if (!current) {
      current = { name, key, profiles: [] }
      byWeapon.set(key, current)
    }
  }
  if (!current) continue
  if (!b && !c && !d && !e) continue

  const positives = [
    ...parsePrefExpr(b).map((p) => ({ ...p, slot: 1 })),
    ...parsePrefExpr(c).map((p) => ({ ...p, slot: 2 })),
    ...parsePrefExpr(d).map((p) => ({ ...p, slot: 3 })),
  ]
  const negatives = parsePrefExpr(e)
  if (!positives.length && !negatives.length) continue

  current.profiles.push({
    positives,
    negatives,
    notes: f || undefined,
  })
}

const weapons = [...byWeapon.values()].sort((a, b) => a.name.localeCompare(b.name))

const payload = {
  source:
    'https://docs.google.com/spreadsheets/d/1OQGKpWXeoPaN0Cy7mTvVZMRcwvZXgIC3EO1AIRAkwDg',
  credit: 'Megrim & Valkyrial (based on 44Bananas)',
  sheetRange: 'gid=0 rows 20+ columns A-F',
  generatedAt: new Date().toISOString(),
  weaponCount: weapons.length,
  weapons,
}

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8')
console.log(`Wrote ${weapons.length} weapons → ${path.relative(root, outPath)}`)
