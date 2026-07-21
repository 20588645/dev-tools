/// <reference types="vite/client" />

import type { App as VueApp } from 'vue'
import type { Pinia } from 'pinia'

interface MigrationRuntime {
  readonly pinia: Pinia
  readonly app: VueApp<Element> | null
  readonly deferred: boolean
  mount: (root?: Element | null) => VueApp<Element> | null
}

interface LegacyHomeRuntime {
  mount: (root: Element | null) => unknown
  refresh?: () => Promise<unknown>
  notifyRuntimeChange?: () => void
}

declare global {
  interface Window {
    __DEVTOOLS_MIGRATION__?: MigrationRuntime
    DevToolsHomeApp?: LegacyHomeRuntime
  }
}

export {}
