/** Lightweight toast bus for companion (and overlay when shared). */

export type ToastTone = 'info' | 'ok' | 'warn' | 'error'

export type ToastItem = {
  id: string
  message: string
  tone: ToastTone
  ttlMs: number
}

type Listener = (items: ToastItem[]) => void

const listeners = new Set<Listener>()
let items: ToastItem[] = []
let seq = 0

function emit() {
  const snapshot = items.slice()
  for (const l of listeners) l(snapshot)
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener(items.slice())
  return () => listeners.delete(listener)
}

export function pushToast(message: string, tone: ToastTone = 'info', ttlMs = 4200) {
  const id = `t-${Date.now()}-${++seq}`
  const item: ToastItem = { id, message, tone, ttlMs }
  items = [...items.slice(-7), item]
  emit()
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== id)
    emit()
  }, ttlMs)
  return id
}

export function dismissToast(id: string) {
  items = items.filter((t) => t.id !== id)
  emit()
}
