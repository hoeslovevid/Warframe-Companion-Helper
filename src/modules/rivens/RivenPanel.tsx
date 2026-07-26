import { rivenStripLayout } from '../../../shared/captureGeometry'
import { RivenRoll, RivenScanState } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useRivenScan } from '../../hooks/useRivenScan'
import { formatRivenStatValue } from '../../lib/rivenFormat'
import '../cycles/module.css'
import './rivens.css'

type Props = {
  opacity?: number
  compact?: boolean
  previewMode?: boolean
  previewState?: RivenScanState
  scanHotkey?: string
  dismissHotkey?: string
  /** Display width used to size the overlay strip (Layout preview / live overlay). */
  layoutWidth?: number
  layoutHeight?: number
}

function stripSize(layoutWidth?: number, layoutHeight?: number) {
  const w =
    layoutWidth && layoutWidth > 0
      ? layoutWidth
      : typeof window !== 'undefined'
        ? window.innerWidth || 1920
        : 1920
  const h =
    layoutHeight && layoutHeight > 0
      ? layoutHeight
      : typeof window !== 'undefined'
        ? window.innerHeight || Math.round((w * 9) / 16)
        : Math.round((w * 9) / 16)
  const layout = rivenStripLayout(w, h)
  return { width: layout.width }
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
      {roll.platinum != null ? (
        <div
          className="riven-card__plat"
          title={
            roll.marketMatch === 'exact'
              ? `Median buyout for matching listings (${roll.marketVolume ?? 0} on warframe.market)`
              : roll.marketMatch === 'stats'
                ? `Median buyout for similar stat listings (${roll.marketVolume ?? 0} on warframe.market)`
                : `Loose market estimate (${roll.marketVolume ?? 0} listings on warframe.market)`
          }
        >
          ~{roll.platinum}p
          {roll.marketVolume != null ? (
            <span className="riven-card__plat-vol">{roll.marketVolume} listings</span>
          ) : null}
        </div>
      ) : null}
      {roll.prefsMatched ? (
        <div className="riven-card__prefs" title={roll.prefsNotes || 'Sheet preferences'}>
          sheet prefs
        </div>
      ) : null}
      <ul className="riven-stats">
        {roll.stats.map((s) => (
          <li key={`${s.name}-${s.value}`} className={s.desirable ? 'is-good' : 'is-bad'}>
            <span>{s.name}</span>
            <span>
              {formatRivenStatValue(s)}
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
  layoutWidth,
  layoutHeight,
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
  const strip = stripSize(layoutWidth, layoutHeight)

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
      <div className="riven-strip" style={{ opacity, width: strip.width }} data-riven-strip>
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
