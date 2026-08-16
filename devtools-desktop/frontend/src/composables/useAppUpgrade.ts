import { computed, reactive } from 'vue'

import {
  UPGRADE_PROGRESS_EVENT,
  type UpgradeProgressDetail,
} from '@/services/app-events'
import { startUpgrade as startUpgradeRequest } from '@/services/modules/settings-service'
import { tauriClient } from '@/services/tauri-client'

/**
 * 应用更新任务。侧栏「立即更新」与设置页「检查并更新」共用同一份状态，
 * 确认框和进度窗挂在 AppShellServices，不依赖设置页有没有打开过。
 */

export type AppUpgradeState = 'idle' | 'confirming' | 'starting' | 'running' | 'finished' | 'error'

export interface AppUpgradeSnapshot {
  state: AppUpgradeState
  percent: number
  log: string
  message: string
}

export interface AppUpgradeDependencies {
  startUpgrade?: () => Promise<unknown>
  exitApp?: () => Promise<unknown>
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

export function createAppUpgrade(options: AppUpgradeDependencies = {}) {
  const startUpgrade = options.startUpgrade ?? startUpgradeRequest
  const exitApp = options.exitApp ?? (() => tauriClient.exitApp())

  const upgrade = reactive<AppUpgradeSnapshot>({
    state: 'idle',
    percent: 0,
    log: '',
    message: '',
  })

  const running = computed(() => upgrade.state === 'starting' || upgrade.state === 'running')

  function handleUpgradeProgress(detail: UpgradeProgressDetail) {
    if (typeof detail.percent === 'number') {
      upgrade.percent = Math.min(Math.max(detail.percent, 0), 100)
    }
    if (detail.log) upgrade.log += detail.log
    if (detail.event === 'Started' || detail.event === 'Progress') upgrade.state = 'running'
    if (detail.event === 'Error') {
      upgrade.state = 'error'
      upgrade.message = '更新失败，请查看任务日志'
    }
    if (detail.event === 'Finished') {
      upgrade.state = 'finished'
      upgrade.percent = 100
      upgrade.message = '更新完成，应用即将自动退出并重启'
      globalThis.setTimeout(() => {
        void Promise.resolve(exitApp()).catch(() => undefined)
      }, 500)
    }
  }

  function handleUpgradeProgressEvent(event: Event) {
    handleUpgradeProgress((event as CustomEvent<UpgradeProgressDetail>).detail ?? {})
  }

  function requestUpgrade() {
    if (running.value) return
    upgrade.state = 'confirming'
  }

  async function beginUpgrade() {
    upgrade.state = 'starting'
    upgrade.percent = 0
    upgrade.log = '准备开始本地更新任务…\n'
    upgrade.message = '正在启动更新任务'
    try {
      await startUpgrade()
      if (upgrade.state === 'starting') upgrade.state = 'running'
    } catch (reason) {
      upgrade.state = 'error'
      upgrade.message = errorMessage(reason, '更新任务启动失败')
      upgrade.log += `[ERROR] ${upgrade.message}\n`
    }
  }

  function closeUpgrade() {
    if (running.value) return
    upgrade.state = 'idle'
  }

  function bind() {
    window.removeEventListener(UPGRADE_PROGRESS_EVENT, handleUpgradeProgressEvent)
    window.addEventListener(UPGRADE_PROGRESS_EVENT, handleUpgradeProgressEvent)
  }

  function dispose() {
    window.removeEventListener(UPGRADE_PROGRESS_EVENT, handleUpgradeProgressEvent)
  }

  bind()

  return {
    upgrade,
    running,
    requestUpgrade,
    beginUpgrade,
    closeUpgrade,
    handleUpgradeProgress,
    dispose,
  }
}

export type AppUpgradeController = ReturnType<typeof createAppUpgrade>

let singleton: AppUpgradeController | null = null

/** 生产路径：侧栏与设置页拿到的是同一份任务状态。测试请用 createAppUpgrade。 */
export function useAppUpgrade() {
  if (!singleton) singleton = createAppUpgrade()
  return singleton
}

export function resetAppUpgradeForTest() {
  singleton?.dispose()
  singleton = null
}
