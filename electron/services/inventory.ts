import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'
import {
  InventoryCandidate,
  InventoryIndex,
  InventorySource,
  InventoryStatus,
  InventorySyncResult,
  MasteryEntry,
  MasteryIndex,
} from '../../shared/types'
import { loadSettings, updateSettings } from '../settings'
import {
  findWineLauncher,
  isProtonPlayAvailable,
  warframeProtonLocalAppData,
  warframeProtonPrefix,
} from './steam-paths'
import { isWarframeRunning as isWarframeProcessRunning, isWarframeGameRunningSync, invalidateWarframeProcessCache } from './warframe-process'
import { buildWineHelperEnv, scrubWineHelperOutput } from '../linux-child-env'
import { getRecipeByUnique } from './recipe-catalog'
import { findCatalogItemByName, findCatalogItemByUnique } from './item-catalog'
import { lookupWfinfoPlatinum } from './wfinfo-prices'

const HELPER_URL =
  'https://github.com/Sainan/warframe-api-helper/releases/download/1.1.2/warframe-api-helper.exe'

/** Same AES key/IV AlecaFrame / warframe-api-helper use for lastData.dat */
const ALECA_KEY = Buffer.from([76, 69, 79, 45, 65, 76, 69, 67, 9, 69, 79, 45, 65, 76, 69, 67])
const ALECA_IV = Buffer.from([49, 50, 70, 71, 66, 51, 54, 45, 76, 69, 51, 45, 113, 61, 57, 0])

const INVENTORY_ARRAY_KEYS = [
  'Suits',
  'Pistols',
  'LongGuns',
  'Melee',
  'SpaceSuits',
  'SpaceGuns',
  'SpaceMelee',
  'Sentinels',
  'SentinelWeapons',
  'KubrowPets',
  'Cats',
  'MoaPets',
  'Horses',
  'SpecialItems',
  'MiscItems',
  'Recipes',
  'Consumables',
  'FlavourItems',
  'ShipDecorations',
  'FusionTreasures',
  'Upgrades',
  'WeaponSkins',
  'OperatorAmps',
  'MechSuits',
  'Relics',
]

const GEAR_MASTERY_KEYS = new Set([
  'Suits',
  'Pistols',
  'LongGuns',
  'Melee',
  'SpaceSuits',
  'SpaceGuns',
  'SpaceMelee',
  'Sentinels',
  'SentinelWeapons',
  'KubrowPets',
  'Cats',
  'MoaPets',
  'Horses',
  'SpecialItems',
  'OperatorAmps',
  'MechSuits',
])

const MAX_RANK = 30

let cachedIndex: InventoryIndex = {}
let cachedMastery: MasteryIndex = {}
let cachedMeta = { path: '', itemCount: 0, uniqueCount: 0 }
/** Monotonic — Foundry / other UIs refresh when this changes. */
let inventoryRevision = 0
const listeners = new Set<(status: InventoryStatus) => void>()

function toolsDir() {
  return path.join(app.getPath('userData'), 'tools')
}

function inventoryWorkDir() {
  return path.join(app.getPath('userData'), 'inventory')
}

function helperExePath() {
  return path.join(toolsDir(), 'warframe-api-helper.exe')
}

function managedInventoryPath() {
  return path.join(inventoryWorkDir(), 'inventory.json')
}

export function isWarframeRunning(): boolean {
  return isWarframeGameRunningSync()
}

function fileMtimeIso(filePath: string): string {
  try {
    return fs.statSync(filePath).mtime.toISOString()
  } catch {
    return ''
  }
}

function pushCandidate(
  list: InventoryCandidate[],
  filePath: string,
  label: string,
  source: InventorySource,
) {
  if (!filePath || !fs.existsSync(filePath)) return
  if (list.some((c) => c.path.toLowerCase() === filePath.toLowerCase())) return
  list.push({
    path: filePath,
    label,
    source,
    mtime: fileMtimeIso(filePath),
  })
}

function walkForName(root: string, name: string, maxDepth = 3, out: string[] = [], depth = 0) {
  if (depth > maxDepth || out.length >= 8) return out
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) {
      out.push(full)
    } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
      walkForName(full, name, maxDepth, out, depth + 1)
    }
  }
  return out
}

