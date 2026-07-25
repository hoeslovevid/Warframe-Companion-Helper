import { ReactNode } from 'react'

type Props = {
  title: string
  body: string
  actions?: ReactNode
}

export function EmptyState({ title, body, actions }: Props) {
  return (
    <div className="vl-empty">
      <div className="vl-empty__mark" aria-hidden />
      <h3 className="vl-empty__title">{title}</h3>
      <p className="vl-empty__body">{body}</p>
      {actions ? <div className="vl-empty__actions">{actions}</div> : null}
    </div>
  )
}
