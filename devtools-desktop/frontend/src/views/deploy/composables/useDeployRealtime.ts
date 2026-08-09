import { onBeforeUnmount, onMounted } from 'vue'

import { onDeployFinished, stepIndexOf, type DeployFinishedDetail } from '@/services/deploy-realtime-service'

/**
 * 子页侧的构建 / 部署完成订阅。
 *
 * WS 处理器本身在 `services/deploy-realtime-service.ts`——它随应用常驻，因为任务
 * 可以在任何页面发起、在任何页面完成，链路不能依赖某个子页被访问过（刷新恢复更是
 * 发生在任何子页挂载之前）。这里只负责把子页的完成回调挂上去、卸载时摘掉。
 */

export interface DeployRealtimeOptions {
  /** 任务完成（成功或失败）后回调，供页面刷新项目列表等副作用。 */
  onFinished?: (detail: DeployFinishedDetail) => void
}

export function useDeployRealtime(options: DeployRealtimeOptions = {}) {
  let stop: (() => void) | null = null

  onMounted(() => {
    if (options.onFinished) stop = onDeployFinished(options.onFinished)
  })

  onBeforeUnmount(() => {
    stop?.()
    stop = null
  })

  return { stepIndexOf }
}
