import { useEffect, useMemo, useState } from 'react'
import './command-palette.css'

export type CommandAction = {
  id: string
  label: string
  hint?: string
  group?: string
  keywords?: string
  run: () => void
}

type Props = {
  open: boolean
  onClose: () => void
  actions: CommandAction[]
}

export function CommandPalette({ open, onClose, actions }: Props) {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!open) return
    setQ('')
    setIdx(0)
  }, [open])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return actions
    return actions.filter((a) => {
      const hay = `${a.label} ${a.hint || ''} ${a.group || ''} ${a.keywords || ''}`.toLowerCase()
      return hay.includes(needle)
    })
  }, [actions, q])

  useEffect(() => {
    setIdx(0)
  }, [q])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIdx((i) => Math.max(0, i - 1))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const hit = filtered[idx]
        if (hit) {
          onClose()
          hit.run()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, idx, onClose])

  if (!open) return null

  return (
    <div className="cmd-palette-backdrop" role="presentation" onClick={onClose}>
      <div
        className="cmd-palette"
        role="dialog"
        aria-label="Jump to"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          className="cmd-palette__input"
          autoFocus
          placeholder="Jump to tab, action, or setting…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="cmd-palette__list">
          {filtered.length === 0 ? (
            <li className="cmd-palette__empty">No matches</li>
          ) : (
            filtered.slice(0, 40).map((a, i) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={`cmd-palette__item ${i === idx ? 'is-active' : ''}`}
                  onMouseEnter={() => setIdx(i)}
                  onClick={() => {
                    onClose()
                    a.run()
                  }}
                >
                  <span className="cmd-palette__label">{a.label}</span>
                  {a.group || a.hint ? (
                    <span className="cmd-palette__hint">{a.group || a.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="cmd-palette__foot">↑↓ navigate · Enter run · Esc close · Ctrl+K</p>
      </div>
    </div>
  )
}
