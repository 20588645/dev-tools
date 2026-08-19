import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'

import { ApiError } from '@/services/api-client'
import * as appfixService from '@/services/modules/appfix-service'
import type { AppFixInstallImage, AppFixResult, AppFixSettleResult } from '@/services/modules/appfix-service'
import { tauriClient } from '@/services/tauri-client'
import { useNotificationStore } from '@/stores/notification'

import { extractDroppedAppPath, looksLikeAppPath, pathsFromDataTransfer, relatedInstallImage } from '../appfix-path'

interface UseAppFixOptions {
  service?: Pick<typeof appfixService, 'repairApp' | 'listInstallImages' | 'settleInstall' | 'ejectDiskImage'>
  tauri?: Pick<typeof tauriClient, 'available' | 'pickAppBundle' | 'listenDragDrop'>
}

function errorMessage(reason: unknown) {
  if (reason instanceof ApiError) return reason.message
  return reason instanceof Error ? reason.message : '修复失败，请稍后重试'
}

export function resultSummary(result: AppFixResult) {
  if (result.hadQuarantine || result.cleared.includes('com.apple.quarantine')) {
    return '已清除隔离属性，可以再试着打开这个应用。'
  }
  if (result.cleared.length) {
    return '已清除应用包上的扩展属性。若仍提示已损坏，多半不是隔离标记问题。'
  }
  return '未发现隔离标记，已再次清除扩展属性。'
}

export function settleSummary(value: AppFixSettleResult) {
  if (value.copied && value.ejected) return '已拷到应用程序并推出安装镜像。'
  if (value.copySkipped && value.ejected) return '应用程序里已有同名应用，已推出安装镜像。'
  if (value.ejected) return '已推出安装镜像。'
  if (value.copied && value.ejectError) return `已拷到应用程序，但镜像未能推出：${value.ejectError}`
  return value.ejectError || '处理安装镜像失败'
}

