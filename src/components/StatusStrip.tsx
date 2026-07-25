import { AppSettings } from '../../shared/types'
import { InventoryStatus } from '../../shared/types'
import './onboarding.css'

type Props = {
  settings: AppSettings
  inventory: InventoryStatus | null
  worldstateOk: boolean
}

export function StatusStrip({ settings, inventory, worldstateOk }: Props) {
  const eeOk = Boolean(settings.eeLogPath)
  const invOk = Boolean(inventory?.loaded)
  const overlayOn = settings.overlayVisible

  return (
    <div className="status-strip" data-tour="status-strip">
      <span className={`status-chip ${overlayOn ? 'is-ok' : 'is-off'}`}>
        <span className={`status-dot ${overlayOn ? '' : 'off'}`} />
        Overlay {overlayOn ? 'on' : 'off'}
      </span>
      <span className={`status-chip ${worldstateOk ? 'is-ok' : 'is-warn'}`}>
        Worldstate {worldstateOk ? 'live' : 'waiting'}
      </span>
      <span className={`status-chip ${eeOk ? 'is-ok' : 'is-warn'}`}>
        EE.log {eeOk ? 'ready' : 'not set'}
      </span>
      <span className={`status-chip ${invOk ? 'is-ok' : 'is-off'}`}>
        Inventory {invOk ? 'synced' : 'optional'}
      </span>
    </div>
  )
}
