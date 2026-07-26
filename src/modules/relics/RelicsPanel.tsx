import { relicStripLayout } from '../../../shared/captureGeometry'
import { RewardEval } from '../../../shared/types'
import { Panel } from '../../components/Panel'
import { useRelicScan } from '../../hooks/useRelicScan'
import '../cycles/module.css'
import '../baro/baro.css'
import './relics.css'

type Props = {
  opacity?: number
  compact?: boolean
  previewMode?: boolean
  previewRewards?: RewardEval[]
  scanHotkey?: string
  dismissHotkey?: string
  layoutWidth?: number
}

function stripWidthPx(layoutWidth?: number) {
  const ref =
    layoutWidth && layoutWidth > 0
      ? layoutWidth
      : typeof window !== 'undefined'
        ? window.innerWidth || 1920
        : 1920
  return relicStripLayout(ref, Math.round((ref * 9) / 16)).width
}

function ownershipLabel(reward: RewardEval, compact?: boolean) {
  if (!reward.setName) {
    return reward.owned > 0 ? `Owned ×${reward.owned}` : 'Unmatched'
  }
  if (reward.owned <= 0) {
    if (compact && reward.setTotalParts > 0) {
      return `Needed · ${reward.setOwnedParts}/${reward.setTotalParts}`
    }
    return compact ? 'Needed' : 'Needed for set'
  }
  if (reward.setTotalParts > 0 && reward.setOwnedParts >= reward.setTotalParts) {
    return compact ? 'Complete' : `Owned ×${reward.owned} · Set complete`
  }
  if (compact && reward.setTotalParts > 0) {
    return `Owned ×${reward.owned} · ${reward.setOwnedParts}/${reward.setTotalParts}`
  }
  return `Owned ×${reward.owned}`
}

function RewardCard({ reward, compact }: { reward: RewardEval; compact?: boolean }) {
  const needed = reward.needed
  const lowConf = reward.matchScore > 0 && reward.matchScore < 0.55
  const priceBits: string[] = []
  if (reward.platinum != null) {
    priceBits.push(`~${reward.platinum}p`)
    if (reward.volume != null) priceBits.push(`${reward.volume} sells`)
  }
  if (reward.ducats != null) priceBits.push(`${reward.ducats}d`)
  return (
    <li
      className={`relic-card ${needed ? 'is-needed' : ''} ${reward.bestPick ? 'is-best' : ''} ${
        lowConf ? 'is-low-conf' : ''
      }`}
    >
      {reward.bestPick ? <div className="relic-card__badge">Best</div> : null}
      {!compact ? <div className="relic-card__slot">Slot {reward.slot + 1}</div> : null}
      <div className="relic-card__name">{reward.name || 'Unknown'}</div>
      {reward.setName ? (
        <div className="relic-card__set">
          {reward.setName}
          {reward.partName ? ` · ${reward.partName}` : ''}
        </div>
      ) : (
        <div className="relic-card__set">{compact ? '—' : 'Non-set / unmatched'}</div>
      )}
      <div className={`relic-card__owned ${needed ? 'is-needed' : ''}`}>
        {ownershipLabel(reward, compact)}
      </div>
      {priceBits.length ? <div className="relic-card__meta">{priceBits.join(' · ')}</div> : null}
      {lowConf ? <div className="relic-card__meta">Low OCR confidence</div> : null}
      {!compact && reward.setTotalParts > 0 ? (
        <div className="relic-card__progress">
          Set parts owned {reward.setOwnedParts}/{reward.setTotalParts}
        </div>
      ) : null}
    </li>
  )
}

function RewardRow({ rewards, compact }: { rewards: RewardEval[]; compact?: boolean }) {
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
  dismissHotkey = 'Alt+Shift+D',
  layoutWidth,
}: Props) {
  const { state, scan, clear } = useRelicScan()
  const rewards = previewMode && previewRewards ? previewRewards : state.rewards
  const scanning = previewMode ? false : state.scanning
  const stripW = stripWidthPx(layoutWidth)

  if (compact || previewMode) {
    return (
      <div className="relic-strip" style={{ opacity, width: stripW }} data-relic-strip>
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
            ? `${rewards.length} rewards · market prices`
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
              Popup appears on fissure reward detect. Scan: <strong>{scanHotkey}</strong> · Dismiss:{' '}
              <strong>{dismissHotkey}</strong>. Place the strip in Layout.
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
