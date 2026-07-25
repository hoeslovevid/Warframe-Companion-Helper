import crypto from 'node:crypto'
import fs from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { spawn, execSync } from 'node:child_process'
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
import { isWarframeRunning as isWarframeProcessRunning } from './warframe-process'

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
  if (process.platform === 'linux') {
    try {
      const out = execSync('pgrep -if "warframe(\\.x64)?(\\.exe)?"', {
        encoding: 'utf8',
        timeout: 5000,
      })
      return out.trim().length > 0
    } catch {
      return false
    }
  }
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq Warframe.x64.exe" /NH', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 5000,
    })
    return out.toLowerCase().includes('warframe.x64.exe')
  } catch {
    return false
  }
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
      const count = Number(row.ItemCount ?? row.Count ?? 1) || 1
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

export function ownedCountFor(uniqueName: string, index: InventoryIndex = cachedIndex): number {
  if (!uniqueName) return 0
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

async function waitForFile(filePath: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(filePath)) {
      try {
        const st = fs.statSync(filePath)
        if (st.size > 100) {
          // small settle delay for write flush
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
  const running = isWarframeRunning() || (await isWarframeProcessRunning())
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
    const outJson = path.join(work, 'inventory.json')
    if (fs.existsSync(outJson)) fs.unlinkSync(outJson)

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
      child = spawn(wine.command, [...wine.args, exe], {
        cwd: work,
        env: {
          ...process.env,
          WINEPREFIX: pfx,
          // Avoid wine GUI noise / crash dialogs in headless-ish contexts
          WINEDEBUG: '-all',
        },
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

    const appeared = await waitForFile(outJson, 90_000)
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
      return {
        ok: false,
        error:
          stderr.trim().slice(0, 400) ||
          (process.platform === 'linux'
            ? 'Timed out waiting for inventory.json under Proton. Stay logged in, or import a file manually.'
            : 'Timed out waiting for inventory.json. Stay logged into Warframe and try again.'),
      }
    }

    return useInventoryFile(outJson, 'helper')
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
  } catch (err) {
    console.error('[Everything Warframe] Failed to reload inventory', err)
  }
}

export function clearInventoryData(): InventoryStatus {
  cachedIndex = {}
  cachedMastery = {}
  cachedMeta = { path: '', itemCount: 0, uniqueCount: 0 }
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

  return {
    path: settings.inventoryPath,
    source: settings.inventorySource,
    consent: settings.inventoryConsent,
    lastSynced: settings.inventoryLastSynced,
    itemCount: cachedMeta.itemCount,
    uniqueCount: cachedMeta.uniqueCount,
    loaded: cachedMeta.uniqueCount > 0,
    helperReady: helperIsReady(),
    warframeRunning: isWarframeRunning(),
    platform: process.platform,
    protonPlay: isProtonPlayAvailable(),
    error: null,
    candidates: detectInventoryCandidates(),
  }
}

export function onInventoryUpdated(cb: (status: InventoryStatus) => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