export function useAppFix(options: UseAppFixOptions = {}) {
  const service = options.service ?? appfixService
  const tauri = options.tauri ?? tauriClient
  const notifications = useNotificationStore()

  const path = ref('')
  const dragging = ref(false)
  const loading = ref(false)
  const settling = ref(false)
  const error = ref('')
  const validationError = ref('')
  const result = ref<AppFixResult | null>(null)
  const images = ref<AppFixInstallImage[]>([])

  let requestVersion = 0
  let controller: AbortController | null = null
  let stopDragDrop: (() => void) | null = null
  let mounted = false

  const busy = computed(() => loading.value || settling.value)
  const related = computed(() => relatedInstallImage(result.value?.path || path.value, images.value))

  const status = computed(() => {
    if (settling.value) return { label: '处理镜像', status: 'checking' as const }
    if (loading.value) return { label: '修复中', status: 'checking' as const }
    if (error.value && !result.value) return { label: '修复失败', status: 'offline' as const }
    if (result.value) return { label: '已处理', status: 'online' as const }
    if (images.value.length) return { label: '有安装镜像', status: 'idle' as const }
    return { label: '待选择', status: 'idle' as const }
  })

  const summary = computed(() => (result.value ? resultSummary(result.value) : ''))

  const cancel = () => {
    controller?.abort()
    controller = null
    loading.value = false
    settling.value = false
  }

  const refreshImages = async (signal?: AbortSignal) => {
    if (typeof service.listInstallImages !== 'function') {
      images.value = []
      return
    }
    try {
      images.value = await service.listInstallImages(signal)
    } catch {
      images.value = []
    }
  }

  const repair = async (target = path.value) => {
    const next = target.trim()
    if (!next) {
      validationError.value = '请选择或输入 .app 路径'
      return
    }
    if (!looksLikeAppPath(next)) {
      validationError.value = '请选择以 .app 结尾的应用包'
      return
    }

    const version = ++requestVersion
    controller?.abort()
    controller = new AbortController()
    path.value = next
    loading.value = true
    error.value = ''
    validationError.value = ''

    try {
      const value = await service.repairApp(next, controller.signal)
      if (version !== requestVersion) return
      result.value = value
      notifications.push(resultSummary(value), 'success')
      await refreshImages(controller.signal)
    } catch (reason) {
      if (version !== requestVersion || controller.signal.aborted) return
      error.value = errorMessage(reason)
      notifications.push(error.value, 'error')
    } finally {
      if (version === requestVersion) loading.value = false
    }
  }

  const settle = async (target = result.value?.path || path.value) => {
    const next = target.trim()
    if (!next) {
      validationError.value = '请选择或输入 .app 路径'
      return
    }
    const version = ++requestVersion
    controller?.abort()
    controller = new AbortController()
    settling.value = true
    error.value = ''
    try {
      const value = await service.settleInstall(next, controller.signal)
      if (version !== requestVersion) return
      if (value.path) path.value = value.path
      if (value.repair) result.value = value.repair
      const message = settleSummary(value)
      notifications.push(message, value.ejected ? (value.copySkipped ? 'warning' : 'success') : 'warning')
      await refreshImages(controller.signal)
    } catch (reason) {
      if (version !== requestVersion || controller.signal.aborted) return
      const message = errorMessage(reason)
      notifications.push(message, 'error')
    } finally {
      if (version === requestVersion) settling.value = false
    }
  }

  const eject = async (mountPoint: string) => {
    const version = ++requestVersion
    controller?.abort()
    controller = new AbortController()
    settling.value = true
    try {
      const value = await service.ejectDiskImage(mountPoint, controller.signal)
      if (version !== requestVersion) return
      notifications.push(`已推出「${value.volumeName || '安装镜像'}」`, 'success')
      await refreshImages(controller.signal)
    } catch (reason) {
      if (version !== requestVersion || controller.signal.aborted) return
      notifications.push(errorMessage(reason), 'error')
    } finally {
      if (version === requestVersion) settling.value = false
    }
  }

  const pickApp = async () => {
    if (!tauri.available) {
      notifications.push('当前窗口不支持系统选取，请粘贴 .app 路径或从 Finder 拖入', 'info')
      return
    }
    try {
      const picked = await tauri.pickAppBundle()
      if (!picked) return
      await repair(picked)
    } catch (reason) {
      notifications.push(errorMessage(reason), 'error')
    }
  }

  const handleHtmlDrop = async (event: DragEvent) => {
    dragging.value = false
    const dropped = extractDroppedAppPath(pathsFromDataTransfer(event.dataTransfer))
    if (!dropped) {
      validationError.value = '浏览器拿不到应用路径，请点「选取应用」或粘贴完整路径'
      return
    }
    await repair(dropped)
  }

  const bindDragDrop = async () => {
    stopDragDrop?.()
    stopDragDrop = await tauri.listenDragDrop((event) => {
      if (event.type === 'enter' || event.type === 'over') dragging.value = true
      else dragging.value = false
      if (event.type === 'drop') {
        const dropped = extractDroppedAppPath(event.paths ?? [])
        if (dropped) void repair(dropped)
      }
    })
  }

  onMounted(() => {
    mounted = true
    void bindDragDrop()
    void refreshImages()
  })
  onActivated(() => {
    if (mounted) {
      void bindDragDrop()
      void refreshImages()
    }
  })
  onDeactivated(() => {
    stopDragDrop?.()
    stopDragDrop = null
    dragging.value = false
  })
  onBeforeUnmount(() => {
    cancel()
    stopDragDrop?.()
    stopDragDrop = null
  })

  return {
    path,
    dragging,
    loading,
    settling,
    busy,
    error,
    validationError,
    result,
    images,
    related,
    status,
    summary,
    repair,
    settle,
    eject,
    pickApp,
    handleHtmlDrop,
    setDragging: (value: boolean) => { dragging.value = value },
  }
}
