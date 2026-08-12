<script setup lang="ts">
import { computed, h, onActivated, onMounted, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDataTable from '@/components/data/BaseDataTable.vue'
import type { BaseDataTableColumn, BaseDataTableRow } from '@/components/data/base-data-table'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import { testServer, type DeployServer } from '@/services/modules/deploy-service'
import { useDeployTaskStore } from '@/stores/deploy-task'
import { useLogTaskStore } from '@/stores/log-task'
import { useNotificationStore } from '@/stores/notification'

import FileZillaImportDialog from './components/FileZillaImportDialog.vue'
import DeployChrome from './components/DeployChrome.vue'
import ServerFormDialog from './components/ServerFormDialog.vue'
import ServerRowActions from './components/ServerRowActions.vue'
import { useDeployServers } from './composables/useDeployServers'
import { useFileZillaImport } from './composables/useFileZillaImport'
import { useServerForm } from './composables/useServerForm'
import './deploy-servers.css'

defineOptions({ name: 'DeployServersView' })

const page = useDeployServers()
const form = useServerForm()
const importer = useFileZillaImport()
const task = useDeployTaskStore()
const log = useLogTaskStore()
const notify = useNotificationStore()

/*
  WS 日志/进度/状态（含连接测试的 `test-` 完成分支）由常驻的
  `deploy-realtime-service` 处理，本子页无需订阅——它只发起连接测试并读 store。
*/

const pendingRemove = ref<DeployServer | null>(null)

const reason = (cause: unknown) => cause instanceof Error ? cause.message : '未知错误'

type ServerRow = DeployServer & BaseDataTableRow

const rows = computed<ServerRow[]>(() => page.servers.value.map(server => ({ ...server })))

const columns = computed<BaseDataTableColumn<ServerRow>[]>(() => [
  { key: 'name', title: '名称', minWidth: 150, ellipsis: true },
  {
    key: 'host', title: 'Host', minWidth: 150, ellipsis: true,
    render: row => h('span', { class: 'deploy-servers__mono' }, row.host),
  },
  { key: 'username', title: '用户', width: 96, ellipsis: true },
  { key: 'port', title: '端口', width: 76, align: 'right', render: row => String(row.port) },
  {
    key: 'defaultRemotePath', title: '目标路径', minWidth: 180, ellipsis: true,
    render: row => h('span', { class: 'deploy-servers__mono' }, row.defaultRemotePath || '/'),
  },
  {
    key: 'actions', title: '操作', width: 128, align: 'right',
    render: row => h(ServerRowActions, {
      name: row.name,
      onEdit: () => form.openEdit(row),
      onTest: () => void onTest(row),
      onRemove: () => { pendingRemove.value = row },
    }),
  },
])

async function refresh(options: { silent?: boolean } = {}) {
  try {
    await page.load(options)
  } catch (cause) {
    notify.push(`刷新服务器失败：${reason(cause)}`, 'error')
  }
}

async function onSubmitForm() {
  try {
    await form.submit()
    notify.push(form.editingId.value ? '服务器已更新' : '服务器已添加', 'success')
    await refresh({ silent: true })
  } catch (cause) {
    notify.push(`保存失败：${reason(cause)}`, 'error')
  }
}

async function onConfirmRemove() {
  const server = pendingRemove.value
  if (!server) return
  try {
    await page.remove(server.id)
    pendingRemove.value = null
    notify.push(`已删除 ${server.name}`, 'success')
  } catch (cause) {
    notify.push(`删除失败：${reason(cause)}`, 'error')
  }
}

/**
 * 连接测试建立真实 SSH，日志由 WebSocket 推到公共 LogViewer。
 *
 * 必须先 `task.begin()` 再发请求：WS 消息的归属判据是 deploy-task store 的
 * `active`，不登记任务会让 `acceptsMessage` 全部拒收，表现为弹窗停在第一步、
 * 内容区空白（连接其实是通的）。同时它也建模了 id 未回填的竞态窗口。
 */
async function onTest(server: DeployServer) {
  task.begin(server.name)
  log.open({
    kind: 'deploy',
    id: null,
    projectName: server.name,
    title: '连接测试',
    subtitle: `${server.name} (${server.username}@${server.host}:${server.port})`,
  }, { steps: ['连接中', 'SFTP', '完成'] })
  try {
    const { id } = await testServer(server.id)
    task.attachTaskId(id)
    log.attachTaskId(id)
  } catch (cause) {
    // 请求没发出时后端不会回 WS 完成事件，必须本地解锁并就地写日志
    log.append(`请求失败: ${reason(cause)}`, 'error')
    log.setResult({ icon: '❌', text: '连接测试失败' })
    log.setRunning(false)
    task.abandon(server.name)
  }
}

async function onPickXml(name: string, content: string) {
  try {
    await importer.loadFromXml(name, content)
  } catch (cause) {
    notify.push(`解析失败：${reason(cause)}`, 'error')
  }
}

async function onSubmitImport() {
  try {
    const { added, skipped } = await importer.submit()
    importer.open.value = false
    const parts = [added.length ? `新增 ${added.length}` : '', skipped.length ? `跳过 ${skipped.length}` : '']
    notify.push(`导入完成：${parts.filter(Boolean).join('，') || '无变化'}`, 'success')
    await refresh({ silent: true })
  } catch (cause) {
    notify.push(`导入失败：${reason(cause)}`, 'error')
  }
}

onMounted(() => { void refresh() })
/** KeepAlive 缓存下重新进入子页不会再走 onMounted，别处改过服务器也要跟上。 */
onActivated(() => { void refresh({ silent: true }) })
</script>

<template>
  <DeployChrome>
  <div class="deploy-servers" data-test="deploy-servers">
    <div class="deploy-servers__toolbar">
      <BaseButton variant="secondary" @click="importer.show()">从 FileZilla 导入</BaseButton>
      <BaseButton @click="form.openCreate()">+ 添加服务器</BaseButton>
    </div>

    <LoadingState v-if="page.loading.value" label="正在加载服务器…" />
    <ErrorState
      v-else-if="page.error.value"
      title="加载服务器失败"
      :description="page.error.value"
      @retry="refresh()"
    />
    <EmptyState
      v-else-if="rows.length === 0"
      title="还没有服务器"
      description="点击「+ 添加服务器」或从 FileZilla 导入现有配置"
    >
      <template #actions>
        <BaseButton @click="form.openCreate()">+ 添加服务器</BaseButton>
      </template>
    </EmptyState>
    <BaseDataTable
      v-else
      :columns="columns"
      :rows="rows"
      :row-key="row => row.id"
      density="compact"
      :scroll-x="760"
      aria-label="服务器列表"
    />

    <ServerFormDialog
      :open="form.open.value"
      :title="form.title.value"
      :editing="Boolean(form.editingId.value)"
      :state="form.state.value"
      :deploy-paths="form.deployPaths.value"
      :path-draft="form.pathDraft.value"
      :duplicate-hint="form.duplicateHint.value"
      :saving="form.saving.value"
      :can-save="form.canSave.value"
      @update:open="form.open.value = $event"
      @update:state="form.patchState($event)"
      @update:path-draft="form.pathDraft.value = $event"
      @add-path="form.addPath()"
      @pop-path="form.popPathOnBackspace()"
      @remove-path="form.removePath($event)"
      @edit-path="(index, value) => form.editPath(index, value)"
      @submit="onSubmitForm"
    />
    <FileZillaImportDialog
      :open="importer.open.value"
      :loading="importer.loading.value"
      :importing="importer.importing.value"
      :source-label="importer.sourceLabel.value"
      :file-name="importer.fileName.value"
      :items="importer.items.value"
      :checked="importer.checked.value"
      :summary="importer.summary.value"
      :state-of="importer.stateOf"
      @update:open="importer.open.value = $event"
      @toggle="importer.toggle($event)"
      @toggle-all="importer.toggleAll($event)"
      @pick-xml="onPickXml"
      @read-error="notify.push(`读取文件失败：${$event}`, 'error')"
      @submit="onSubmitImport"
    />
    <ConfirmDialog
      :model-value="pendingRemove !== null"
      title="删除服务器"
      :message="pendingRemove ? `确认删除「${pendingRemove.name}」？引用它的项目配置需要重新选择服务器。` : ''"
      confirm-text="删除"
      tone="danger"
      @update:model-value="!$event && (pendingRemove = null)"
      @confirm="onConfirmRemove"
    />
  </div>
  </DeployChrome>
</template>
