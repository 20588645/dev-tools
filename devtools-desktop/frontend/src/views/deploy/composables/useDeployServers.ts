import { ref, shallowRef } from 'vue'

import {
  deleteServer as deleteServerRequest,
  getServers,
  type DeployServer,
} from '@/services/modules/deploy-service'

/**
 * 服务器管理子页的列表数据。
 *
 * `servers` 同时被构建/部署弹窗与项目配置弹窗消费（旧实现里是 `app.js` 的全局
 * `servers`），所以刷新后要通知 legacy 侧，见 View 中的 `syncLegacyServers`。
 */
export function useDeployServers() {
  const servers = shallowRef<DeployServer[]>([])
  const loading = ref(false)
  const error = ref('')

  async function load(options: { silent?: boolean } = {}) {
    if (!options.silent) loading.value = true
    error.value = ''
    try {
      servers.value = await getServers()
    } catch (cause) {
      // 已有数据时保留旧列表，只把错误交给调用方走 toast；首次加载才让整页进失败态
      const message = cause instanceof Error ? cause.message : '加载服务器失败'
      if (servers.value.length === 0) error.value = message
      else throw cause
    } finally {
      loading.value = false
    }
  }

  async function remove(id: string) {
    await deleteServerRequest(id)
    await load({ silent: true })
  }

  return { servers, loading, error, load, remove }
}
