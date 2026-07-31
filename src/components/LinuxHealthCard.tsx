import { useMemo, useState } from 'react'
import type { AppSettings, InventoryStatus } from '../../shared/types'
import { pushToast } from '../lib/toast'
import './linux-health.css'

type Props = {
  settings: AppSettings
  inventory: InventoryStatus | null
  onDetectEeLog: () => void
  onSyncInventory: () => void
  onOpenCaptureWizard?: () => void
}

type Row = { label: string; state: 'ok' | 'warn' | 'off'; detail: string; fix?: () => void; fixLabel?: string }

export function LinuxHealthCard({
  settings,
  inventory,
  onDetectEeLog,
  onSyncInventory,
  onOpenCaptureWizard,
}: Props) {
  const [captureMsg, setCaptureMsg] = useState<string | null>(null)
  const isLinux =
    inventory?.platform === 'linux' ||
    (typeof navigator !== 'undefined' && /linux/i.test(navigator.userAgent))

  const rows = useMemo((): Row[] => {
    if (!isLinux) return []
    const list: Row[] = [
      {
        label: 'EE.log',
        state: settings.eeLogPath ? 'ok' : 'warn',
        detail: settings.eeLogPath ? 'Bound' : 'not found',
        fix: onDetectEeLog,
        fixLabel: 'Detect',
      },
      {
        label: 'Proton prefix',
        state: inventory?.protonPlay ? 'ok' : 'warn',
        detail: inventory?.protonPlay ? 'Warframe compatdata found' : 'launch Warframe via Steam once',
      },
      {
        label: 'Inventory',
        state: inventory?.loaded ? (inventory.stale ? 'warn' : 'ok') : 'off',
        detail: inventory?.loaded
          ? inventory.stale
            ? 'stale — sync while logged in'
            : 'synced'
          : inventory?.consent
            ? 'not synced'
            : 'consent needed',
        fix: inventory?.consent ? onSyncInventory : undefined,
        fixLabel: 'Sync',
      },
      {
        label: 'Screen capture',
        state: settings.onboarding.linuxCaptureAck ? 'ok' : 'warn',
        detail: settings.onboarding.linuxCaptureAck
          ? captureMsg || 'wizard acknowledged'
          : 'PipeWire share not set up',
        fix: onOpenCaptureWizard,
        fixLabel: 'Wizard',
      },
    ]
    return list
  }, [
    isLinux,
    settings.eeLogPath,
    settings.onboarding.linuxCaptureAck,
    inventory,
    captureMsg,
    onDetectEeLog,
    onSyncInventory,
    onOpenCaptureWizard,
  ])

  if (!isLinux || !rows.length) return null

  const testCapture = async () => {
    const res = await window.voidlens?.testScreenCapture?.()
    const msg = res?.message || (res?.ok ? 'Capture OK' : 'Capture failed')
    setCaptureMsg(msg)
    pushToast(msg, res?.ok ? 'ok' : 'warn')
  }

  return (
    <section className="linux-health" aria-label="Linux health">
      <div className="linux-health__head">
        <h3 className="linux-health__title">Linux health</h3>
        <button type="button" className="btn ghost" onClick={() => void testCapture()}>
          Test capture
        </button>
      </div>
      <ul className="linux-health__list">
        {rows.map((r) => (
          <li key={r.label} className={`linux-health__row is-${r.state}`}>
            <span className="linux-health__dot" data-state={r.state} />
            <span className="linux-health__label">{r.label}</span>
            <span className="linux-health__detail">{r.detail}</span>
            {r.fix ? (
              <button type="button" className="btn ghost linux-health__fix" onClick={r.fix}>
                {r.fixLabel || 'Fix'}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
