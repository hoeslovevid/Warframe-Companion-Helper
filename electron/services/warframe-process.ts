import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const PROCESS_NAMES = new Set([
  'warframe.x64.exe',
  'warframe.exe',
  'warframe.x64',
  'warframe',
])

let lastCheck = 0
let lastRunning = false
let lastForeground = false

async function queryWindows(): Promise<{ running: boolean; foreground: boolean }> {
  try {
    // NOTE: do not use $PID — it is a read-only automatic variable in PowerShell.
    const script = `
$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $_.ProcessName -match '^(?i)Warframe(\\.x64)?$'
}
$running = $procs.Count -gt 0
$fg = $false
if ($running) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Fw {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
  $hwnd = [Fw]::GetForegroundWindow()
  $fgPid = 0
  [void][Fw]::GetWindowThreadProcessId($hwnd, [ref]$fgPid)
  if ($fgPid -ne 0) {
    $fgProc = Get-Process -Id $fgPid -ErrorAction SilentlyContinue
    if ($fgProc -and ($fgProc.ProcessName -match '^(?i)Warframe(\\.x64)?$')) { $fg = $true }
  }
}
Write-Output ("{0}|{1}" -f $running, $fg)
`
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 2500, windowsHide: true },
    )
    const line = String(stdout).trim().split(/\r?\n/).pop() || ''
    const [running, foreground] = line.split('|')
    return {
      running: /^true$/i.test(running || ''),
      foreground: /^true$/i.test(foreground || ''),
    }
  } catch {
    try {
      const { stdout } = await execFileAsync(
        'tasklist',
        ['/FO', 'CSV', '/NH'],
        { timeout: 2500, windowsHide: true },
      )
      const running = String(stdout)
        .toLowerCase()
        .split(/\r?\n/)
        .some((line) => [...PROCESS_NAMES].some((n) => line.includes(n)))
      return { running, foreground: running }
    } catch {
      return { running: false, foreground: false }
    }
  }
}

/** Warframe under Proton appears as Warframe.x64.exe in the Linux process list. */
async function queryLinux(): Promise<{ running: boolean; foreground: boolean }> {
  let running = false
  try {
    const { stdout } = await execFileAsync(
      'pgrep',
      ['-if', 'warframe(\\.x64)?(\\.exe)?'],
      { timeout: 2500 },
    )
    running = stdout.trim().length > 0
  } catch {
    // pgrep exits 1 when no match — also try /proc scan
    running = scanProcForWarframe()
  }

  if (!running) return { running: false, foreground: false }

  // X11: optional active-window check. Wayland usually can't — treat running as playable.
  let foreground = running
  try {
    const { stdout } = await execFileAsync(
      'xdotool',
      ['getactivewindow', 'getwindowname'],
      { timeout: 1500 },
    )
    const name = stdout.toLowerCase()
    foreground = /warframe/.test(name)
  } catch {
    foreground = running
  }
  return { running, foreground }
}

function scanProcForWarframe(): boolean {
  try {
    for (const dir of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(dir)) continue
      try {
        const cmdline = fs.readFileSync(`/proc/${dir}/cmdline`, 'utf8').toLowerCase()
        if (cmdline.includes('warframe.x64') || cmdline.includes('warframe.exe')) {
          return true
        }
      } catch {
        // ignore unreadable pids
      }
    }
  } catch {
    // ignore
  }
  return false
}

async function queryPlatform(): Promise<{ running: boolean; foreground: boolean }> {
  if (process.platform === 'win32') return queryWindows()
  if (process.platform === 'linux') return queryLinux()
  return { running: false, foreground: false }
}

export async function getWarframeProcessState(): Promise<{
  running: boolean
  foreground: boolean
}> {
  const now = Date.now()
  if (now - lastCheck < 2000) {
    return { running: lastRunning, foreground: lastForeground }
  }
  const next = await queryPlatform()
  lastCheck = now
  lastRunning = next.running
  lastForeground = next.foreground
  return next
}

export async function isWarframeForeground(): Promise<boolean> {
  const state = await getWarframeProcessState()
  return state.foreground
}

export async function isWarframeRunning(): Promise<boolean> {
  const state = await getWarframeProcessState()
  return state.running
}

/** Bust the short-lived cache (e.g. right before an auto-scan). */
export function invalidateWarframeProcessCache() {
  lastCheck = 0
}
