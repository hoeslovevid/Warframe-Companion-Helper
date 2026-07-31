import { useCallback, useEffect, useState } from 'react'
import { RelicScanState } from '../../shared/types'

const empty: RelicScanState = {
  active: false,
  scanning: false,
  scannedAt: '',
  trigger: 'none',
  error: null,
  rewards: [],
  inventoryLoaded: false,
  celebration: false,
  squadSize: null,
  scanMeta: null,
}

function api() {
  return window.voidlens
}

export function useRelicScan() {
  const [state, setState] = useState<RelicScanState>(empty)

  useEffect(() => {
    let unsub = () => {}
    const boot = async () => {
      if (!api()) return
      setState(await api().getRelicScan())
      unsub = api().onRelicScanUpdated(setState)
    }
    void boot()
    return () => unsub()
  }, [])

  const scan = useCallback(async () => {
    if (!api()) return
    setState((prev) => ({ ...prev, scanning: true, error: null }))
    const next = await api().scanRelicRewards()
    setState(next)
    return next
  }, [])

  const clear = useCallback(async () => {
    if (!api()) return
    const next = await api().clearRelicScan()
    setState(next)
  }, [])

  const ackCelebration = useCallback(async () => {
    if (!api()?.ackRelicCelebration) return
    const next = await api().ackRelicCelebration()
    setState(next)
  }, [])

  return { state, scan, clear, ackCelebration }
}