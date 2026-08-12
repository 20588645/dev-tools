import { createPinia } from 'pinia'
import { createApp, type App as VueApp } from 'vue'

import App from './App.vue'
import { installUiLibrary } from './plugins/ui-library'
import { createMigrationRouter } from './router'
import { setAppRouter } from './router/navigate'
import './styles/tokens/index.css'

const pinia = createPinia()
const router = createMigrationRouter()
setAppRouter(router)

let appInstance: VueApp<Element> | null = null

function mountApp(root: Element | null = document.querySelector('#app')) {
  if (!root) return null
  if (appInstance) return appInstance

  appInstance = createApp(App)
  appInstance.use(pinia)
  appInstance.use(router)
  appInstance.use(installUiLibrary)
  appInstance.mount(root)
  return appInstance
}

window.__DEVTOOLS_MIGRATION__ = {
  pinia,
  get app() {
    return appInstance
  },
  deferred: false,
  mount: mountApp,
}

mountApp()

window.dispatchEvent(new CustomEvent('devtools:migration-host-ready', {
  detail: { deferred: false },
}))
