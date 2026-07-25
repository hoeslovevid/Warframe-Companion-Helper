import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'

const NowContext = createContext(Date.now())

type NowProviderProps = {
  children: ReactNode
  /** When false, the shared clock stops (saves renderer work). */
  active?: boolean
  intervalMs?: number
}

/**
 * One interval for the whole tree instead of per-panel timers.
 * Also pauses while the document is hidden (minimized / occluded).
 */
export function NowProvider({
  children,
  active = true,
  intervalMs = 1000,
}: NowProviderProps) {
  const [now, setNow] = useState(() => Date.now())
  const [visible, setVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  )

  useEffect(() => {
    const onVis = () => setVisible(!document.hidden)
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const running = active && visible

  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [running, intervalMs])

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>
}

export function useSharedNow(): number {
  return useContext(NowContext)
}
