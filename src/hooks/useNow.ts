import { useSharedNow } from './NowContext'

/**
 * Live clock for countdown labels. Prefer wrapping the app in NowProvider
 * so all panels share one interval.
 */
export function useNow(_intervalMs = 1000): number {
  return useSharedNow()
}
