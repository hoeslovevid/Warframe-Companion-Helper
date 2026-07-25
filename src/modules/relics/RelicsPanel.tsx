import { RewardEval } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useRelicScan } from '../../hooks/useRelicScan'
import '../cycles/module.css'
import '../baro/baro.css'
import './relics.css'

/** Design-space strip width at 1920px wide (~under four reward cards). */
const STRIP_DESIGN_WIDTH = 1100
const STRIP_DESIGN_REF = 1920

type Props = {
  opacity?: number
  compact?: boolean
  /** When set (Layout preview), skip live scan state and show these rewards. */
  previewMode?: boolean
  previewRewards?: RewardEval[]
  /** Pretty hotkey label for empty-state CTA copy */
  scanHotkey?: string
  /** Preview canvas / monitor width — scales the horizontal strip. */
  layoutWidth?: number
}

function stripWidthPx(layoutWidth?: number) {
  const ref = layoutWidth && layoutWidth > 0 ? layoutWidth : window.innerWidth || STRIP_DESIGN_REF
  return Math.round(ref * (STRIP_DESIGN_WIDTH / STRIP_DESIGN_REF))
}

function ownershipLabel(reward: RewardEval, compact?: boolean) {
  if (!reward.setName) {
    return reward.owned > 0 ? `Owned ×${reward.owned}` : 'Unmatched'
  }
  if (reward.owned <= 0) return compact ? 'Needed' : 'Needed for set'
  if (reward.setTotalParts > 0 && reward.setOwnedParts >= reward.setTotalParts) {
    return compact ? 'Complete' : `Owned ×${reward.owned} · Set complete`
  }
  return `Owned ×${reward.owned}`
}

function RewardCard({ reward, compact }: { reward: RewardEval; compact?: boolean }) {
  const needed = reward.needed
  return (
    <li className={`relic-card ${needed ? 'is-needed' : ''}`}>
      {!compact ? <div className="relic-card__slot">Slot {reward.slot + 1}</div> : null}
      <div className="relic-card__name">{reward.name || 'Unknown'}</div>
      {reward.setName ? (
        <div className="relic-card__set">
          {reward.setName}
          {!compact && reward.partName ? ` · ${reward.partName}` : ''}
        </div>
      ) : (
        <div className="relic-card__set">{compact ? '—' : 'Non-set / unmatched'}</div>
      )}
      <div className={`relic-card__owned ${needed ? 'is-needed' : ''}`}>
        {ownershipLabel(reward, compact)}
      </div>
      {!compact && reward.setTotalParts > 0 ? (
        <div className="relic-card__progress">
          Set parts owned {reward.setOwnedParts}/{reward.setTotalParts}
        </div>
      ) : null}
      {!compact && reward.setParts.length > 0 ? (
        <ul className="relic-card__parts">
          {reward.setParts.map((p) => (
            <li key={p.itemName}>
              <span>{p.partName}</span>
              <span className={p.owned > 0 ? 'has' : 'miss'}>×{p.owned}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {reward.ducats != null ? (
        <div className="relic-card__meta">{reward.ducats} ducats</div>
      ) : null}
    </li>
  )
}

function RewardRow({
  rewards,
  compact,
}: {
  rewards: RewardEval[]
  compact?: boolean
}) {
  return (
    <ul className={`relic-grid ${compact ? 'is-strip' : 'is-dashboard'}`}>
      {rewards.map((reward) => (
        <RewardCard key={reward.slot} reward={reward} compact={compact} />
      ))}
    </ul>
  )
}

export function RelicsPanel({
  opacity = 0.92,
  compact,
  previewMode,
  previewRewards,
  scanHotkey = 'Alt+Shift+F',
  layoutWidth,
}: Props) {
  const { state, scan, clear } = useRelicScan()
  const rewards = previewMode && previewRewards ? previewRewards : state.rewards
  const scanning = previewMode ? false : state.scanning
  const stripW = stripWidthPx(layoutWidth)

  // Overlay / Layout: horizontal strip meant to sit under the four reward cards
  if (compact || previewMode) {
    return (
      <div
        className="relic-strip"
        style={{ opacity, width: stripW }}
        data-relic-strip
      >
        {scanning ? <p className="relic-strip__status">Scanning reward screen…</p> : null}
        {!previewMode && state.error ? (
          <p className="relic-strip__error">{state.error}</p>
        ) : null}
        {rewards.length > 0 ? (
          <RewardRow rewards={rewards} compact />
        ) : scanning ? null : (
          <p className="relic-strip__status">Waiting for reward screen</p>
        )}
      </div>
    )
  }

  return (
    <Panel
      title="Relic Rewards"
      subtitle={
        scanning
          ? 'Scanning reward screen…'
          : rewards.length
            ? `${rewards.length} rewards · ${state.trigger}`
            : 'Waiting for reward screen'
      }
      opacity={opacity}
      className="baro-panel--wide"
      actions={
        <>
          <button className="btn primary" disabled={scanning} onClick={() => void scan()}>
            Scan now
          </button>
          <button className="btn ghost" disabled={!rewards.length} onClick={() => void clear()}>
            Clear
          </button>
        </>
      }
    >
      <div className="mod-stack">
        {!state.inventoryLoaded ? (
          <p className="mod-empty">
            Sync inventory in Settings for “needed for set” tags. Scanning still works without it.
          </p>
        ) : null}

        {state.error ? <p className="mod-empty">Error: {state.error}</p> : null}

        {rewards.length === 0 && !scanning ? (
          <div className="mod-stack">
            <p className="mod-empty">
              Overlay popup is a horizontal strip under the four reward cards. Place it in{' '}
              <strong>Layout</strong>. Auto-detect via EE.log, or press <strong>{scanHotkey}</strong>.
            </p>
            <button className="btn primary" disabled={scanning} onClick={() => void scan()}>
              Scan reward screen
            </button>
          </div>
        ) : (
          <RewardRow rewards={rewards} />
        )}
      </div>
    </Panel>
  )
}
