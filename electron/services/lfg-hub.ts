/**
 * Local LFG hub (same protocol as lfg-api/server.mjs) for solo/LAN testing,
 * plus HTTP client for remote hosted boards.
 */
import { spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import path from 'node:path'
import { app } from 'electron'
import { loadSettings } from '../settings'
import type {
  LfgCreateInput,
  LfgListing,
  LfgListResult,
  LfgJoinResult,
} from '../../shared/types'
import { DEFAULT_LFG_API_BASE_URL } from '../../shared/types'

const DEFAULT_PORT = 17864
let child: ChildProcess | null = null
let localBaseUrl = `http://127.0.0.1:${DEFAULT_PORT}`

function apiScriptPath() {
  // Dev: project/lfg-api/server.mjs · Packaged: resources/lfg-api/server.mjs
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'lfg-api', 'server.mjs')
  }
  return path.join(app.getAppPath(), 'lfg-api', 'server.mjs')
}

export function getLfgBaseUrl(): string {
  const settings = loadSettings()
  const configured = String(settings.lfgApiBaseUrl || '').trim().replace(/\/+$/, '')
  if (configured.toLowerCase() === 'local') return localBaseUrl
  if (configured) return configured
  return DEFAULT_LFG_API_BASE_URL
}

export async function ensureLocalLfgHub(): Promise<{ ok: boolean; baseUrl: string; error?: string }> {
  const settings = loadSettings()
  const configured = String(settings.lfgApiBaseUrl || '').trim().replace(/\/+$/, '')
  const useLocal = configured.toLowerCase() === 'local'
  if (!useLocal) {
    return { ok: true, baseUrl: getLfgBaseUrl() }
  }
  if (child && !child.killed) {
    return { ok: true, baseUrl: localBaseUrl }
  }
  try {
    const script = apiScriptPath()
    // Prefer SQLite path; server falls back to JSON if native sqlite isn't available in Electron.
    const dataFile = path.join(app.getPath('userData'), 'lfg.sqlite')
    child = spawn(process.execPath, [script], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(DEFAULT_PORT),
        LFG_DATA: dataFile,
        LFG_ORIGIN: '*',
      },
      stdio: 'ignore',
      windowsHide: true,
    })
    child.on('exit', () => {
      child = null
    })
    localBaseUrl = `http://127.0.0.1:${DEFAULT_PORT}`
    // Brief wait for listen
    await new Promise((r) => setTimeout(r, 400))
    const health = await fetchJson(`${localBaseUrl}/health`).catch(() => null)
    if (!health?.ok) {
      return { ok: false, baseUrl: localBaseUrl, error: 'Local LFG hub did not start' }
    }
    return { ok: true, baseUrl: localBaseUrl }
  } catch (err) {
    return {
      ok: false,
      baseUrl: localBaseUrl,
      error: err instanceof Error ? err.message : 'Failed to start LFG hub',
    }
  }
}

export function stopLocalLfgHub() {
  if (child && !child.killed) {
    try {
      child.kill()
    } catch {
      // ignore
    }
  }
  child = null
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const status = res.status
    const msg =
      json?.error ||
      (status === 429
        ? 'LFG hub rate limited — retrying shortly'
        : `LFG HTTP ${status}`)
    const err = new Error(msg)
    ;(err as any).status = status
    throw err
  }
  return json
}

export async function lfgHealth(): Promise<{ ok: boolean; listings?: number; error?: string; baseUrl: string }> {
  await ensureLocalLfgHub()
  const baseUrl = getLfgBaseUrl()
  try {
    const h = await fetchJson(`${baseUrl}/health`)
    return { ok: true, listings: h.listings, baseUrl }
  } catch (err) {
    return {
      ok: false,
      baseUrl,
      error: err instanceof Error ? err.message : 'Unreachable',
    }
  }
}

export async function listLfg(opts?: {
  region?: string
  platform?: string
  activity?: string
  q?: string
}): Promise<LfgListResult> {
  await ensureLocalLfgHub()
  const baseUrl = getLfgBaseUrl()
  const params = new URLSearchParams()
  if (opts?.region) params.set('region', opts.region)
  if (opts?.platform) params.set('platform', opts.platform)
  if (opts?.activity) params.set('activity', opts.activity)
  if (opts?.q) params.set('q', opts.q)
  const qs = params.toString()
  try {
    const data = await fetchJson(`${baseUrl}/listings${qs ? `?${qs}` : ''}`)
    return {
      listings: (data.listings || []) as LfgListing[],
      baseUrl,
      error: null,
    }
  } catch (err) {
    return {
      listings: [],
      baseUrl,
      error: err instanceof Error ? err.message : 'Failed to list',
    }
  }
}

export async function createLfg(
  input: LfgCreateInput,
): Promise<{ ok: boolean; listing?: LfgListing; hostToken?: string; error?: string }> {
  await ensureLocalLfgHub()
  const baseUrl = getLfgBaseUrl()
  try {
    const data = await fetchJson(`${baseUrl}/listings`, {
      method: 'POST',
      body: JSON.stringify(input),
    })
    return { ok: true, listing: data.listing, hostToken: data.hostToken }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Create failed' }
  }
}

export async function joinLfg(input: {
  id: string
  ign: string
  clientId: string
}): Promise<LfgJoinResult> {
  await ensureLocalLfgHub()
  const baseUrl = getLfgBaseUrl()
  try {
    const data = await fetchJson(`${baseUrl}/listings/${encodeURIComponent(input.id)}/join`, {
      method: 'POST',
      body: JSON.stringify({ ign: input.ign, clientId: input.clientId }),
    })
    return { ok: true, listing: data.listing, error: null }
  } catch (err) {
    return {
      ok: false,
      listing: null,
      error: err instanceof Error ? err.message : 'Join failed',
    }
  }
}

export async function leaveLfg(input: { id: string; clientId: string }): Promise<{ ok: boolean; error?: string }> {
  await ensureLocalLfgHub()
  const baseUrl = getLfgBaseUrl()
  try {
    await fetchJson(`${baseUrl}/listings/${encodeURIComponent(input.id)}/leave`, {
      method: 'POST',
      body: JSON.stringify({ clientId: input.clientId }),
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Leave failed' }
  }
}

export async function deleteLfg(input: {
  id: string
  hostToken: string
}): Promise<{ ok: boolean; error?: string }> {
  await ensureLocalLfgHub()
  const baseUrl = getLfgBaseUrl()
  try {
    await fetchJson(`${baseUrl}/listings/${encodeURIComponent(input.id)}`, {
      method: 'DELETE',
      headers: { 'X-LFG-Token': input.hostToken },
      body: JSON.stringify({ hostToken: input.hostToken }),
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Delete failed' }
  }
}
