import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AppSettings,
  DEFAULT_SETTINGS,
  ModuleId,
  WorldstateSnapshot,
} from '../../shared/types'
import { isExpired } from '../lib/time'

const emptyWorldstate: WorldstateSnapshot = {
  fetchedAt: '',
  cycles: [],
  fissures: [],
  baro: null,
  nightwave: null,
  arbitration: null,
}

function api() {
  return window.voidlens
}

function collectExpiries(data: WorldstateSnapshot): string[] {
  const list: string[] = []
  for (const c of data.cycles) if (c.expiry) list.push(c.expiry)
  for (const f of data.fissures) if (f.expiry) list.push(f.expiry)
  // Only the relevant upcoming Baro boundary — past activation must not force refresh loops
  if (data.baro) {
    if (data.baro.active && data.baro.departure) list.push(data.baro.departure)
    else if (!data.baro.active && data.baro.arrival) list.push(data.baro.arrival)
  }
  if (data.arbitration?.expiry) list.push(data.arbitration.expiry)
  if (data.nightwave?.expiry) list.push(data.nightwave.expiry)
  return list
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let unsub = () => {}
    const boot = async () => {
      if (!api()) {
        setReady(true)
        return
      }
      const initial = await api().getSettings()
      setSettings(initial)
      setReady(true)
      unsub = api().onSettingsChanged(setSettings)
    }
    void boot()
    return () => unsub()
  }, [])

  const updateSettings = useCallback(async (partial: Partial<AppSettings>) => {
    if (!api()) return
    const next = await api().updateSettings(partial)
    setSettings(next)
  }, [])

  const setModuleEnabled = useCallback(async (id: ModuleId, enabled: boolean) => {
    if (!api()) return
    const next = await api().setModuleEnabled(id, enabled)
    setSettings(next)
  }, [])

  return { settings, ready, updateSettings, setModuleEnabled }
}

export function useWorldstate() {
  const [data, setData] = useState<WorldstateSnapshot>(emptyWorldstate)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const refreshingRef = useRef(false)
  const lastExpiryRefreshRef = useRef(0)

  const refresh = useCallback(async (quiet = false) => {
    if (!api() || refreshingRef.current) {
      if (!api()) setLoading(false)
      return
    }
    refreshingRef.current = true
    if (!quiet) setLoading(true)
    setError(null)
    try {
      const next = await api().refreshWorldstate()
      setData(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load worldstate')
    } finally {
      refreshingRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let unsub = () => {}
    const boot = async () => {
      if (!api()) {
        setLoading(false)
        return
      }
      try {
        const initial = await api().getWorldstate()
        setData(initial)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load worldstate')
      } finally {
        setLoading(false)
      }
      unsub = api().onWorldstateUpdated(setData)
    }
    void boot()
    return () => unsub()
  }, [])

  // When a countdown hits zero, pull fresh worldstate so states/nodes roll over
  useEffect(() => {
    const id = window.setInterval(() => {
      const expiries = collectExpiries(data)
      if (expiries.length === 0) return
      const now = Date.now()
      const anyExpired = expiries.some((e) => isExpired(e, now))
      if (!anyExpired) return
      if (now - lastExpiryRefreshRef.current < 5000) return
      lastExpiryRefreshRef.current = now
      void refresh(true)
    }, 1000)
    return () => window.clearInterval(id)
  }, [data, refresh])

  return { data, loading, error, refresh }
}