export function detectInventoryCandidates(): InventoryCandidate[] {
  const home = os.homedir()
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
  const roaming = process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
  const downloads = path.join(home, 'Downloads')
  const desktop = path.join(home, 'Desktop')
  const list: InventoryCandidate[] = []

  pushCandidate(list, managedInventoryPath(), 'Everything Warframe synced inventory', 'helper')
  pushCandidate(list, path.join(inventoryWorkDir(), 'inventory.json'), 'Everything Warframe inventory folder', 'helper')
  pushCandidate(list, path.join(toolsDir(), 'inventory.json'), 'Helper tools folder', 'helper')
  pushCandidate(list, path.join(downloads, 'inventory.json'), 'Downloads/inventory.json', 'detected')
  pushCandidate(list, path.join(desktop, 'inventory.json'), 'Desktop/inventory.json', 'detected')
  pushCandidate(list, path.join(process.cwd(), 'inventory.json'), 'Current folder inventory.json', 'detected')

  const alecaPaths = [
    path.join(local, 'AlecaFrame', 'lastData.dat'),
    path.join(roaming, 'AlecaFrame', 'lastData.dat'),
    path.join(local, 'Overwolf', 'Extensions'),
  ]

  // Proton: look inside Warframe's Wine prefix for Windows-side exports
  const protonLocal = warframeProtonLocalAppData()
  if (protonLocal) {
    alecaPaths.push(path.join(protonLocal, 'AlecaFrame', 'lastData.dat'))
    pushCandidate(
      list,
      path.join(protonLocal, 'inventory.json'),
      'Proton prefix inventory.json',
      'detected',
    )
  }

  for (const p of alecaPaths) {
    if (p.endsWith('lastData.dat')) {
      pushCandidate(list, p, 'AlecaFrame lastData.dat', 'alecaframe')
    } else if (fs.existsSync(p)) {
      for (const found of walkForName(p, 'lastData.dat', 4)) {
        pushCandidate(list, found, 'AlecaFrame / Overwolf lastData.dat', 'alecaframe')
      }
    }
  }

  for (const found of walkForName(downloads, 'inventory.json', 2)) {
    pushCandidate(list, found, 'Downloads inventory.json', 'detected')
  }

  list.sort((a, b) => (b.mtime || '').localeCompare(a.mtime || ''))
  return list
}

function addCount(index: InventoryIndex, key: string, count: number) {
  if (!key || count <= 0) return
  index[key] = (index[key] || 0) + count
  // Also index basename for fuzzy matching later
  const base = key.split('/').pop()
  if (base && base !== key) index[base] = (index[base] || 0) + count

  // Catalogs (warframestat / foundry) often use *Component or omit Blueprint,
  // while the live inventory API stores those stacks as *Blueprint.
  for (const alias of inventoryKeyAliases(key)) {
    index[alias] = (index[alias] || 0) + count
    const aliasBase = alias.split('/').pop()
    if (aliasBase && aliasBase !== alias) {
      index[aliasBase] = (index[aliasBase] || 0) + count
    }
  }
}

/**
 * Map inventory ItemType paths onto the names foundry/relic catalogs query.
 * Inventory:  .../EmberPrimeChassisBlueprint (ItemCount 40)
 * Catalog:    .../EmberPrimeChassisComponent
 * Inventory:  .../BratonPrimeBarrelBlueprint
 * Catalog:    .../BratonPrimeBarrel
 *
 * Note: we intentionally do NOT index warframe *Blueprint → *Component here.
 * Uncrafted part BPs must not satisfy Foundry “built component” checks; that
 * bridge lives in ownedCountFor (non-strict) for relic/set ownership only.
 */
export function inventoryKeyAliases(key: string): string[] {
  if (!key || !/Blueprint$/i.test(key)) return []
  const withoutBp = key.replace(/Blueprint$/i, '')
  const leaf = withoutBp.split('/').pop() || ''
  const aliases: string[] = []

  // Weapon / pet / archwing parts: catalog uniqueName usually has no Blueprint suffix
  if (
    /(Barrel|Receiver|Stock|Blade|Handle|Hilt|Link|Head|Grip|String|Boot|Gauntlet|Cerebrum|Carapace|Harness|Wings|Pouch|Stars|Ornament|Limb)$/i.test(
      leaf,
    )
  ) {
    aliases.push(withoutBp)
  }

  return [...new Set(aliases)]
}

function readStackCount(row: Record<string, unknown>): number {
  const raw =
    row.ItemCount ?? row.Count ?? row.Quantity ?? row.quantity ?? row.itemCount ?? row.count
  if (raw == null || raw === '') return 1
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.floor(n)
}

