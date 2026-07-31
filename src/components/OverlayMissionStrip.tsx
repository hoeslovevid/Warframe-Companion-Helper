import { useEffect, useState } from 'react'
import { AppSettings, InventoryStatus, WorldstateSnapshot } from '../../shared/types'
import { formatCountdown } from '../lib/time'
import './OverlayMissionStrip.css'

type Props = {
  settings: AppSettings
  data: WorldstateSnapshot
  inventory: InventoryStatus | null
  now?: number
  onSyncInventory?: () => void
}

/**
 * Compact overlay cue: next useful fissure / inventory stale / Baro / open LFG seats.
 * Shown above the layout stage when overlay is live.
 */
export function OverlayMissionStrip({
  settings,
  data,
  inventory,
  now = Date.now(),
  onSyncInventory,
}: Props) {
  const [lfgOpen, setLfgOpen] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      if (!window.voidlens?.listLfg) return
      try {
        const res = await window.voidlens.listLfg({
          region: settings.lfgRegion || 'all',
          platform: settings.lfgPlatform || undefined,
          activity: 'all',
        })
        if (cancelled) return
        const open = (res.listings || []).filter((l) => l.slotsOpen > 0).length
        setLfgOpen(open)
      } catch {
        if (!cancelled) setLfgOpen(null)
      }
    }
    void tick()
    const id = window.setInterval(() => void tick(), 60_000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [settings.lfgRegion, settings.lfgPlatform])

  const bits: string[] = []
  let action: { label: string; run?: () => void } | null = null

  if (inventory?.consent && inventory.stale && inventory.warframeRunning) {
    bits.push('Inventory stale')
    action = { label: 'Sync', run: onSyncInventory }
  } else if (data.baro?.active) {
    bits.push(`Baro · ${data.baro.location || 'relay'}`)
    if (settings.baroWishlist.length) bits.push(`${settings.baroWishlist.length} wishlist`)
  } else {
    const tierSet = new Set(settings.fissureTiers.map((t) => t.toLowerCase()))
    const next = data.fissures
      .filter((f) => tierSet.has(f.tier.toLowerCase()))
      .filter((f) => {
        if (settings.fissurePathMode === 'steel') return f.isHard
        if (settings.fissurePathMode === 'normal') return !f.isHard
        return true
      })
      .filter((f) => settings.fissureShowStorms || !f.isStorm)
      .filter((f) => new Date(f.expiry).getTime() > now)
      .sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime())[0]
    if (next) {
      bits.push(
        `${next.tier} ${next.missionType}${next.isHard ? ' SP' : ''} · ${formatCountdown(next.expiry, now)}`,
      )
    }
  }

  if (lfgOpen != null && lfgOpen > 0) {
    bits.push(`${lfgOpen} LFG open`)
  }

  if (settings.activePlayProfile) {
    bits.unshift(
      settings.activePlayProfile === 'fissure-grind'
        ? 'Relic farm'
        : settings.activePlayProfile === 'riven-farm'
          ? 'Riven farm'
          : settings.activePlayProfile === 'baro-day'
            ? 'Baro day'
            : settings.activePlayProfile === 'nightwave'
              ? 'Nightwave'
              : 'Open world',
    )
  }

  if (!bits.length) return null

  return (
    <div className="mission-strip" role="status">
      <span className="mission-strip__text">{bits.join(' · ')}</span>
      {action?.run ? (
        <button type="button" className="mission-strip__btn" onClick={action.run}>
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
