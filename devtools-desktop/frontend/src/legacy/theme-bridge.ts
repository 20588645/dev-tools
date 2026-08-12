import { useAppStore, type ThemeMode } from '@/stores/app'

export const THEME_CHANGED_EVENT = 'devtools:theme-changed'

export type ThemeChangedDetail = {
  mode: ThemeMode
  theme: 'light' | 'dark'
}

declare global {
  interface Window {
    /** P8-4：legacy 侧栏主题菜单转发到 Pinia 单一写入 */
    __devtoolsApplyThemeMode?: (mode: string, options?: { persist?: boolean }) => void
  }
}

/**
 * 安装主题桥：HTML 侧栏 `setThemeMode` → Pinia `applyThemeMode`。
 * 由 UiLibraryProvider 在 startThemeSync 后调用。
 */
export function installThemeBridge(): () => void {
  const app = useAppStore()
  const previous = window.__devtoolsApplyThemeMode

  const handler = (mode: string, options?: { persist?: boolean }) => {
    app.applyThemeMode(mode as ThemeMode, options)
  }

  window.__devtoolsApplyThemeMode = handler

  return () => {
    if (window.__devtoolsApplyThemeMode === handler) {
      window.__devtoolsApplyThemeMode = previous
    }
  }
}

export function isThemeBridgeInstalled(): boolean {
  return typeof window.__devtoolsApplyThemeMode === 'function'
}
