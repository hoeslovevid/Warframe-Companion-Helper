import './ToggleRow.css'

type ToggleRowProps = {
  label: string
  description?: string
  checked: boolean
  disabled?: boolean
  badge?: string
  onChange: (next: boolean) => void
}

export function ToggleRow({
  label,
  description,
  checked,
  disabled,
  badge,
  onChange,
}: ToggleRowProps) {
  return (
    <label className={`toggle-row ${disabled ? 'is-disabled' : ''}`}>
      <div className="toggle-row__text">
        <div className="toggle-row__label-line">
          <span className="toggle-row__label">{label}</span>
          {badge ? <span className="toggle-row__badge">{badge}</span> : null}
        </div>
        {description ? <span className="toggle-row__desc">{description}</span> : null}
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-row__switch" aria-hidden />
    </label>
  )
}
