import '@xterm/xterm/css/xterm.css'

/**
 * xterm 及 addon 的懒加载入口（P9-6 取代 `src/js/xterm*.js` 全局脚本）。
 * 仅由 `terminal-runtime-service.ensureXtermLoaded()` 动态 import：
 * xterm 约 300KB，随本模块（含官方 CSS）单独分包，不进主包。
 */
export { Terminal } from '@xterm/xterm'
export { FitAddon } from '@xterm/addon-fit'
export { SearchAddon } from '@xterm/addon-search'
export { WebglAddon } from '@xterm/addon-webgl'
