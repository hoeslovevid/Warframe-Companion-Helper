/**
 * Soft Baro-arrival desktop notification (once per visit).
 */
import { Notification } from 'electron'
import { loadSettings, updateSettings } from '../settings'
import type { WorldstateSnapshot } from '../../shared/types'

let lastCheckActive = false

export function checkBaroArrivalNotify(snapshot: WorldstateSnapshot) {
  const settings = loadSettings()
  if (!settings.baroArrivalNotify) return
  const baro = snapshot.baro
  const active = Boolean(baro?.active)
  const visitKey = baro?.departure || baro?.arrival || ''
  if (!active) {
    lastCheckActive = false
    return
  }
  if (lastCheckActive) return
  lastCheckActive = true
  if (!visitKey) return
  if (settings.baroArrivalNotifiedKey === visitKey) return
  updateSettings({ baroArrivalNotifiedKey: visitKey })
  if (!Notification.isSupported()) return
  const wishlist = settings.baroWishlist?.length || 0
  const tip = new Notification({
    title: "Baro Ki'Teer has arrived",
    body:
      (baro?.location ? `${baro.location}. ` : '') +
      (wishlist ? `${wishlist} wishlist item${wishlist === 1 ? '' : 's'}.` : 'Check the Baro panel.') +
      ' Open companion for buy plan.',
  })
  tip.show()
}
