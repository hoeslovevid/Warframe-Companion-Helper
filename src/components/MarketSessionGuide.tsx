import { useState } from 'react'
import './market-session.css'

type StepId = 'stock' | 'list' | 'whisper' | 'sold' | 'log'

const STEPS: Array<{ id: StepId; title: string; body: string; tab: string }> = [
  {
    id: 'stock',
    title: '1 · Stock',
    body: 'Review inventory extras vs open listings.',
    tab: 'stock',
  },
  {
    id: 'list',
    title: '2 · List',
    body: 'Use listing assistant (floor − 1) or bulk list top extras.',
    tab: 'stock',
  },
  {
    id: 'whisper',
    title: '3 · Whisper',
    body: 'Copy trade whispers from Orders when buyers appear.',
    tab: 'orders',
  },
  {
    id: 'sold',
    title: '4 · Mark sold',
    body: 'Log Sold/Bought so P&L stays honest.',
    tab: 'log',
  },
  {
    id: 'log',
    title: '5 · Review',
    body: 'Check the trade log and reprice stale orders.',
    tab: 'log',
  },
]

type Props = {
  onGoTab: (tab: string) => void
  dismissed: boolean
  onDismiss: () => void
}

export function MarketSessionGuide({ onGoTab, dismissed, onDismiss }: Props) {
  const [step, setStep] = useState(0)
  if (dismissed) return null
  const current = STEPS[step]

  return (
    <section className="market-session" aria-label="Market session guide">
      <div className="market-session__head">
        <div>
          <h3 className="market-session__title">Market session</h3>
          <p className="market-session__sub">
            Stock → list → whisper → log — one path for a trading sitting.
          </p>
        </div>
        <button type="button" className="btn ghost" onClick={onDismiss}>
          Hide
        </button>
      </div>
      <ol className="market-session__steps">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              className={`market-session__step ${i === step ? 'is-active' : ''} ${
                i < step ? 'is-done' : ''
              }`}
              onClick={() => {
                setStep(i)
                onGoTab(s.tab)
              }}
            >
              {s.title}
            </button>
          </li>
        ))}
      </ol>
      <p className="market-session__body">{current.body}</p>
      <div className="market-session__actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            onGoTab(current.tab)
            if (step < STEPS.length - 1) setStep(step + 1)
          }}
        >
          {step < STEPS.length - 1 ? 'Do this step' : 'Open trade log'}
        </button>
        {step > 0 ? (
          <button type="button" className="btn ghost" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : null}
      </div>
    </section>
  )
}
