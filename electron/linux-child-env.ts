import fs from 'node:fs'
import path from 'node:path'

export type WineHelperLauncher = { command: string; args: string[]; label: string }

const APPIMAGE_MARKER_KEYS = [
  'APPDIR',
  'APPIMAGE',
  'APPIMAGE_ORIGINAL_LD_LIBRARY_PATH',
  'APPIMAGE_ORIGINAL_PATH',
  'APPIMAGE_ORIGINAL_LD_PRELOAD',
  'APPIMAGE_EXTRACT_AND_RUN',
  'ARGV0',
  'OWD',
] as const

const PATH_LIKE_KEYS = [
  'PATH',
  'LD_LIBRARY_PATH',
  'LD_PRELOAD',
  'LIBRARY_PATH',
  'XDG_DATA_DIRS',
  'XDG_CONFIG_DIRS',
  'QT_PLUGIN_PATH',
  'QT_QPA_PLATFORM_PLUGIN_PATH',
  'GTK_PATH',
  'GIO_MODULE_DIR',
  'GI_TYPELIB_PATH',
  'PYTHONHOME',
  'PYTHONPATH',
] as const

function pathSegments(value: string | undefined): string[] {
  if (!value) return []
  return value.split(path.delimiter).filter(Boolean)
}

function joinSegments(segments: string[]): string | undefined {
  return segments.length > 0 ? segments.join(path.delimiter) : undefined
}

/** True when a path lives under the AppImage mount or Electron runtime tree. */
export function isBundledRuntimePath(entry: string, appDir?: string): boolean {
  if (!entry) return false
  const normalized = path.resolve(entry)
  if (normalized.includes(`${path.sep}.mount_`)) return true
  if (appDir) {
    const root = path.resolve(appDir)
    if (normalized === root || normalized.startsWith(root + path.sep)) return true
  }
  return false
}

/**
 * Strip Electron / AppImage runtime pollution so external tools (Wine, system
 * binaries) load the host's libraries instead of the AppImage's.
 *
 * Without this, Proton/Wine inherits Electron's older libfontconfig and fails
 * to parse modern `/etc/fonts/fonts.conf` (`prefix="xdg"`), surfacing as
 * "Fontconfig error: out of memory; cannot add directory ./share/fonts" and
 * breaking follow-up HTTPS (inventory download).
 */
export function sanitizeLinuxChildEnv(
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...source }
  const appDir = source.APPDIR

  // Prefer the pre-AppImage values when the runtime saved them.
  if (source.APPIMAGE_ORIGINAL_LD_LIBRARY_PATH != null) {
    env.LD_LIBRARY_PATH = source.APPIMAGE_ORIGINAL_LD_LIBRARY_PATH || undefined
    if (!env.LD_LIBRARY_PATH) delete env.LD_LIBRARY_PATH
  }
  if (source.APPIMAGE_ORIGINAL_PATH) {
    env.PATH = source.APPIMAGE_ORIGINAL_PATH
  }
  if (source.APPIMAGE_ORIGINAL_LD_PRELOAD != null) {
    env.LD_PRELOAD = source.APPIMAGE_ORIGINAL_LD_PRELOAD || undefined
    if (!env.LD_PRELOAD) delete env.LD_PRELOAD
  }

  for (const key of APPIMAGE_MARKER_KEYS) {
    delete env[key]
  }

  for (const key of PATH_LIKE_KEYS) {
    const raw = env[key]
    if (raw == null) continue
    const kept = pathSegments(raw).filter((seg) => !isBundledRuntimePath(seg, appDir))
    const joined = joinSegments(kept)
    if (joined) env[key] = joined
    else delete env[key]
  }

  // Electron may point these at bundled configs that Wine's fontconfig cannot parse.
  delete env.FONTCONFIG_PATH
  delete env.FONTCONFIG_FILE
  delete env.FONTCONFIG_SYSROOT

  return env
}

function protonFilesRootFromCommand(command: string): string | null {
  // .../Proton X.Y/files/bin/wine64  or  .../Proton X.Y/dist/bin/wine64
  const binDir = path.dirname(command)
  if (path.basename(binDir) === 'bin') {
    const filesOrDist = path.dirname(binDir)
    const leaf = path.basename(filesOrDist)
    if (leaf === 'files' || leaf === 'dist') return filesOrDist
  }
  // .../Proton X.Y/proton  (script used by `proton run`)
  if (path.basename(command) === 'proton') {
    for (const leaf of ['files', 'dist']) {
      const root = path.join(path.dirname(command), leaf)
      if (fs.existsSync(root)) return root
    }
  }
  return null
}

function existingLibDirs(root: string): string[] {
  const dirs = [path.join(root, 'lib64'), path.join(root, 'lib')]
  return dirs.filter((d) => {
    try {
      return fs.existsSync(d)
    } catch {
      return false
    }
  })
}

/**
 * Environment for launching warframe-api-helper under Proton/Wine from an
 * Electron (especially AppImage) parent process.
 */
export function buildWineHelperEnv(
  wine: WineHelperLauncher,
  prefix: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = sanitizeLinuxChildEnv(source)

  env.WINEPREFIX = prefix
  env.WINEDEBUG = '-all'
  // Skip desktop integration noise while the helper runs headless-ish.
  const overrides = env.WINEDLLOVERRIDES?.trim()
  env.WINEDLLOVERRIDES = overrides
    ? `${overrides};winemenubuilder.exe=d`
    : 'winemenubuilder.exe=d'

  // Prefer the host fontconfig once AppImage libs are stripped.
  if (fs.existsSync('/etc/fonts/fonts.conf')) {
    env.FONTCONFIG_FILE = '/etc/fonts/fonts.conf'
    env.FONTCONFIG_PATH = '/etc/fonts'
  }

  if (path.basename(prefix) === 'pfx') {
    env.STEAM_COMPAT_DATA_PATH = path.dirname(prefix)
  }

  const protonRoot = protonFilesRootFromCommand(wine.command)
  if (protonRoot) {
    const protonLibs = existingLibDirs(protonRoot)
    if (protonLibs.length > 0) {
      const rest = pathSegments(env.LD_LIBRARY_PATH)
      env.LD_LIBRARY_PATH = joinSegments([...protonLibs, ...rest])
    }
  }

  return env
}

/** Drop Fontconfig spam so the helper's real failure reason stays visible. */
export function scrubWineHelperOutput(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim()
      if (!t) return false
      if (/^Fontconfig (error|warning):/i.test(t)) return false
      if (/fontconfig/i.test(t) && /out of memory/i.test(t)) return false
      return true
    })
    .join('\n')
    .trim()
}
