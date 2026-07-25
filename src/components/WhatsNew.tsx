import { getWhatsNewBullets } from '../lib/whatsNew'
import './onboarding.css'

type Props = {
  version: string
  open: boolean
  onDismiss: () => void
}

export function WhatsNew({ version, open, onDismiss }: Props) {
  if (!open) return null
  const bullets = getWhatsNewBullets(version)
  return (
    <div className="hotkey-sheet-backdrop" onClick={onDismiss} role="presentation">
      <div className="hotkey-sheet" role="dialog" aria-label="What's new" onClick={(e) => e.stopPropagation()}>
        <h3>What’s new in {version}</h3>
        <ul className="hotkey-sheet__list">
          {bullets.map((b) => (
            <li key={b}>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <div style={{ marginTop: 14, textAlign: 'right' }}>
          <button className="btn primary" onClick={onDismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
