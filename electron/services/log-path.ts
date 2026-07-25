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
  let best: { path: string; mtime: number } | null = null
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue
    try {
      const mtime = fs.statSync(candidate).mtimeMs
      if (!best || mtime > best.mtime) best = { path: candidate, mtime }
    } catch {
      if (!best) best = { path: candidate, mtime: 0 }
    }
  }
  return best?.path ?? null
}