function setMastery(
  mastery: MasteryIndex,
  key: string,
  ownedDelta: number,
  xpLevel: number | null,
  hasXpSignal: boolean,
) {
  if (!key) return
  const apply = (k: string) => {
    const prev = mastery[k] || { owned: 0, xpLevel: null, mastered: null }
    const nextOwned = prev.owned + ownedDelta
    let nextLevel = prev.xpLevel
    if (xpLevel != null) {
      nextLevel = prev.xpLevel == null ? xpLevel : Math.max(prev.xpLevel, xpLevel)
    }
    let mastered: boolean | null = prev.mastered
    if (hasXpSignal && nextLevel != null) {
      mastered = nextLevel >= MAX_RANK
    } else if (hasXpSignal && mastered == null) {
      mastered = false
    }
    mastery[k] = { owned: nextOwned, xpLevel: nextLevel, mastered }
  }
  apply(key)
  const base = key.split('/').pop()
  if (base && base !== key) apply(base)
}

function readXpLevel(row: Record<string, unknown>): { level: number | null; hasSignal: boolean } {
  if (typeof row.XPLevel === 'number' && Number.isFinite(row.XPLevel)) {
    return { level: row.XPLevel, hasSignal: true }
  }
  if (typeof row.Level === 'number' && Number.isFinite(row.Level)) {
    return { level: row.Level, hasSignal: true }
  }
  if (typeof row.Rank === 'number' && Number.isFinite(row.Rank)) {
    return { level: row.Rank, hasSignal: true }
  }
  // Affinity-only rows: treat as owned with unknown mastery unless clearly maxed via huge XP
  if (typeof row.XP === 'number' && Number.isFinite(row.XP)) {
    // Rank 30 affinity thresholds vary; ~1.6M+ is a common warframe max ballpark
    if (row.XP >= 1_600_000) return { level: MAX_RANK, hasSignal: true }
    return { level: null, hasSignal: true }
  }
  return { level: null, hasSignal: false }
}

export function parseInventoryJson(raw: unknown): {
  index: InventoryIndex
  mastery: MasteryIndex
  itemCount: number
} {
  const index: InventoryIndex = {}
  const mastery: MasteryIndex = {}
  let itemCount = 0
  if (!raw || typeof raw !== 'object') return { index, mastery, itemCount }

  const root = raw as Record<string, unknown>

  for (const key of INVENTORY_ARRAY_KEYS) {
    const arr = root[key]
    if (!Array.isArray(arr)) continue
    for (const entry of arr) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      const type = String(row.ItemType || row.uniqueName || row.ItemName || '')
      const count = readStackCount(row)
      if (!type) continue
      addCount(index, type, count)
      itemCount += count
      if (GEAR_MASTERY_KEYS.has(key)) {
        const { level, hasSignal } = readXpLevel(row)
        setMastery(mastery, type, count, level, hasSignal)
      }
    }
  }

  // XPInfo often lists mastered / leveled gear even if not currently owned
  const xpInfo = root.XPInfo
  if (Array.isArray(xpInfo)) {
    for (const entry of xpInfo) {
      if (!entry || typeof entry !== 'object') continue
      const row = entry as Record<string, unknown>
      const type = String(row.ItemType || row.uniqueName || '')
      if (!type) continue
      const { level, hasSignal } = readXpLevel(row)
      const prev = mastery[type]
      if (!prev) {
        setMastery(mastery, type, 0, level, hasSignal || level != null)
      } else if (hasSignal || level != null) {
        setMastery(mastery, type, 0, level, true)
      }
    }
  }

  // Player currencies (Baro affordability)
  if (typeof root.RegularCredits === 'number' && Number.isFinite(root.RegularCredits)) {
    index.RegularCredits = Math.max(0, Math.floor(root.RegularCredits))
  }
  if (typeof root.PremiumCredits === 'number' && Number.isFinite(root.PremiumCredits)) {
    index.PremiumCredits = Math.max(0, Math.floor(root.PremiumCredits))
  }
  // Ducats often live in MiscItems as *DucatCurrency*
  for (const key of Object.keys(index)) {
    if (/ducatcurrency/i.test(key) || /\/ducats?$/i.test(key)) {
      index.Ducats = (index.Ducats || 0) + index[key]
    }
  }
  if (typeof root.TradeScore === 'number' && Number.isFinite(root.TradeScore) && !index.Ducats) {
    index.Ducats = Math.max(0, Math.floor(root.TradeScore))
  }

  // Some exports nest under Inventory
  if (itemCount === 0 && root.Inventory && typeof root.Inventory === 'object') {
    return parseInventoryJson(root.Inventory)
  }

  return { index, mastery, itemCount }
}

