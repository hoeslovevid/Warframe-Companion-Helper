import { useState } from 'react'
import type { AppSettings, MarketRivenStockItem } from '../../../shared/types'
import { EmptyState } from '../../components/EmptyState'
import { Panel } from '../../components/Panel'
import { copyText } from '../../lib/tradeClipboard'

type Props = {
  settings: AppSettings
  onUpdate: (partial: Partial<AppSettings>) => void
}

export function MarketRivenStockPanel({ settings, onUpdate }: Props) {
  const stock = settings.marketRivenStock || []
  const [weapon, setWeapon] = useState('')
  const [minPlat, setMinPlat] = useState('100')
  const [polarity, setPolarity] = useState('')
  const [copied, setCopied] = useState<string | null>(null)

  const add = () => {
    const w = weapon.trim()
    const minPlatinum = Math.max(1, Math.floor(Number(minPlat) || 1))
    if (!w) return
    const item: MarketRivenStockItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      weapon: w,
      minPlatinum,
      polarity: polarity.trim() || undefined,
      addedAt: new Date().toISOString(),
    }
    onUpdate({ marketRivenStock: [item, ...stock] })
    setWeapon('')
  }

  const remove = (id: string) => {
    onUpdate({ marketRivenStock: stock.filter((s) => s.id !== id) })
  }

  const setMin = (id: string, value: number) => {
    onUpdate({
      marketRivenStock: stock.map((s) =>
        s.id === id ? { ...s, minPlatinum: Math.max(1, Math.floor(value) || 1) } : s,
      ),
    })
  }

  const whisper = async (item: MarketRivenStockItem) => {
    const pol = item.polarity ? ` ${item.polarity}` : ''
    const text = `WFW WTS [${item.weapon} Riven]${pol} ${item.minPlatinum}p+`
    if (!(await copyText(text))) return
    setCopied(item.id)
    window.setTimeout(() => setCopied(null), 1400)
  }

  return (
    <Panel title="Riven stock" subtitle="Manual sell queue · min price + WTS whisper">
      <div className="market-create market-create--panel">
        <div className="market-create-row">
          <input
            value={weapon}
            placeholder="Weapon (e.g. Kuva Bramma)"
            onChange={(e) => setWeapon(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
          />
          <input
            value={polarity}
            placeholder="Polarity"
            onChange={(e) => setPolarity(e.target.value)}
            style={{ maxWidth: 100 }}
          />
          <input
            type="number"
            min={1}
            value={minPlat}
            onChange={(e) => setMinPlat(e.target.value)}
            style={{ maxWidth: 88 }}
            aria-label="Min platinum"
          />
          <button className="btn primary" type="button" onClick={add}>
            Add
          </button>
        </div>
      </div>
      {stock.length === 0 ? (
        <EmptyState
          title="No rivens queued"
          body="Add weapons you want to sell. Use Whisper for a WTS line, or open Contracts to list."
        />
      ) : (
        <ul className="market-card-list">
          {stock.map((s) => (
            <li key={s.id} className="market-card">
              <div className="market-card__body">
                <div className="market-card__title">
                  <strong>{s.weapon}</strong>
                  {s.polarity ? <span className="market-chip market-chip--riven">{s.polarity}</span> : null}
                </div>
                <div className="market-card__meta muted">
                  <label className="market-min-label">
                    Min
                    <input
                      type="number"
                      min={1}
                      className="market-min-input"
                      value={s.minPlatinum}
                      onChange={(e) => setMin(s.id, Number(e.target.value))}
                    />
                  </label>
                </div>
              </div>
              <div className="market-actions">
                <button className="btn ghost" type="button" onClick={() => void whisper(s)}>
                  {copied === s.id ? 'Copied' : 'Whisper'}
                </button>
                <button className="btn ghost" type="button" onClick={() => remove(s.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
