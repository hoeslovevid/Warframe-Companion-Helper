import { RivenRoll, RivenScanState } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useRivenScan } from '../../hooks/useRivenScan'
import '../cycles/module.css'
import './rivens.css'

type Props = {
  opacity?: number
  compact?: boolean
  previewMode?: boolean
  previewState?: RivenScanState
  scanHotkey?: string
  dismissHotkey?: string
}

function RollCard({
  roll,
  label,
  winner,
}: {
  roll: RivenRoll
  label: string
  winner?: boolean
}) {
  return (
    <div className={`riven-card ${winner ? 'is-winner' : ''}`}>
      <div className="riven-card__label">{label}</div>
      <div className="riven-card__weapon">{roll.weapon}</div>
      <div className={`riven-card__tier is-${roll.tier}`}>
        {roll.tier}
        <span>{roll.score}/100</span>
      </div>
      <ul className="riven-stats">
        {roll.stats.map((s) => (
          <li key={`${s.name}-${s.value}`} className={s.desirable ? 'is-good' : 'is-bad'}>
            <span>{s.name}</span>
            <span>
              {s.negative || s.value < 0 ? '-' : '+'}
              {Math.abs(s.value)}
              {s.unit === '%' ? '%' : ''}
              <span style={{ opacity: 0.65, marginLeft: 6 }}>{Math.round(s.quality)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function recoText(rec: RivenScanState['recommendation']) {
  if (rec === 'take') return 'Take the new roll'
  if (rec === 'keep') return 'Keep the current roll'
  if (rec === 'similar') return 'Similar quality — either is fine'
  return null
}

export function RivenPanel({
  opacity = 0.92,
  compact,
  previewMode,
  previewState,
  scanHotkey = 'Alt+Shift+G',
  dismissHotkey = 'Alt+Shift+H',
}: Props) {
  const { state: live, scan, clear } = useRivenScan()
  const state = previewMode && previewState ? previewState : live
  const scanning = previewMode ? false : state.scanning
  const current = state.current
  const reroll = state.reroll
  const reco = recoText(state.recommendation)
  const winnerSide =
    state.recommendation === 'take'
      ? 'reroll'
      : state.recommendation === 'keep'
        ? 'current'
        : null

  const body = (
    <div className="mod-stack">
      {scanning ? <p className="riven-strip-status">Reading riven cards…</p> : null}
      {!previewMode && state.error ? <p className="mod-empty">Error: {state.error}</p> : null}

      {current || reroll ? (
        <>
          <div className="riven-compare">
            {current ? (
              <RollCard
                roll={current}
                label="Current"
                winner={winnerSide === 'current'}
              />
            ) : (
              <div className="riven-card">
                <p className="mod-empty">Current roll not read</p>
              </div>
            )}
            <div className="riven-vs">VS</div>
            {reroll ? (
              <RollCard roll={reroll} label="Reroll" winner={winnerSide === 'reroll'} />
            ) : (
              <div className="riven-card">
                <p className="mod-empty">Reroll not read yet</p>
              </div>
            )}
          </div>
          {reco ? <p className="riven-reco">{reco}</p> : null}
        </>
      ) : !scanning ? (
        <div className="mod-stack">
          <p className="mod-empty">
            On the Kuva Cycle screen (current vs new), press <strong>{scanHotkey}</strong>. EE.log
            may auto-detect. Dismiss: <strong>{dismissHotkey}</strong>.
          </p>
          {!compact && !previewMode ? (
            <button className="btn primary" onClick={() => void scan()}>
              Scan riven compare
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  if (compact || previewMode) {
    return (
      <div style={{ opacity }} data-riven-strip>
        {body}
      </div>
    )
  }

  return (
    <Panel
      title="Riven Grader"
      subtitle={
        scanning
          ? 'Scanning…'
          : current || reroll
            ? `${current?.weapon || reroll?.weapon || 'Riven'} · tier compare`
            : 'Waiting for Cycle screen'
      }
      opacity={opacity}
      actions={
        <>
          <button className="btn primary" disabled={scanning} onClick={() => void scan()}>
            Scan now
          </button>
          <button
            className="btn ghost"
            disabled={!current && !reroll}
            onClick={() => void clear()}
          >
            Clear
          </button>
        </>
      }
    >
      {body}
    </Panel>
  )
}