export function decryptAlecaFrameDat(filePath: string): unknown {
  const encrypted = fs.readFileSync(filePath)
  const decipher = crypto.createDecipheriv('aes-128-cbc', ALECA_KEY, ALECA_IV)
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  // strip PKCS7 padding leftovers if JSON has trailing junk
  const text = decrypted.toString('utf8').replace(/\0+$/g, '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('Decrypted AlecaFrame data is not JSON')
  return JSON.parse(text.slice(start, end + 1))
}

function loadJsonFile(filePath: string): unknown {
  if (filePath.toLowerCase().endsWith('.dat')) {
    return decryptAlecaFrameDat(filePath)
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function loadInventoryFromPath(filePath: string): {
  index: InventoryIndex
  mastery: MasteryIndex
  itemCount: number
  uniqueCount: number
} {
  const raw = loadJsonFile(filePath)
  const { index, mastery, itemCount } = parseInventoryJson(raw)
  return { index, mastery, itemCount, uniqueCount: Object.keys(index).length }
}

export function getInventoryIndex(): InventoryIndex {
  return { ...cachedIndex }
}

export function getMasteryIndex(): MasteryIndex {
  return { ...cachedMastery }
}

/** Live refs for main-process services — do not mutate. */
export function peekInventoryIndex(): InventoryIndex {
  return cachedIndex
}

export function peekMasteryIndex(): MasteryIndex {
  return cachedMastery
}

/** WFCD sometimes appends revision suffixes (BlueprintV2). */
function stripRevisionSuffix(uniqueName: string): string | null {
  const stripped = uniqueName.replace(/V\d+$/i, '')
  return stripped !== uniqueName ? stripped : null
}

/** Compact token for ownership compares (Neuroptics ≡ Helmet; ignore Blueprint/Component). */
function compactOwnedToken(name: string): string {
  return name
    .toUpperCase()
    .replace(/['’]/g, '')
    .replace(/NEUROPTICS/g, 'HELMET')
    .replace(/[^A-Z0-9]+/g, '')
    .replace(/(BLUEPRINT|COMPONENT)$/g, '')
}

const PART_OR_BLUEPRINT_RE =
  /\b(blueprint|neuroptics|chassis|systems|barrel|receiver|stock|blade|handle|hilt|link|head|grip|string|boot|gauntlet|cerebrum|carapace|harness|wings|pouch|stars|ornament|limb|band|buckle|chain)\b/i

/** Finished warframe/weapon paths — not recipe stacks from relic rewards. */
function isFinishedGearUniqueName(uniqueName: string): boolean {
  if (/\/(Recipes|WeaponParts)\//i.test(uniqueName)) return false
  return /\/Lotus\/(Powersuits|Weapons)\//i.test(uniqueName)
}

export function ownedCountFor(
  uniqueName: string,
  index: InventoryIndex = cachedIndex,
  opts?: { strict?: boolean },
): number {
  if (!uniqueName) return 0
  // Relic reward rows in WFCD Relics.json currently misuse Projection IDs as item
  // uniqueNames — never treat those as owned part stacks.
  if (/\/Projections\//i.test(uniqueName) || /VoidProjection/i.test(uniqueName)) return 0

  const strict = opts?.strict === true
  const candidates = [uniqueName]
  const noRev = stripRevisionSuffix(uniqueName)
  if (noRev) candidates.push(noRev)

  for (const cand of candidates) {
    const direct = lookupCount(cand, index)
    if (direct > 0) return direct

    if (strict) continue

    // Catalog *Component → inventory *Blueprint (parts / Foundry materials / relic ownership).
    if (/Component$/i.test(cand)) {
      const asBp = cand.replace(/Component$/i, 'Blueprint')
      const n = lookupCount(asBp, index)
      if (n > 0) return n
    }

    // Catalog path without Blueprint → inventory *Blueprint
    if (!/Blueprint$/i.test(cand) && /\/(Recipes|WeaponParts)\//i.test(cand)) {
      const n = lookupCount(`${cand}Blueprint`, index)
      if (n > 0) return n
    }
  }

  return 0
}

/** Strict lookup: exact path / basename only (no Blueprint↔Component bridging). */
export function ownedCountForCraft(
  uniqueName: string,
  index: InventoryIndex = cachedIndex,
): number {
  return ownedCountFor(uniqueName, index, { strict: true })
}

/**
 * Ownership by display name when uniqueName is missing or unreliable.
 * Exact token match only — never treat "Trinity Prime" as owning
 * "Trinity Prime Systems Blueprint".
 */
export function ownedCountByDisplayName(
  displayName: string,
  index: InventoryIndex = cachedIndex,
): number {
  const needle = compactOwnedToken(displayName)
  if (!needle || needle.length < 4) return 0
  const wantsBlueprint = /\bBLUEPRINT\b/i.test(displayName)
  const hasPartWord = PART_OR_BLUEPRINT_RE.test(displayName)

  let best = 0
  let bestKeyLen = 0
  for (const [key, count] of Object.entries(index)) {
    if (!count) continue
    // Basename keys only (full paths are duplicated via addCount and skew "longest wins")
    if (key.includes('/')) continue
    if (key === 'RegularCredits' || key === 'Ducats' || key === 'PremiumCredits') continue
    if (/VoidProjection/i.test(key) || /^T[1-4]VoidProjection/i.test(key)) continue

    const token = compactOwnedToken(key)
    if (!token || token !== needle) continue

    const keyIsRecipe = /Blueprint$/i.test(key) || /Component$/i.test(key)
    // "X Prime Blueprint" must not match the crafted "XPrime" suit/weapon row.
    if (wantsBlueprint && !keyIsRecipe) continue
    // Bare set name ("Banshee Prime") should not consume recipe blueprint stacks.
    if (!hasPartWord && keyIsRecipe) continue

    if (key.length >= bestKeyLen) {
      bestKeyLen = key.length
      best = count
    }
  }
  return best
}

export function ownedCountForReward(
  uniqueName: string | null | undefined,
  displayName: string,
  index: InventoryIndex = cachedIndex,
): number {
  if (uniqueName) {
    const skipFinished =
      Boolean(displayName) &&
      PART_OR_BLUEPRINT_RE.test(displayName) &&
      isFinishedGearUniqueName(uniqueName)
    if (!skipFinished) {
      const byUnique = ownedCountFor(uniqueName, index)
      if (byUnique > 0) return byUnique
    }
  }
  if (displayName) return ownedCountByDisplayName(displayName, index)
  return 0
}

function lookupCount(uniqueName: string, index: InventoryIndex): number {
  if (index[uniqueName] != null) return index[uniqueName]
  const base = uniqueName.split('/').pop()
  if (base && index[base] != null) return index[base]
  return 0
}

export function masteryFor(uniqueName: string): MasteryEntry | null {
  if (!uniqueName) return null
  return (
    cachedMastery[uniqueName] ||
    cachedMastery[uniqueName.split('/').pop() || ''] ||
    null
  )
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const file = fs.createWriteStream(dest)
    const get = (target: string, redirects = 0) => {
      https
        .get(target, { headers: { 'User-Agent': 'EverythingWarframe' } }, (res) => {
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location &&
            redirects < 5
          ) {
            res.resume()
            get(res.headers.location, redirects + 1)
            return
          }
          if (res.statusCode !== 200) {
            file.close()
            fs.unlink(dest, () => {})
            reject(new Error(`Download failed (${res.statusCode})`))
            return
          }
          res.pipe(file)
          file.on('finish', () => file.close(() => resolve()))
        })
        .on('error', (err) => {
          file.close()
          fs.unlink(dest, () => {})
          reject(err)
        })
    }
    get(url)
  })
}

export async function ensureHelperDownloaded(): Promise<string> {
  const exe = helperExePath()
  if (fs.existsSync(exe) && fs.statSync(exe).size > 100_000) return exe
  await downloadFile(HELPER_URL, exe)
  return exe
}

export function helperIsReady(): boolean {
  try {
    return fs.existsSync(helperExePath()) && fs.statSync(helperExePath()).size > 100_000
  } catch {
    return false
  }
}

export function inferInventorySource(filePath: string): InventorySource {
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.dat')) return 'alecaframe'
  const managed = managedInventoryPath().toLowerCase()
  if (lower === managed || lower.startsWith(inventoryWorkDir().toLowerCase())) return 'helper'
  return 'detected'
}

async function waitForNewFile(
  filePath: string,
  notBeforeMs: number,
  timeoutMs: number,
): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) {
      try {
        const st = fs.statSync(filePath)
        // Ignore a leftover file from a previous sync (common under Wine/Proton).
        if (st.size > 100 && st.mtimeMs >= notBeforeMs - 500) {
          await new Promise((r) => setTimeout(r, 400))
          return true
        }
      } catch {
        // retry
      }
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

export async function syncInventoryFromGame(): Promise<InventorySyncResult> {
  const settings = loadSettings()
  if (!settings.inventoryConsent) {
    return {
      ok: false,
      error: 'Permission required. Accept the inventory sync risk acknowledgment first.',
    }
  }
  invalidateWarframeProcessCache()
  const running = isWarframeGameRunningSync() || (await isWarframeProcessRunning())
  if (!running) {
    return {
      ok: false,
      error:
        process.platform === 'linux'
          ? 'Warframe is not running under Steam/Proton. Launch the game, then try again.'
          : 'Warframe.x64.exe is not running. Log into Warframe, then try again.',
    }
  }

  try {
    const exe = await ensureHelperDownloaded()
    const work = inventoryWorkDir()
    fs.mkdirSync(work, { recursive: true })
    // Helper always writes ./inventory.json in cwd. Delete any leftover so we
    // don't treat a Wine-locked stale file as a successful new sync.
    const legacyOut = path.join(work, 'inventory.json')
    try {
      if (fs.existsSync(legacyOut)) fs.unlinkSync(legacyOut)
    } catch {
      // ignore locked files — waitForNewFile still checks mtime
    }

    const startedAt = Date.now()
    let child
    if (process.platform === 'linux') {
      const wine = findWineLauncher()
      const pfx = warframeProtonPrefix()
      if (!wine) {
        return {
          ok: false,
          error:
            'Linux inventory sync needs Proton’s wine or system wine. Install Steam Proton, or import inventory.json / lastData.dat manually.',
        }
      }
      if (!pfx) {
        return {
          ok: false,
          error:
            'Warframe Proton prefix not found (Steam AppID 230410). Launch Warframe once via Steam, or import an inventory file manually.',
        }
      }
      console.info(
        `[Everything Warframe] Inventory sync via ${wine.label} (WINEPREFIX=${pfx})`,
      )
      // Never inherit Electron/AppImage LD_LIBRARY_PATH / FONTCONFIG_* — that loads
      // the AppImage's older fontconfig into Wine and breaks HTTPS after auth.
      child = spawn(wine.command, [...wine.args, exe], {
        cwd: work,
        env: buildWineHelperEnv(wine, pfx),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } else {
      child = spawn(exe, [], {
        cwd: work,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    }

    let stderr = ''
    child.stderr?.on('data', (d) => {
      stderr += String(d)
    })
    child.stdout?.on('data', (d) => {
      stderr += String(d)
    })

    const appeared = await waitForNewFile(legacyOut, startedAt, 90_000)
    try {
      child.stdin?.write('\r\n')
      child.stdin?.end()
    } catch {
      // ignore
    }
    try {
      child.kill()
    } catch {
      // ignore
    }

    if (!appeared) {
      const cleaned = scrubWineHelperOutput(stderr)
      let error =
        cleaned.slice(0, 400) ||
        (process.platform === 'linux'
          ? 'Timed out waiting for inventory.json under Proton. Stay logged in, or import a file manually.'
          : 'Timed out waiting for inventory.json. Stay logged into Warframe and try again.')
      if (/Request failed/i.test(cleaned)) {
        error =
          'Inventory download failed after reading account credentials (HTTPS under Wine). Stay logged into Warframe, check network access to mobile.warframe.com, then try again.'
      }
      return { ok: false, error }
    }

    return useInventoryFile(legacyOut, 'helper')
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Inventory sync failed',
    }
  }
}

export function useInventoryFile(
  filePath: string,
  source: InventorySource,
): InventorySyncResult {
  try {
    // If AlecaFrame .dat, decrypt into managed inventory.json for stable path
    let finalPath = filePath
    let finalSource = source
    if (filePath.toLowerCase().endsWith('.dat')) {
      const json = decryptAlecaFrameDat(filePath)
      fs.mkdirSync(inventoryWorkDir(), { recursive: true })
      finalPath = managedInventoryPath()
      fs.writeFileSync(finalPath, JSON.stringify(json, null, 2), 'utf8')
      finalSource = 'alecaframe'
    }

    const loaded = loadInventoryFromPath(finalPath)
    cachedIndex = loaded.index
    cachedMastery = loaded.mastery
    cachedMeta = {
      path: finalPath,
      itemCount: loaded.itemCount,
      uniqueCount: loaded.uniqueCount,
    }
    inventoryRevision += 1

    updateSettings({
      inventoryPath: finalPath,
      inventorySource: finalSource,
      inventoryLastSynced: new Date().toISOString(),
    })

    const status = getInventoryStatus()
    for (const cb of listeners) cb(status)

    return {
      ok: true,
      path: finalPath,
      source: finalSource,
      itemCount: loaded.itemCount,
      uniqueCount: loaded.uniqueCount,
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to load inventory file',
    }
  }
}

export function reloadConfiguredInventory(): void {
  const settings = loadSettings()
  if (!settings.inventoryPath || !fs.existsSync(settings.inventoryPath)) {
    cachedIndex = {}
    cachedMastery = {}
    cachedMeta = { path: '', itemCount: 0, uniqueCount: 0 }
    return
  }
  try {
    const loaded = loadInventoryFromPath(settings.inventoryPath)
    cachedIndex = loaded.index
    cachedMastery = loaded.mastery
    cachedMeta = {
      path: settings.inventoryPath,
      itemCount: loaded.itemCount,
      uniqueCount: loaded.uniqueCount,
    }
    inventoryRevision += 1
  } catch (err) {
    console.error('[Everything Warframe] Failed to reload inventory', err)
  }
}

export function clearInventoryData(): InventoryStatus {
  cachedIndex = {}
  cachedMastery = {}
  cachedMeta = { path: '', itemCount: 0, uniqueCount: 0 }
  inventoryRevision += 1
  updateSettings({
    inventoryPath: '',
    inventorySource: 'none',
    inventoryLastSynced: '',
  })
  const managed = managedInventoryPath()
  try {
    if (fs.existsSync(managed)) fs.unlinkSync(managed)
  } catch {
    // ignore
  }
  const status = getInventoryStatus()
  for (const cb of listeners) cb(status)
  return status
}

export function setInventoryConsent(consent: boolean): InventoryStatus {
  updateSettings({ inventoryConsent: consent })
  const status = getInventoryStatus()
  for (const cb of listeners) cb(status)
  return status
}

export function getInventoryStatus(): InventoryStatus {
  const settings = loadSettings()
  if (
    settings.inventoryPath &&
    settings.inventoryPath !== cachedMeta.path &&
    fs.existsSync(settings.inventoryPath)
  ) {
    reloadConfiguredInventory()
  }

  const lastSynced = settings.inventoryLastSynced
  const syncedAt = lastSynced ? Date.parse(lastSynced) : NaN
  const staleAgeMs = Number.isFinite(syncedAt) ? Math.max(0, Date.now() - syncedAt) : null
  const STALE_AFTER_MS = 6 * 60 * 60 * 1000
  const stale = staleAgeMs == null || staleAgeMs >= STALE_AFTER_MS

  return {
    path: settings.inventoryPath,
    source: settings.inventorySource,
    consent: settings.inventoryConsent,
    lastSynced,
    itemCount: cachedMeta.itemCount,
    uniqueCount: cachedMeta.uniqueCount,
    revision: inventoryRevision,
    loaded: cachedMeta.uniqueCount > 0,
    helperReady: helperIsReady(),
    warframeRunning: isWarframeRunning(),
    stale,
    staleAgeMs,
    platform: process.platform,
    protonPlay: isProtonPlayAvailable(),
    error: null,
    candidates: detectInventoryCandidates(),
  }
}

function leafDisplayName(uniqueName: string): string {
  const leaf = uniqueName.split('/').pop() || uniqueName
  return leaf
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const CURRENCY_NAMES: Record<string, string> = {
  RegularCredits: 'Credits',
  PremiumCredits: 'Platinum',
  Ducats: 'Ducats',
}

function resolveBrowseDisplayName(uniqueName: string): string {
  if (CURRENCY_NAMES[uniqueName]) return CURRENCY_NAMES[uniqueName]

  const recipe = getRecipeByUnique(uniqueName)
  if (recipe?.name) return recipe.name
  if (/Blueprint$/i.test(uniqueName)) {
    const asComp = getRecipeByUnique(uniqueName.replace(/Blueprint$/i, 'Component'))
    if (asComp?.name) {
      return /blueprint/i.test(asComp.name) ? asComp.name : `${asComp.name} Blueprint`
    }
  }
  if (/Component$/i.test(uniqueName)) {
    const asBp = getRecipeByUnique(uniqueName.replace(/Component$/i, 'Blueprint'))
    if (asBp?.name) return asBp.name.replace(/\s+Blueprint$/i, '')
  }

  const item = findCatalogItemByUnique(uniqueName)
  if (item?.name) return item.name

  return leafDisplayName(uniqueName)
}

function classifyInventoryKey(uniqueName: string): {
  kind: import('../../shared/types').InventoryBrowseKind
  isBlueprint: boolean
  isComponent: boolean
} {
  const isBlueprint = /Blueprint$/i.test(uniqueName)
  const isComponent = /Component$/i.test(uniqueName)
  if (uniqueName === 'RegularCredits' || uniqueName === 'Ducats' || uniqueName === 'PremiumCredits') {
    return { kind: 'currency', isBlueprint, isComponent }
  }
  if (/\/Projections\//i.test(uniqueName) || /VoidProjection/i.test(uniqueName)) {
    return { kind: 'relic', isBlueprint, isComponent }
  }
  if (
    isBlueprint ||
    isComponent ||
    /\/(Recipes|WeaponParts)\//i.test(uniqueName)
  ) {
    return { kind: 'part', isBlueprint, isComponent }
  }
  if (
    /\/(Powersuits|Weapons|Melee|LongGuns|Pistols|Sentinels|KubrowPet|Cat|Moa|Hoverboard|Mechs|OperatorAmps)\//i.test(
      uniqueName,
    )
  ) {
    return { kind: 'gear', isBlueprint, isComponent }
  }
  if (/\/(Types\/Items|Resources|Fish|Plants|MiscItems)\//i.test(uniqueName) || /Resource/i.test(uniqueName)) {
    return { kind: 'resource', isBlueprint, isComponent }
  }
  return { kind: 'other', isBlueprint, isComponent }
}

/** Browseable inventory rows (full paths only — skips basename alias duplicates). */
export function browseInventory(
  query?: import('../../shared/types').InventoryBrowseQuery,
): import('../../shared/types').InventoryBrowseItem[] {
  const search = String(query?.search || '')
    .trim()
    .toLowerCase()
  const kindFilter = query?.kind || 'all'
  const sellableOnly = Boolean(query?.sellableOnly)
  const limit = Math.min(Math.max(Number(query?.limit) || 500, 1), 5000)
  const rows: import('../../shared/types').InventoryBrowseItem[] = []

  for (const [uniqueName, count] of Object.entries(cachedIndex)) {
    if (!count || count <= 0) continue
    // Skip basename / alias shortcuts — keep canonical paths (+ currencies)
    if (!uniqueName.includes('/') && !['RegularCredits', 'Ducats', 'PremiumCredits'].includes(uniqueName)) {
      continue
    }
    const { kind, isBlueprint, isComponent } = classifyInventoryKey(uniqueName)
    if (kindFilter !== 'all' && kind !== kindFilter) continue
    const displayName = resolveBrowseDisplayName(uniqueName)
    if (search) {
      const hay = `${displayName} ${uniqueName} ${leafDisplayName(uniqueName)}`.toLowerCase()
      if (!hay.includes(search)) continue
    }

    const catalog =
      findCatalogItemByUnique(uniqueName) || findCatalogItemByName(displayName)
    const platDirect = lookupWfinfoPlatinum(displayName)
    const platAlt =
      catalog?.name && catalog.name !== displayName
        ? lookupWfinfoPlatinum(catalog.name)
        : null
    const platinum = platDirect ?? platAlt
    const ducats = catalog?.ducats ?? null
    // Keep one of each prime part/BP; extras are sell/ducat candidates.
    const keepOne = kind === 'part' || isBlueprint || isComponent
    const excess = keepOne ? Math.max(0, count - 1) : 0

    if (sellableOnly) {
      if (kind === 'relic' || kind === 'currency' || kind === 'resource' || kind === 'gear') {
        continue
      }
      if (excess <= 0) continue
      // WFM listing needs plat; ducat-only extras still useful for Baro dump sorting.
      if (platinum == null && ducats == null) continue
    }

    rows.push({
      uniqueName,
      displayName,
      count,
      kind,
      isBlueprint,
      isComponent,
      platinum,
      ducats,
      excess,
    })
  }

  rows.sort((a, b) => {
    if (sellableOnly) {
      const ap = a.platinum ?? -1
      const bp = b.platinum ?? -1
      if (bp !== ap) return bp - ap
      if (b.excess !== a.excess) return b.excess - a.excess
    } else if (b.count !== a.count) {
      return b.count - a.count
    }
    return a.displayName.localeCompare(b.displayName)
  })
  return rows.slice(0, limit)
}

export function onInventoryUpdated(cb: (status: InventoryStatus) => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
