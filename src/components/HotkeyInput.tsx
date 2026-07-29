import { useEffect, useId, useRef, useState } from 'react'
import { eventToAccelerator, prettyHotkey } from '../lib/hotkey'
import './HotkeyInput.css'

type Props = {
  id?: string
  value: string
  onChange: (next: string) => void
  /** Allow clearing to an empty binding (optional hotkeys). */
  allowClear?: boolean
  placeholder?: string
}

export function HotkeyInput({
  id,
  value,
  onChange,
  allowClear = false,
  placeholder = 'Click, then press keys',
}: Props) {
  const autoId = useId()
  const inputId = id || autoId
  const [recording, setRecording] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!recording) return

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (e.key === 'Escape') {
        setRecording(false)
        btnRef.current?.blur()
        return
      }

      if (allowClear && (e.key === 'Backspace' || e.key === 'Delete')) {
        onChangeRef.current('')
        setRecording(false)
        btnRef.current?.blur()
        return
      }

      const accel = eventToAccelerator(e)
      if (!accel) return

      onChangeRef.current(accel)
      setRecording(false)
      btnRef.current?.blur()
    }

    const onBlur = () => setRecording(false)

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [recording, allowClear])

  const label = recording
    ? allowClear
      ? 'Press keys… (Esc cancel · Backspace clear)'
      : 'Press keys… (Esc to cancel)'
    : value.trim()
      ? prettyHotkey(value)
      : placeholder

  return (
    <div className={`hotkey-input ${recording ? 'is-recording' : ''}`}>
      <button
        ref={btnRef}
        id={inputId}
        type="button"
        className="hotkey-input__btn"
        aria-pressed={recording}
        aria-label={recording ? 'Recording hotkey' : `Hotkey ${label}. Click to change.`}
        onClick={() => setRecording(true)}
      >
        <kbd className="hotkey-input__kbd">{label}</kbd>
      </button>
      {allowClear && value.trim() ? (
        <button
          type="button"
          className="btn ghost hotkey-input__clear"
          onClick={() => {
            onChange('')
            setRecording(false)
          }}
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}
