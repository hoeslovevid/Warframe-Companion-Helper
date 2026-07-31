/**
 * Soft polling for buy-target floor hits → desktop notification.
 * Not a live scraper: checks every few minutes when enabled.
 */
import { Notification } from 'electron'
import { loadSettings } from '../settings'
import { lookupMarketPrices } from './market-prices'

const INTERVAL_MS = 5 * 60_000
const COOLDOWN_MS = 60 * 60_000

let timer: NodeJS.Timeout | null = null
let running = false

/** name → last alert { floor, at } */
const lastAlert = new Map<string, { floor: number; at: number }>()

async function checkOnce() {
  if (running) return
  const settings = loadSettings()
  if (!settings.marketBuyAlertEnabled) return
  if (!settings.modules.market) return
  const targets = settings.marketBuyTargets || []
  if (!targets.length) return

  running = true
  try {
    const names = targets.map((t) => t.name)
    const map = await lookupMarketPrices(names)
    const hits: string[] = []
    const now = Date.now()
    for (const t of targets) {
      const hit = map.get(t.name)
      if (!hit) continue
      const floor = hit.lowest || hit.platinum
      if (floor > t.maxPlatinum) continue
      const prev = lastAlert.get(t.name.toLowerCase())
      if (prev && prev.floor === floor && now - prev.at < COOLDOWN_MS) continue
      lastAlert.set(t.name.toLowerCase(), { floor, at: now })
      hits.push(`${t.name} @ ${floor}p (max ${t.maxPlatinum}p)`)
    }
    if (!hits.length || !Notification.isSupported()) return
    const tip = new Notification({
      title: hits.length === 1 ? 'Market buy hit' : `${hits.length} market buy hits`,
      body: hits.slice(0, 4).join('\n') + (hits.length > 4 ? `\n+${hits.length - 4} more` : ''),
      silent: false,
    })
    tip.show()
  } catch {
    // ignore network errors
  } finally {
    running = false
  }
}

export function startMarketBuyAlerts() {
  stopMarketBuyAlerts()
  void checkOnce()
  timer = setInterval(() => void checkOnce(), INTERVAL_MS)
}

export function stopMarketBuyAlerts() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function syncMarketBuyAlertsFromSettings() {
  const settings = loadSettings()
  if (settings.marketBuyAlertEnabled && settings.modules.market) {
    startMarketBuyAlerts()
  } else {
    stopMarketBuyAlerts()
  }
}
