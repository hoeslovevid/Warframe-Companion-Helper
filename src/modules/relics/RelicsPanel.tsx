import { RewardEval } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useRelicScan } from '../../hooks/useRelicScan'
import '../cycles/module.css'
import '../baro/baro.css'
import './relics.css'

type Props = {
  opacity?: number
  compact?: boolean
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

export function RelicsPanel({ opacity, compact }: Props) {
  const { state, scan, clear } = useRelicScan()

  return (
    <Panel
      title="Relic Rewards"
      subtitle={
        state.scanning
          ? 'Scanning reward screen…'
          : state.rewards.length
            ? `${state.rewards.length} rewards · ${state.trigger}`
            : 'Waiting for reward screen'
      }
      opacity={opacity}
      className={compact ? undefined : 'baro-panel--wide'}
      actions={
        compact ? undefined : (
          <>
            <button className="btn primary" disabled={state.scanning} onClick={() => void scan()}>
              Scan now
            </button>
            <button className="btn ghost" disabled={!state.rewards.length} onClick={() => void clear()}>
              Clear
            </button>
          </>
        )
      }
    >
      <div className="mod-stack">
        {!state.inventoryLoaded ? (
          <p className="mod-empty">
            Sync inventory in Settings for accurate owned counts. You can still scan rewards without
            it.
          </p>
        ) : null}

        {state.error ? <p className="mod-empty">Error: {state.error}</p> : null}

        {state.rewards.length === 0 && !state.scanning ? (
          <div className="mod-stack">
            <p className="mod-empty">
              At the fissure reward pick screen, press <strong>Alt+Shift+F</strong> (or your Scan
              Relics hotkey). Auto-detect also watches EE.log for “Got rewards”.
            </p>
            <ul className="mod-bullets">
              <li>Shows set name and part</li>
              <li>Owned count from your inventory</li>
              <li>Highlights parts you still need</li>
            </ul>
            {!compact ? (
              <button className="btn" disabled={state.scanning} onClick={() => void scan()}>
                Scan reward screen
              </button>
            ) : null}
          </div>
        ) : (
          <ul className={`relic-grid ${compact ? 'is-compact' : ''}`}>
            {state.rewards.map((reward) => (
              <RewardCard key={reward.slot} reward={reward} compact={compact} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  )
}
