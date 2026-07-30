import {
  createContext,
  ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from 'react'

type ClockStore = {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => number
}

function createClockStore(intervalMs: number, active: boolean): ClockStore {
  let now = Date.now()
  const listeners = new Set<() => void>()
  let timer: number | null = null
  let pageVisible = typeof document === 'undefined' || !document.hidden

  const emit = () => {
    now = Date.now()
    for (const listener of listeners) listener()
  }

  const syncTimer = () => {
    const shouldRun = active && pageVisible && listeners.size > 0 && intervalMs > 0
    if (shouldRun && timer == null) {
      emit()
      timer = window.setInterval(emit, intervalMs)
    } else if (!shouldRun && timer != null) {
      window.clearInterval(timer)
      timer = null
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      pageVisible = !document.hidden
      syncTimer()
    })
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      syncTimer()
      return () => {
        listeners.delete(listener)
        syncTimer()
      }
    },
    getSnapshot: () => now,
  }
}

const ClockContext = createContext<ClockStore | null>(null)

type NowProviderProps = {
  children: ReactNode
  /** When false, countdown consumers freeze (saves renderer work). */
  active?: boolean
  intervalMs?: number
}

/**
 * One shared clock for countdown panels. Only `useSharedNow` subscribers
 * re-render — the rest of the companion/overlay tree stays still.
 */
export function NowProvider({
  children,
  active = true,
  intervalMs = 1000,
}: NowProviderProps) {
  const store = useMemo(
    () => createClockStore(intervalMs, active),
    [intervalMs, active],
  )
  return <ClockContext.Provider value={store}>{children}</ClockContext.Provider>
}

export function useSharedNow(): number {
  const store = useContext(ClockContext)
  return useSyncExternalStore(
    store?.subscribe ?? emptySubscribe,
    store?.getSnapshot ?? fallbackNow,
    fallbackNow,
  )
}

function emptySubscribe() {
  return () => {}
}

function fallbackNow() {
  return Date.now()
}
