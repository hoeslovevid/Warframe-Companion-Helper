/** Format remaining time until an ISO expiry (or Date). Updates every render via useNow(). */
export function formatCountdown(target: string | number | Date | null | undefined, now = Date.now()): string {
  if (target == null || target === '') return '—'
  const end = typeof target === 'number' ? target : new Date(target).getTime()
  if (Number.isNaN(end)) return '—'

  const ms = end - now
  if (ms <= 0) return 'expired'

  const totalSec = Math.floor(ms / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60

  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${pad(s)}s`
  if (m > 0) return `${m}m ${pad(s)}s`
  return `${s}s`
}

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

export function isExpired(target: string | number | Date | null | undefined, now = Date.now()): boolean {
  if (target == null || target === '') return false
  const end = typeof target === 'number' ? target : new Date(target).getTime()
  if (Number.isNaN(end)) return false
  return end <= now
}
