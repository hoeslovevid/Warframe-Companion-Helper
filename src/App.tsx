import { useEffect } from 'react'
import { CompanionApp } from './app/companion/CompanionApp'
import { OverlayApp } from './app/overlay/OverlayApp'

function resolveWindow(): 'companion' | 'overlay' {
  const params = new URLSearchParams(window.location.search)
  const q = params.get('window') || params.get('w')
  if (q === 'overlay') return 'overlay'
  if (window.location.hash.includes('overlay')) return 'overlay'
  return 'companion'
}

export default function App() {
  const mode = resolveWindow()

  useEffect(() => {
    document.documentElement.classList.toggle('is-overlay', mode === 'overlay')
    document.body.classList.toggle('is-overlay', mode === 'overlay')
    document.title = mode === 'overlay' ? 'Everything Warframe Overlay' : 'Everything Warframe'
    console.info(`[Everything Warframe] renderer mode=${mode} url=${window.location.href}`)
  }, [mode])

  return mode === 'overlay' ? <OverlayApp /> : <CompanionApp />
}
