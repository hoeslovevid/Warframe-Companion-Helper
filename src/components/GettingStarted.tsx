import { AppSettings } from '../../shared/types'
import { prettyHotkey } from '../lib/hotkey'
import './onboarding.css'

type Props = {
  settings: AppSettings
  onUpdate: (partial: Partial<AppSettings>) => void
  onGoModules: () => void
  onGoLayout: () => void
  onGoInventory: () => void
  onStartTour: () => void
}

export function GettingStarted({
  settings,
  onUpdate,
  onGoModules,
  onGoLayout,
  onGoInventory,
  onStartTour,
}: Props) {
  const ob = settings.onboarding
  if (ob.checklistDismissed) return null

  const steps = [
    {
      key: 'borderlessAck' as const,
      label: 'Warframe is in Borderless Windowed',
      done: ob.borderlessAck,
      actionLabel: 'Done',
      onAction: () =>
        onUpdate({ onboarding: { ...ob, borderlessAck: true } }),
    },
    {
      key: 'modulesTouched' as const,
      label: 'Pick which modules to show',
      done: ob.modulesTouched,
      actionLabel: 'Open Modules',
      onAction: onGoModules,
    },
    {
      key: 'layoutVisited' as const,
      label: 'Arrange your overlay layout',
      done: ob.layoutVisited,
      actionLabel: 'Open Layout',
      onAction: onGoLayout,
    },
    {
      key: 'inventoryTouched' as const,
      label: 'Optional: sync inventory for relic tags',
      done: ob.inventoryTouched,
      actionLabel: 'Open Inventory',
      onAction: onGoInventory,
    },
  ]

  const doneCount = steps.filter((s) => s.done).length
  const allDone = doneCount === steps.length

  return (
    <section className="getting-started" data-tour="getting-started">
      <div className="getting-started__header">
        <div>
          <h3 className="getting-started__title">Getting started</h3>
          <p className="getting-started__sub">
            {allDone
              ? 'You’re set. Dismiss this checklist anytime.'
              : `${doneCount}/${steps.length} complete · unlock drag with ${prettyHotkey(settings.hotkeys.editLayout)}`}
          </p>
        </div>
        <button
          className="btn ghost"
          onClick={() => onUpdate({ onboarding: { ...ob, checklistDismissed: true } })}
        >
          Dismiss
        </button>
      </div>

      <ul className="getting-started__list">
        {steps.map((step) => (
          <li key={step.key} className={`getting-started__item ${step.done ? 'is-done' : ''}`}>
            <span className="getting-started__check" aria-hidden>
              ✓
            </span>
            <p className="getting-started__label">{step.label}</p>
            {step.done ? (
              <span className="muted">Done</span>
            ) : (
              <button className="btn ghost" onClick={step.onAction}>
                {step.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="getting-started__actions">
        <button className="btn primary" onClick={onStartTour} data-tour="start-tour">
          {ob.tourCompleted ? 'Replay quick tour' : 'Start quick tour'}
        </button>
        {allDone ? (
          <button
            className="btn"
            onClick={() => onUpdate({ onboarding: { ...ob, checklistDismissed: true } })}
          >
            Finish checklist
          </button>
        ) : null}
      </div>
    </section>
  )
}
