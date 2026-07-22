import { createPinia } from 'pinia'
import { createApp, type App as VueApp } from 'vue'

import App from './App.vue'
import { installUiLibrary } from './plugins/ui-library'
import './styles/tokens/index.css'

const pinia = createPinia()
let migrationApp: VueApp<Element> | null = null

function mountMigrationHost(root: Element | null = document.querySelector('#vue-migration-host')) {
  if (!root) return null
  if (migrationApp) return migrationApp

  root.removeAttribute('hidden')
  root.setAttribute('aria-hidden', 'false')
  migrationApp = createApp(App)
  migrationApp.use(pinia)
  migrationApp.use(installUiLibrary)
  migrationApp.mount(root)
  return migrationApp
}

window.__DEVTOOLS_MIGRATION__ = {
  pinia,
  get app() {
    return migrationApp
  },
  deferred: false,
  mount: mountMigrationHost,
}

mountMigrationHost()

window.dispatchEvent(new CustomEvent('devtools:migration-host-ready', {
  detail: { deferred: false },
}))
