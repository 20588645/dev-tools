import type { App as VueApp } from 'vue'
import { defineAsyncComponent } from 'vue'

const UiLibraryProvider = defineAsyncComponent(() => import('@/components/vendor/UiLibraryProvider.vue'))

/** Register the one application-level provider used by every Vue surface. */
export function installUiLibrary(app: VueApp) {
  app.component('UiLibraryProvider', UiLibraryProvider)
}

export { UiLibraryProvider }
