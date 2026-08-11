import { computed, ref, shallowRef } from 'vue'

import { browseRemoteDir, type RemoteEntry } from '@/services/modules/deploy-service'

/**
 * 远程目录浏览的状态与导航。
 *
 * 取代 legacy `deploy.js` 的 `openRemoteBrowser` / `browseRemoteDir` /
 * `renderBreadcrumb` / `renderBrowserListHtml` / `confirmRemotePath` 五个函数与
 * `browserCurrentDir` 一个模块级变量（`formatFileSize` 已有等价实现，见
 * `deploy-format.ts`）。
 *
 * 与添加项目的手动浏览刻意**不共用组件**：那边是两列、多选条目、本机读盘；
 * 这边是四列、单选「当前所在目录」、有 SFTP 连接态与后端回落提示。详见
 * decision.md 第 14 节 M7 降级说明。
 */

export interface RemoteBreadcrumb {
  label: string
  path: string
}

/** 目标服务器。为 null 表示未选中服务器，弹窗不应打开。 */
export interface RemoteBrowserTarget {
  serverId: string
  serverName: string
  host: string
  /** 起始目录，取服务器的默认发布目录。 */
  startPath: string
}

export function useRemoteBrowser() {
  const target = ref<RemoteBrowserTarget | null>(null)
  const currentDir = ref('/')
  const entries = shallowRef<RemoteEntry[]>([])
  const loading = ref(false)
  /** 目录读取失败的原因。非空时列表区展示错误态并给「返回根目录」。 */
  const error = ref('')
  /** 后端把请求路径回落到上级时的说明文案。 */
  const fallback = ref('')

  const open = computed(() => target.value !== null)

  /** 隐藏文件不展示，与 legacy 一致（`item.name.startsWith('.')` 跳过）。 */
  const visibleEntries = computed(() => entries.value.filter(item => !item.name.startsWith('.')))

  const breadcrumbs = computed<RemoteBreadcrumb[]>(() => {
    const segments: RemoteBreadcrumb[] = [{ label: '/', path: '/' }]
    let accum = ''
    for (const part of currentDir.value.split('/').filter(Boolean)) {
      accum = `${accum}/${part}`
      segments.push({ label: part, path: accum })
    }
    return segments
  })

  /** 当前目录的上级。已在根目录时为 null，列表不显示 `..` 行。 */
  const parentDir = computed(() => {
    if (currentDir.value === '/') return null
    return currentDir.value.replace(/\/[^/]+\/?$/, '') || '/'
  })

  async function navigate(dirPath: string) {
    const active = target.value
    if (!active) return
    loading.value = true
    error.value = ''
    fallback.value = ''
    // 请求期间就把面包屑推到目标路径，与 legacy 的即时反馈一致
    currentDir.value = dirPath
    try {
      const result = await browseRemoteDir(active.serverId, dirPath)
      // 必须以返回值为准：目标不可达时后端会回落到上级目录
      currentDir.value = result.path
      entries.value = result.items
      fallback.value = result.fallback
    } catch (cause) {
      entries.value = []
      error.value = cause instanceof Error ? cause.message : '目录读取失败'
    } finally {
      loading.value = false
    }
  }

  async function show(next: RemoteBrowserTarget) {
    target.value = next
    entries.value = []
    error.value = ''
    fallback.value = ''
    await navigate(next.startPath || '/')
  }

  function close() {
    target.value = null
    error.value = ''
    fallback.value = ''
  }

  /**
   * 确认当前目录为发布路径。统一补上尾斜杠——后端按目录拼接上传路径，
   * 缺尾斜杠会把最后一段当文件名前缀。
   */
  function confirm(): string {
    const path = currentDir.value
    const finalPath = path.endsWith('/') ? path : `${path}/`
    target.value = null
    return finalPath
  }

  return {
    target,
    open,
    currentDir,
    entries,
    visibleEntries,
    breadcrumbs,
    parentDir,
    loading,
    error,
    fallback,
    show,
    close,
    navigate,
    confirm,
  }
}
