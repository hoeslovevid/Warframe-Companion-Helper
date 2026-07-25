import { useCallback, useEffect, useState } from 'react'
import { RivenScanState } from '../../shared/types'

const empty: RivenScanState = {
  active: false,
  scanning: false,
  scannedAt: '',
  trigger: 'none',
  error: null,
  current: null,
  reroll: null,
  recommendation: 'none',
}

function api() {
  return window.voidlens
}

export function useRivenScan() {
  const [state, setState] = useState<RivenScanState>(empty)

  useEffect(() => {
    let unsub = () => {}
    const boot = async () => {
      if (!api()?.getRivenScan) return
      setState(await api().getRivenScan())
      unsub = api().onRivenScanUpdated(setState)
    }
    void boot()
    return () => unsub()
  }, [])

  const scan = useCallback(async () => {
    if (!api()?.scanRivens) return
    setState((prev) => ({ ...prev, scanning: true, error: null, active: true }))
    const next = await api().scanRivens()
    setState(next)
    return next
  }, [])

  const clear = useCallback(async () => {
    if (!api()?.clearRivenScan) return
    const next = await api().clearRivenScan()
    setState(next)
  }, [])

  return { state, scan, clear }
}
