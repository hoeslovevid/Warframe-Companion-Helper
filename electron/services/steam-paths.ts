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

/** Parent of pfx: …/compatdata/230410 */
export function warframeCompatDataDir(): string | null {
  const pfx = warframeProtonPrefix()
  return pfx ? path.dirname(pfx) : null
}

function wineBinsUnderProtonRoot(protonRoot: string): string[] {
  const out: string[] = []
  for (const rel of [
    ['files', 'bin', 'wine64'],
    ['files', 'bin', 'wine'],
    ['dist', 'bin', 'wine64'],
    ['dist', 'bin', 'wine'],
  ]) {
    const bin = path.join(protonRoot, ...rel)
    if (fs.existsSync(bin)) out.push(bin)
  }
  return out
}

function protonRootFromWineBin(wineBin: string): string | null {
  // …/Proton X/files/bin/wine64 → …/Proton X
  const binDir = path.dirname(wineBin)
  if (path.basename(binDir) !== 'bin') return null
  const filesOrDist = path.dirname(binDir)
  const leaf = path.basename(filesOrDist)
  if (leaf === 'files' || leaf === 'dist') return path.dirname(filesOrDist)
  return null
}

function protonScriptForRoot(protonRoot: string): string | null {
  const script = path.join(protonRoot, 'proton')
  return fs.existsSync(script) ? script : null
}

/** Pull absolute Proton install paths out of compatdata/config_info. */
function protonRootsFromConfigInfo(compatDir: string): string[] {
  const configInfo = path.join(compatDir, 'config_info')
  try {
    const buf = fs.readFileSync(configInfo)
    const text = buf.toString('utf8')
    const found: string[] = []
    // Paths may be newline- or NUL-separated.
    for (const chunk of text.split(/[\0\r\n]+/)) {
      const line = chunk.trim()
      if (!line.startsWith('/')) continue
      if (!/Proton/i.test(line) && !/compatibilitytools\.d/i.test(line)) continue
      // Often ends with /files/share/fonts or /dist/share/fonts — climb to Proton root.
      let cur = line.replace(/[/\\]+$/, '')
      for (let i = 0; i < 6; i++) {
        const base = path.basename(cur)
        if (/^Proton/i.test(base) || fs.existsSync(path.join(cur, 'proton'))) {
          found.push(cur)
          break
        }
        if (base === 'files' || base === 'dist') {
          found.push(path.dirname(cur))
          break
        }
        const parent = path.dirname(cur)
        if (parent === cur) break
        cur = parent
      }
    }
    return [...new Set(found)].filter((p) => fs.existsSync(p))
  } catch {
    return []
  }
}

function protonRootsMatchingVersionFile(compatDir: string): string[] {
  try {
    const raw = fs.readFileSync(path.join(compatDir, 'version'), 'utf8').trim()
    if (!raw) return []
    // e.g. "1726604483 proton-9.0-3c" or "proton-experimental-…"
    const ver = raw.replace(/^\d+\s+/, '').trim()
    const experimental = /experimental/i.test(ver)
    // Prefer a version number like 9.0 / 10.0 over the leading "proton" token.
    const versionNum = ver.match(/(\d+\.\d+)/)?.[1] ?? ''
    const out: string[] = []
    for (const root of steamRoots()) {
      const searchRoots = [
        path.join(root, 'steamapps', 'common'),
        path.join(root, 'compatibilitytools.d'),
      ]
      for (const common of searchRoots) {
        let dirs: string[] = []
        try {
          dirs = fs.readdirSync(common)
        } catch {
          continue
        }
        for (const name of dirs) {
          const protonRoot = path.join(common, name)
          if (!fs.existsSync(path.join(protonRoot, 'proton')) && !/^Proton/i.test(name)) {
            continue
          }
          if (experimental) {
            if (!/experimental/i.test(name)) continue
          } else if (versionNum) {
            if (!name.includes(versionNum)) continue
            // Avoid Hotfix/Experimental when the prefix is a numbered Proton.
            if (/hotfix|experimental/i.test(name)) continue
          } else {
            continue
          }
          out.push(protonRoot)
        }
      }
    }
    return out
  } catch {
    return []
  }
}

/** Resolve Steam CompatToolMapping name → Proton install folder candidates. */
function protonRootsFromCompatToolName(toolName: string): string[] {
  const name = toolName.trim()
  if (!name) return []
  const out: string[] = []
  const want = (folder: string) => {
    for (const root of steamRoots()) {
      for (const base of [
        path.join(root, 'steamapps', 'common', folder),
        path.join(root, 'compatibilitytools.d', folder),
      ]) {
        if (fs.existsSync(path.join(base, 'proton')) || wineBinsUnderProtonRoot(base).length) {
          out.push(base)
        }
      }
    }
  }

  if (/experimental/i.test(name)) want('Proton - Experimental')
  else if (/hotfix/i.test(name)) want('Proton Hotfix')
  else {
    const m = name.match(/proton[_-]?(\d+)(?:[._-](\d+))?/i)
    if (m) {
      const major = m[1]
      const minor = m[2]
      if (minor) want(`Proton ${major}.${minor}`)
      want(`Proton ${major}.0`)
      // Older naming: Proton 5.13 etc.
      want(`Proton ${major}.${minor ?? '0'}`)
    }
  }

  // Custom / GE tools often use the folder name as the internal tool name.
  for (const root of steamRoots()) {
    for (const base of [
      path.join(root, 'steamapps', 'common', name),
      path.join(root, 'compatibilitytools.d', name),
    ]) {
      if (fs.existsSync(path.join(base, 'proton')) || wineBinsUnderProtonRoot(base).length) {
        out.push(base)
      }
    }
  }

  return [...new Set(out)]
}

