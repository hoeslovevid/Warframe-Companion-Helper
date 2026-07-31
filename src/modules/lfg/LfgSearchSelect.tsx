import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

export type LfgSearchOption = {
  id: string
  label: string
  /** Secondary line in the dropdown. */
  detail?: string
  /** Value written into the controlled input on select. */
  value: string
  /** Extra payload for parent handlers. */
  meta?: Record<string, unknown>
}

type Props = {
  label: string
  value: string
  options: LfgSearchOption[]
  placeholder?: string
  emptyHint?: string
  disabled?: boolean
  onChange: (value: string) => void
  onSelect?: (option: LfgSearchOption) => void
}

export function LfgSearchSelect({
  label,
  value,
  options,
  placeholder,
  emptyHint = 'No matches',
  disabled,
  onChange,
  onSelect,
}: Props) {
  const listId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [query, setQuery] = useState(value)

  useEffect(() => {
    setQuery(value)
  }, [value])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = !q
      ? options
      : options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) ||
            o.value.toLowerCase().includes(q) ||
            (o.detail || '').toLowerCase().includes(q),
        )
    return list.slice(0, 40)
  }, [options, query])

  useEffect(() => {
    setActive(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const pick = (option: LfgSearchOption) => {
    onChange(option.value)
    setQuery(option.value)
    onSelect?.(option)
    setOpen(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => Math.min(filtered.length - 1, i + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
      return
    }
    if (e.key === 'Enter' && open && filtered[active]) {
      e.preventDefault()
      pick(filtered[active])
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <label className="field lfg-search-select" ref={rootRef}>
      <span>{label}</span>
      <div className="lfg-search-select__wrap">
        <input
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            onChange(e.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
        {open ? (
          <ul id={listId} className="lfg-search-select__list" role="listbox">
            {filtered.length === 0 ? (
              <li className="lfg-search-select__empty">{emptyHint}</li>
            ) : (
              filtered.map((o, i) => (
                <li key={o.id} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    className={`lfg-search-select__option ${i === active ? 'is-active' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o)}
                  >
                    <span className="lfg-search-select__label">{o.label}</span>
                    {o.detail ? <span className="lfg-search-select__detail">{o.detail}</span> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </label>
  )
}
