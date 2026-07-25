import { RewardEval } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useRelicScan } from '../../hooks/useRelicScan'
import '../cycles/module.css'
import '../baro/baro.css'
import './relics.css'

type Props = {
  opacity?: number
  compact?: boolean
  /** When set (Layout preview), skip live scan state and show these rewards. */
  previewMode?: boolean
  previewRewards?: RewardEval[]
  /** Pretty hotkey label for empty-state CTA copy */
  scanHotkey?: string
}

function ownershipLabel(reward: RewardEval) {
  if (!reward.setName) {
    return reward.owned > 0 ? `Owned ×${reward.owned}` : 'Not in inventory'
  }
  if (reward.owned <= 0) return 'Needed for set'
  if (reward.setTotalParts > 0 && reward.setOwnedParts >= reward.setTotalParts) {
    return `Owned ×${reward.owned} · Set complete`
  }
  return `Owned ×${reward.owned}`
}

function RewardCard({ reward, compact }: { reward: RewardEval; compact?: boolean }) {
  const needed = reward.needed
  return (
    <li className={`relic-card ${needed ? 'is-needed' : ''}`}>
      <div className="relic-card__slot">Slot {reward.slot + 1}</div>
      <div className="relic-card__name">{reward.name || 'Unknown'}</div>
      {reward.setName ? (
        <div className="relic-card__set">
          {reward.setName}
          {reward.partName ? ` · ${reward.partName}` : ''}
        </div>
      ) : (
        <div className="relic-card__set">Non-set / unmatched</div>
      )}
      <div className={`relic-card__owned ${needed ? 'is-needed' : ''}`}>
        {ownershipLabel(reward)}
      </div>
      {reward.setTotalParts > 0 ? (
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

export function RelicsPanel({
  opacity,
  compact,
  previewMode,
  previewRewards,
  scanHotkey = 'Alt+Shift+F',
}: Props) {
  const { state, scan, clear } = useRelicScan()
  const rewards = previewMode && previewRewards ? previewRewards : state.rewards
  const scanning = previewMode ? false : state.scanning

  return (
    <Panel
      title="Relic Rewards"
      subtitle={
        previewMode
          ? 'Preview · sample rewards'
          : scanning
            ? 'Scanning reward screen…'
            : rewards.length
              ? `${rewards.length} rewards · ${state.trigger}`
              : 'Waiting for reward screen'
      }
      opacity={opacity}
      className={compact ? undefined : 'baro-panel--wide'}
      actions={
        compact || previewMode ? undefined : (
          <>
            <button className="btn primary" disabled={scanning} onClick={() => void scan()}>
              Scan now
            </button>
            <button className="btn ghost" disabled={!rewards.length} onClick={() => void clear()}>
              Clear
            </button>
          </>
        )
      }
    >
      <div className="mod-stack">
        {!previewMode && !state.inventoryLoaded ? (
          <p className="mod-empty">
            Sync inventory in Settings for “needed for set” tags. Scanning still works without it.
          </p>
        ) : null}

        {!previewMode && state.error ? <p className="mod-empty">Error: {state.error}</p> : null}

        {rewards.length === 0 && !scanning ? (
          <div className="mod-stack">
            <p className="mod-empty">
              Overlay popup appears automatically when EE.log reports a fissure reward screen.
              Manual scan: <strong>{scanHotkey}</strong>. Dismisses after you pick / ~45s.
            </p>
            {!compact && !previewMode ? (
              <button className="btn primary" disabled={scanning} onClick={() => void scan()}>
                Scan reward screen
              </button>
            ) : null}
          </div>
        ) : (
          <ul className={`relic-grid ${compact ? 'is-compact' : ''}`}>
            {rewards.map((reward) => (
              <RewardCard key={reward.slot} reward={reward} compact={compact} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
