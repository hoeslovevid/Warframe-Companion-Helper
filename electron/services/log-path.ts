import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { warframeProtonEeLogCandidates } from './steam-paths'

function windowsCandidates(): string[] {
  return [
    path.join(process.env.LOCALAPPDATA || '', 'Warframe', 'EE.log'),
    path.join(os.homedir(), 'AppData', 'Local', 'Warframe', 'EE.log'),
    'C:\\Program Files\\Steam\\steamapps\\common\\Warframe\\EE.log',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Warframe\\EE.log',
  ]
}

function linuxCandidates(): string[] {
  return [
    ...warframeProtonEeLogCandidates(),
    // Native / uncommon installs
    path.join(os.homedir(), '.local', 'share', 'Warframe', 'EE.log'),
  ]
}

export function detectEeLogPath(): string | null {
  const candidates =
    process.platform === 'linux' ? linuxCandidates() : windowsCandidates()

  // Prefer the newest existing log (Proton users may have stale copies).
  // Prefer files touched in the last 7 days so abandoned prefixes lose.
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  let best: { path: string; mtime: number } | null = null
  let bestRecent: { path: string; mtime: number } | null = null
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue
    try {
      const mtime = fs.statSync(candidate).mtimeMs
      if (!best || mtime > best.mtime) best = { path: candidate, mtime }
      if (mtime >= weekAgo && (!bestRecent || mtime > bestRecent.mtime)) {
        bestRecent = { path: candidate, mtime }
      }
    } catch {
      if (!best) best = { path: candidate, mtime: 0 }
    }
  }
  const picked = bestRecent || best
  if (picked?.path) {
    console.info(`[Everything Warframe] EE.log resolved: ${picked.path}`)
  } else {
    console.warn(
      `[Everything Warframe] EE.log not found — checked ${candidates.length} candidate path(s). ` +
        'Set the path under Settings, or launch Warframe once via Steam/Proton.',
    )
  }
  return picked?.path ?? null
}
