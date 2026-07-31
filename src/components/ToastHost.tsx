import { useEffect, useState } from 'react'
import { dismissToast, subscribeToasts, ToastItem } from '../lib/toast'
import './toast.css'

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  useEffect(() => subscribeToasts(setItems), [])
  if (!items.length) return null
  return (
    <div className="toast-host" aria-live="polite">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`toast-item is-${t.tone}`}
          onClick={() => dismissToast(t.id)}
          title="Dismiss"
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
