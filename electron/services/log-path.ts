import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const CANDIDATES = [
  path.join(process.env.LOCALAPPDATA || '', 'Warframe', 'EE.log'),
  path.join(os.homedir(), 'AppData', 'Local', 'Warframe', 'EE.log'),
  'C:\\Program Files\\Steam\\steamapps\\common\\Warframe\\EE.log',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Warframe\\EE.log',
]

export function detectEeLogPath(): string | null {
  for (const candidate of CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  return null
}
