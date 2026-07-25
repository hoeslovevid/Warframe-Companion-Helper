import { CSSProperties, useEffect, useLayoutEffect, useState } from 'react'
import './onboarding.css'

export type TourStep = {
  target: string
  title: string
  body: string
  /** Optional tab to open before measuring the target */
  tab?: string
}

type Props = {
  open: boolean
  steps: TourStep[]
  onTab?: (tab: string) => void
  onClose: (completed: boolean) => void
}

type Box = { top: number; left: number; width: number; height: number }

export function AppTour({ open, steps, onTab, onClose }: Props) {
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)

  useEffect(() => {
    if (!open) {
      setIndex(0)
      setBox(null)
    }
  }, [open])

  const step = steps[index]

  useLayoutEffect(() => {
    if (!open || !step) return

    let cancelled = false
    const run = async () => {
      if (step.tab && onTab) onTab(step.tab)
      // Wait a frame for tab content to mount
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      await new Promise((r) => setTimeout(r, 40))
      if (cancelled) return
      const el = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null
      if (!el) {
        setBox(null)
        return
      }
      const rect = el.getBoundingClientRect()
      setBox({
        top: Math.max(8, rect.top - 8),
        left: Math.max(8, rect.left - 8),
        width: Math.min(window.innerWidth - 16, rect.width + 16),
        height: Math.min(window.innerHeight - 16, rect.height + 16),
      })
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
    void run()
    const onResize = () => void run()
    window.addEventListener('resize', onResize)
    return () => {
      cancelled = true
      window.removeEventListener('resize', onResize)
    }
  }, [open, step, onTab, index])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(false)
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (index >= steps.length - 1) onClose(true)
        else setIndex((i) => i + 1)
      }
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, steps.length, onClose])

  if (!open || !step) return null

  const cardStyle = box
    ? {
        top: Math.min(box.top + box.height + 12, window.innerHeight - 200),
        left: Math.min(Math.max(16, box.left), window.innerWidth - 356),
      }
    : { top: '30%', left: '50%', transform: 'translateX(-50%)' }

  return (
    <div className="tour-root is-active" role="dialog" aria-modal="true" aria-label="App tour">
      {!box ? <div className="tour-scrim" onClick={() => onClose(false)} /> : null}
      {box ? (
        <div
          className="tour-spotlight"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
          }}
        />
      ) : null}
      <div className="tour-card" style={cardStyle as CSSProperties}>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-card__footer">
          <span className="tour-card__meta">
            {index + 1} / {steps.length}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={() => onClose(false)}>
              Skip
            </button>
            {index > 0 ? (
              <button className="btn ghost" onClick={() => setIndex((i) => i - 1)}>
                Back
              </button>
            ) : null}
            <button
              className="btn primary"
              onClick={() => {
                if (index >= steps.length - 1) onClose(true)
                else setIndex((i) => i + 1)
              }}
            >
              {index >= steps.length - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
