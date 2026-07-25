/// <reference types="vite/client" />

import type { VoidLensApi } from '../shared/types'

declare global {
  interface Window {
    voidlens: VoidLensApi
  }
}

export {}
