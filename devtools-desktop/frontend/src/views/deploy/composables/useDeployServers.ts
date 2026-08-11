import { ref, shallowRef } from 'vue'

import {
  deleteServer as deleteServerRequest,
  getServers,
  type DeployServer,
} from '@/services/modules/deploy-service'

/**
 * 服务器管理子页的列表数据。
 *
 * 构建/部署与项目配置弹窗均经 getServers() 自行拉取；dashboard 在 onActivated
 * 时重载。不再回写 legacy 全局 servers。
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
