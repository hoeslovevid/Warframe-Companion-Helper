import { CSSProperties, ReactNode } from 'react'
import './Panel.css'

type PanelProps = {
  title: string
  subtitle?: string
  children: ReactNode
  className?: string
  style?: CSSProperties
  opacity?: number
  actions?: ReactNode
}

export function Panel({
  title,
  subtitle,
  children,
  className = '',
  style,
  opacity = 0.92,
  actions,
}: PanelProps) {
  return (
    <section
      className={`vl-panel ${className}`.trim()}
      style={{ ...style, opacity }}
    >
      <header className="vl-panel__header">
        <div>
          <h2 className="vl-panel__title">{title}</h2>
          {subtitle ? <p className="vl-panel__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="vl-panel__actions">{actions}</div> : null}
      </header>
      <div className="vl-panel__body">{children}</div>
    </section>
  )
}