/** Read Steam config.vdf CompatToolMapping for Warframe (or global default "0"). */
function protonRootsFromCompatToolMapping(): string[] {
  const appIds = [WARFRAME_STEAM_APP_ID, '0']
  for (const appId of appIds) {
    for (const root of steamRoots()) {
      const configPath = path.join(root, 'config', 'config.vdf')
      try {
        const text = fs.readFileSync(configPath, 'utf8')
        // Match "230410" { ... "name" "proton_experimental" ... }
        const re = new RegExp(
          `"${appId}"\\s*\\{[^}]*?"name"\\s*"([^"]+)"`,
          'i',
        )
        const m = text.match(re)
        if (m?.[1]) {
          const roots = protonRootsFromCompatToolName(m[1])
          if (roots.length) return roots
        }
      } catch {
        // try next
      }
    }
  }
  return []
}

export type WineLauncher = { command: string; args: string[]; label: string }

/**
 * Prefer the Proton build Steam actually used for Warframe (same wineserver as the game).
 * Mixing Proton Hotfix wine against a prefix owned by another Proton often yields
 * "Process not found" / "Failed to gruzzle the crumbs" from warframe-api-helper.
 */
export function findWarframeWineLauncher(): WineLauncher | null {
  if (process.platform !== 'linux') return null
  const compat = warframeCompatDataDir()
  const candidates: string[] = []
  const seen = new Set<string>()

  const pushBins = (root: string) => {
    for (const bin of wineBinsUnderProtonRoot(root)) {
      if (seen.has(bin)) continue
      seen.add(bin)
      candidates.push(bin)
    }
  }

  if (compat) {
    for (const root of protonRootsFromConfigInfo(compat)) pushBins(root)
    for (const root of protonRootsMatchingVersionFile(compat)) pushBins(root)
  }
  for (const root of protonRootsFromCompatToolMapping()) pushBins(root)

  for (const bin of candidates) {
    if (!fs.existsSync(bin)) continue
    const protonRoot = protonRootFromWineBin(bin)
    const label = protonRoot ? path.basename(protonRoot) : path.basename(bin)
    const proton = protonRoot ? protonScriptForRoot(protonRoot) : null
    if (proton && compat) {
      // `proton run` attaches to the game's Steam compat environment correctly.
      return {
        command: proton,
        args: ['run'],
        label: `${label} (proton run)`,
      }
    }
    return { command: bin, args: [], label }
  }

  return findWineLauncher()
}

/** Steam client root that owns Warframe's compatdata (for STEAM_COMPAT_CLIENT_INSTALL_PATH). */
export function warframeSteamClientRoot(): string | null {
  const compat = warframeCompatDataDir()
  if (!compat) return null
  // …/steamapps/compatdata/230410 → …/steamapps → Steam library root
  const steamapps = path.dirname(path.dirname(compat))
  if (path.basename(steamapps) !== 'steamapps') return null
  const libraryRoot = path.dirname(steamapps)
  return fs.existsSync(libraryRoot) ? libraryRoot : null
}

function eeLogsUnderUsersBase(usersBase: string, out: string[]) {
  const users = ['steamuser', os.userInfo().username, 'User']
  for (const user of users) {
    out.push(path.join(usersBase, user, 'AppData', 'Local', 'Warframe', 'EE.log'))
  }
  try {
    for (const entry of fs.readdirSync(usersBase, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      out.push(path.join(usersBase, entry.name, 'AppData', 'Local', 'Warframe', 'EE.log'))
    }
  } catch {
    // ignore
  }
}

/** Candidate EE.log paths inside Proton / Wine prefixes. */
export function warframeProtonEeLogCandidates(): string[] {
  const out: string[] = []

  // Most reliable while Steam is launching / has launched Warframe via Proton.
  const compat = process.env.STEAM_COMPAT_DATA_PATH
  if (compat) {
    eeLogsUnderUsersBase(path.join(compat, 'pfx', 'drive_c', 'users'), out)
  }

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
    eeLogsUnderUsersBase(base, out)
  }

  // Heroic / Lutris / custom Wine prefixes (common layouts).
  const home = os.homedir()
  for (const pfx of [
    process.env.WINEPREFIX,
    path.join(home, 'Games', 'Heroic', 'Prefixes', 'default', 'Warframe'),
    path.join(home, 'Games', 'warframe'),
    path.join(home, '.local', 'share', 'Steam', 'steamapps', 'compatdata', WARFRAME_STEAM_APP_ID),
  ]) {
    if (!pfx) continue
    const usersBase = fs.existsSync(path.join(pfx, 'pfx', 'drive_c', 'users'))
      ? path.join(pfx, 'pfx', 'drive_c', 'users')
      : path.join(pfx, 'drive_c', 'users')
    if (fs.existsSync(usersBase)) eeLogsUnderUsersBase(usersBase, out)
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

function protonFallbackRank(name: string): number {
  if (/experimental/i.test(name)) return 300
  const m = name.match(/(\d+)\.(\d+)/)
  if (m) return 100 + Number(m[1]) * 10 + Number(m[2])
  if (/hotfix/i.test(name)) return 50
  return 0
}

/**
 * Prefer Proton's wine from a Steam library so the helper shares Warframe's prefix.
 * Falls back to system wine64/wine.
 *
 * Note: alphabetical Proton pick (Hotfix first) is only a fallback — prefer
 * {@link findWarframeWineLauncher} for inventory sync.
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
    // Prefer Experimental / numbered Proton over Hotfix (alpha-sort put Hotfix first).
    const protons = dirs
      .filter((d) => /^Proton/i.test(d))
      .sort((a, b) => protonFallbackRank(b) - protonFallbackRank(a) || b.localeCompare(a))
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
