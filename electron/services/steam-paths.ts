import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Steam AppID for Warframe. */
export const WARFRAME_STEAM_APP_ID = '230410'

function uniqueExisting(paths: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of paths) {
    if (!p || seen.has(p)) continue
    seen.add(p)
    try {
      if (fs.existsSync(p)) out.push(p)
    } catch {
      // ignore
    }
  }
  return out
}

/** Parse Steam libraryfolders.vdf for extra library roots. */
function pathsFromLibraryFoldersVdf(vdfPath: string): string[] {
  try {
    const text = fs.readFileSync(vdfPath, 'utf8')
    const found: string[] = []
    const re = /"path"\s+"([^"]+)"/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) {
      const raw = m[1].replace(/\\\\/g, '\\')
      found.push(raw)
    }
    return found
  } catch {
    return []
  }
}

/** Steam install roots (native + Flatpak). */
export function steamRoots(): string[] {
  if (process.platform !== 'linux') return []
  const home = os.homedir()
  const seeds = [
    path.join(home, '.steam', 'steam'),
    path.join(home, '.steam', 'root'),
    path.join(home, '.local', 'share', 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    path.join(home, '.var', 'app', 'com.valvesoftware.Steam', 'data', 'Steam'),
  ]

  const roots = new Set<string>()
  for (const seed of uniqueExisting(seeds)) {
    roots.add(seed)
    for (const vdf of [
      path.join(seed, 'steamapps', 'libraryfolders.vdf'),
      path.join(seed, 'config', 'libraryfolders.vdf'),
    ]) {
      for (const lib of pathsFromLibraryFoldersVdf(vdf)) {
        if (fs.existsSync(lib)) roots.add(lib)
      }
    }
  }
  return [...roots]
}

/** Proton wine prefix for Warframe, if installed via Steam. */
export function warframeProtonPrefix(): string | null {
  for (const root of steamRoots()) {
    const pfx = path.join(
      root,
      'steamapps',
      'compatdata',
      WARFRAME_STEAM_APP_ID,
      'pfx',
    )
    if (fs.existsSync(pfx)) return pfx
  }
  return null
}

/** Candidate EE.log paths inside Proton prefixes. */
export function warframeProtonEeLogCandidates(): string[] {
  const users = ['steamuser', os.userInfo().username, 'User']
  const out: string[] = []
  for (const root of steamRoots()) {
    const base = path.join(
      root,
      'steamapps',
      'compatdata',
      WARFRAME_STEAM_APP_ID,
      'pfx',
      'drive_c',
      'users',
    )
    for (const user of users) {
      out.push(path.join(base, user, 'AppData', 'Local', 'Warframe', 'EE.log'))
    }
    // Also scan users/* if present (custom Wine username)
    try {
      for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        out.push(
          path.join(base, entry.name, 'AppData', 'Local', 'Warframe', 'EE.log'),
        )
      }
    } catch {
      // ignore
    }
  }
  return [...new Set(out)]
}

/** Local AppData-style paths inside the Warframe Proton prefix. */
export function warframeProtonLocalAppData(): string | null {
  const pfx = warframeProtonPrefix()
  if (!pfx) return null
  const usersDir = path.join(pfx, 'drive_c', 'users')
  for (const user of ['steamuser', os.userInfo().username]) {
    const local = path.join(usersDir, user, 'AppData', 'Local')
    if (fs.existsSync(local)) return local
  }
  try {
    for (const entry of fs.readdirSync(usersDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'Public') continue
      const local = path.join(usersDir, entry.name, 'AppData', 'Local')
      if (fs.existsSync(local)) return local
    }
  } catch {
    // ignore
  }
  return null
}

export type WineLauncher = { command: string; args: string[]; label: string }

/**
 * Prefer Proton's wine from a Steam library so the helper shares Warframe's prefix.
 * Falls back to system wine64/wine.
 */
export function findWineLauncher(): WineLauncher | null {
  if (process.platform !== 'linux') return null

  for (const root of steamRoots()) {
    const common = path.join(root, 'steamapps', 'common')
    let dirs: string[] = []
    try {
      dirs = fs.readdirSync(common)
    } catch {
      continue
    }
    // Prefer Experimental / Hotfix / highest version-looking Proton
    const protons = dirs
      .filter((d) => /^Proton/i.test(d))
      .sort((a, b) => b.localeCompare(a, undefined, { sensitivity: 'base' }))
    for (const name of protons) {
      for (const rel of [
        ['files', 'bin', 'wine64'],
        ['files', 'bin', 'wine'],
        ['dist', 'bin', 'wine64'],
        ['dist', 'bin', 'wine'],
      ]) {
        const bin = path.join(common, name, ...rel)
        if (fs.existsSync(bin)) {
          return { command: bin, args: [], label: name }
        }
      }
    }
  }

  for (const cmd of ['wine64', 'wine']) {
    try {
      execFileSync('which', [cmd], { stdio: 'ignore' })
      return { command: cmd, args: [], label: cmd }
    } catch {
      // try next
    }
  }
  return null
}

export function isProtonPlayAvailable(): boolean {
  return process.platform === 'linux' && Boolean(warframeProtonPrefix())
}
