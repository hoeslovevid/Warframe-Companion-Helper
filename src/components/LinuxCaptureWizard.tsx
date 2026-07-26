import { useState } from 'react'
import { AppSettings, DisplayChoice } from '../../shared/types'
import { Panel } from './Panel'
import './onboarding.css'

type Props = {
  settings: AppSettings
  displays: DisplayChoice[]
  onUpdate: (partial: Partial<AppSettings>) => void
  /** Compact embed for Settings; full card for dashboard. */
  compact?: boolean
}

export function LinuxCaptureWizard({ settings, displays, onUpdate, compact }: Props) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const ob = settings.onboarding

  const runTest = async () => {
    setTesting(true)
    setResult(null)
    try {
      const res = await window.voidlens.testScreenCapture()
      setResult(res.message)
      if (res.ok) {
        onUpdate({ onboarding: { ...ob, linuxCaptureAck: true } })
      }
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Capture test failed')
    } finally {
      setTesting(false)
    }
  }

  const body = (
    <div className="linux-wizard">
      <ol className="linux-wizard__steps">
        <li>
          Set Warframe to <strong>Borderless Windowed</strong> on the monitor you play on.
        </li>
        <li>
          Choose that monitor below (Game / OCR monitor). Remember its id for the share dialog.
        </li>
        <li>
          Click <strong>Authorize capture</strong> — pick the <em>same</em> Warframe screen in the
          portal dialog and leave sharing on.
        </li>
        <li>Keep the share active while you run relic / riven OCR.</li>
      </ol>

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="linux-ocr-display">Game / OCR monitor</label>
        <select
          id="linux-ocr-display"
          value={settings.ocrDisplayId == null ? 'primary' : String(settings.ocrDisplayId)}
          onChange={(e) => {
            const v = e.target.value
            onUpdate({ ocrDisplayId: v === 'primary' ? null : Number(v) })
          }}
        >
          <option value="primary">Primary display (default)</option>
          {displays.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.label}
              {d.isPrimary ? ' · primary' : ''} — {d.width}×{d.height} (id {d.id})
            </option>
          ))}
        </select>
      </div>

      <div className="linux-wizard__actions">
        <button className="btn primary" disabled={testing} onClick={() => void runTest()}>
          {testing ? 'Waiting for portal…' : 'Authorize capture'}
        </button>
        {!ob.linuxCaptureAck ? (
          <button
            className="btn ghost"
            onClick={() => onUpdate({ onboarding: { ...ob, linuxCaptureAck: true } })}
          >
            Skip for now
          </button>
        ) : null}
      </div>
      {result ? <p className={result.toLowerCase().includes('ok') || result.toLowerCase().includes('ready') ? 'linux-wizard__ok' : 'linux-wizard__err'}>{result}</p> : null}
    </div>
  )

  if (compact) {
    return (
      <Panel
        title="Linux screen capture"
        subtitle={
          ob.linuxCaptureAck
            ? 'Authorized — re-run if OCR captures the wrong screen'
            : 'Required once for relic / riven OCR'
        }
      >
        {body}
      </Panel>
    )
  }

  return (
    <section className="getting-started linux-wizard-card" data-tour="linux-capture">
      <div className="getting-started__header">
        <div>
          <h3 className="getting-started__title">Linux capture setup</h3>
          <p className="getting-started__sub">
            PipeWire screen share — pick Warframe’s monitor once, then OCR can reuse the stream.
          </p>
        </div>
        {ob.linuxCaptureAck ? <span className="muted">Done</span> : null}
      </div>
      {body}
    </section>
  )
}
