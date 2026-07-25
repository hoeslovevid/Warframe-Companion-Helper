import { AppSettings, InventoryStatus } from '../../shared/types'
import './onboarding.css'

type Props = {
  settings: AppSettings
  inventory: InventoryStatus | null
  worldstateOk: boolean
  worldstateStale?: boolean
  onGoSettings?: () => void
  onGoModules?: () => void
  onToggleOverlay?: () => void
  onDetectEeLog?: () => void
  onRefreshWorldstate?: () => void
}

export function StatusStrip({
  settings,
  inventory,
  worldstateOk,
  worldstateStale,
  onGoSettings,
  onToggleOverlay,
  onDetectEeLog,
  onRefreshWorldstate,
}: Props) {
  const eeOk = Boolean(settings.eeLogPath)
  const invOk = Boolean(inventory?.loaded)
  const overlayOn = settings.overlayVisible

  return (
    <div className="status-strip" data-tour="status-strip">
      <button
        type="button"
        className={`status-chip ${overlayOn ? 'is-ok' : 'is-off'}`}
        onClick={onToggleOverlay}
        title="Toggle overlay"
      >
        <span className={`status-dot ${overlayOn ? '' : 'off'}`} />
        Overlay {overlayOn ? 'on' : 'off'}
      </button>
      <button
        type="button"
        className={`status-chip ${worldstateOk && !worldstateStale ? 'is-ok' : 'is-warn'}`}
        onClick={onRefreshWorldstate}
        title="Refresh worldstate"
      >
        Worldstate {worldstateStale ? 'stale' : worldstateOk ? 'live' : 'waiting'}
      </button>
      <button
        type="button"
        className={`status-chip ${eeOk ? 'is-ok' : 'is-warn'}`}
        onClick={eeOk ? onGoSettings : onDetectEeLog}
        title={eeOk ? 'EE.log path in Settings' : 'Detect EE.log'}
      >
        EE.log {eeOk ? 'ready' : 'not set — detect'}
      </button>
      <button
        type="button"
        className={`status-chip ${invOk ? 'is-ok' : 'is-off'}`}
        onClick={onGoSettings}
        title="Inventory settings"
      >
        Inventory {invOk ? 'synced' : 'optional — sync'}
      </button>
      {!settings.onboarding.borderlessAck ? (
        <button
          type="button"
          className="status-chip is-warn"
          onClick={onGoSettings}
          title="Warframe must be Borderless Windowed"
        >
          Check Borderless
        </button>
      ) : null}
    </div>
  )
}
