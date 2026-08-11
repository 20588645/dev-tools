<script setup lang="ts">
import { defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'

import LogViewer from '@/components/logviewer/LogViewer.vue'
import {
  installPageLeaveGuardBridge,
  onLegacyPageActivation,
  onLegacySubTabActivation,
  type LegacyPageId,
} from '@/legacy/legacy-bridge'
import {
  emitProjectsChanged,
  installAddProjectBridge,
  onAddProjectRequested,
} from '@/legacy/add-project-bridge'
import { createDeployRealtimeService } from '@/services/deploy-realtime-service'
import { createFileTransferSessionService } from '@/services/filetransfer-session-service'
import { createRunRuntimeService } from '@/services/run-runtime-service'
import { createTodoReminderService } from '@/services/todo-reminder-service'
import { normalizeThemeMode, useAppStore, type Theme } from '@/stores/app'
import { useLogTaskStore } from '@/stores/log-task'
import { useNotificationStore } from '@/stores/notification'
import AddProjectDialog from '@/views/deploy/components/AddProjectDialog.vue'
import { useAddProject } from '@/views/deploy/composables/useAddProject'
import HomeView from '@/views/home/HomeView.vue'

defineOptions({ name: 'MigrationHost' })

const IpCheckView = defineAsyncComponent(() => import('@/views/ipcheck/IpCheckView.vue'))
const NotesView = defineAsyncComponent(() => import('@/views/notes/NotesView.vue'))
const RunView = defineAsyncComponent(() => import('@/views/run/RunView.vue'))
const FileTransferView = defineAsyncComponent(() => import('@/views/filetransfer/FileTransferView.vue'))
const FileEditorView = defineAsyncComponent(() => import('@/views/editor/FileEditorView.vue'))
const NotebookView = defineAsyncComponent(() => import('@/views/notebook/NotebookView.vue'))
const SettingsView = defineAsyncComponent(() => import('@/views/settings/SettingsView.vue'))
const TodoView = defineAsyncComponent(() => import('@/views/todo/TodoView.vue'))
const TwofaView = defineAsyncComponent(() => import('@/views/twofa/TwofaView.vue'))
const UsageView = defineAsyncComponent(() => import('@/views/usage/UsageView.vue'))
const DeployDashboardView = defineAsyncComponent(() => import('@/views/deploy/DeployDashboardView.vue'))
const DeployServersView = defineAsyncComponent(() => import('@/views/deploy/DeployServersView.vue'))
const DeployHistoryView = defineAsyncComponent(() => import('@/views/deploy/DeployHistoryView.vue'))
const app = useAppStore()
const logTask = useLogTaskStore()
const notify = useNotificationStore()
/*
  添加项目弹窗随应用常驻：它有三个入口（部署页头、项目总览空态、本地运行页），
  分属不同页面，而这些页面在 KeepAlive 下切走即 deactivated——弹窗挂在其中任一
  页内则从别处点不开。见 add-project-bridge 的说明。
 */
const addProject = useAddProject()
const todoReminderService = createTodoReminderService()
/* 运行态对账与托盘刷新：必须随应用常驻，不能等本地运行页挂载，见服务内说明。 */
const runRuntimeService = createRunRuntimeService()
/* 构建/部署实时链路与刷新恢复：同理常驻，任务可在任何页面发起与完成。 */
const deployRealtimeService = createDeployRealtimeService()
/* SFTP keepalive + transfer WS：切走文件传输页不销毁会话。 */
const fileTransferSessionService = createFileTransferSessionService()
const activePage = ref<LegacyPageId>(
  (document.querySelector('.page.active')?.id.replace(/^page-/, '') as LegacyPageId | undefined) ?? 'home',
)
const hasIpCheckTarget = Boolean(document.querySelector('#vue-ipcheck-host'))
const notesTarget = document.querySelector('#vue-notes-host')
const hasNotesTarget = Boolean(notesTarget)
notesTarget?.setAttribute('data-vue-owner', 'notes')
const notebookTarget = document.querySelector('#vue-notebook-host')
const hasNotebookTarget = Boolean(notebookTarget)
notebookTarget?.setAttribute('data-vue-owner', 'notebook')
const todoTarget = document.querySelector('#vue-todo-host')
const hasTodoTarget = Boolean(todoTarget)
todoTarget?.setAttribute('data-vue-owner', 'todo')
const settingsTarget = document.querySelector('#vue-settings-host')
const hasSettingsTarget = Boolean(settingsTarget)
settingsTarget?.setAttribute('data-vue-owner', 'settings')
const twofaTarget = document.querySelector('#vue-twofa-host')
const hasTwofaTarget = Boolean(twofaTarget)
twofaTarget?.setAttribute('data-vue-owner', 'twofa')
const usageTarget = document.querySelector('#vue-usage-host')
const hasUsageTarget = Boolean(usageTarget)
usageTarget?.setAttribute('data-vue-owner', 'usage')
const runTarget = document.querySelector('#vue-run-host')
const hasRunTarget = Boolean(runTarget)
runTarget?.setAttribute('data-vue-owner', 'run')
const filetransferTarget = document.querySelector('#vue-filetransfer-host')
const hasFiletransferTarget = Boolean(filetransferTarget)
filetransferTarget?.setAttribute('data-vue-owner', 'filetransfer')
const editorTarget = document.querySelector('#vue-editor-host')
const hasEditorTarget = Boolean(editorTarget)
editorTarget?.setAttribute('data-vue-owner', 'editor')
/* 部署面板三个子页均已迁到 Vue。 */
const deployDashboardTarget = document.querySelector('#vue-deploy-dashboard-host')
const hasDeployDashboardTarget = Boolean(deployDashboardTarget)
deployDashboardTarget?.setAttribute('data-vue-owner', 'deploy-dashboard')
const deployServersTarget = document.querySelector('#vue-deploy-servers-host')
const hasDeployServersTarget = Boolean(deployServersTarget)
deployServersTarget?.setAttribute('data-vue-owner', 'deploy-servers')
const deployHistoryTarget = document.querySelector('#vue-deploy-history-host')
const hasDeployHistoryTarget = Boolean(deployHistoryTarget)
deployHistoryTarget?.setAttribute('data-vue-owner', 'deploy-history')
/** 部署面板当前子页；只有激活的子页才挂载，避免未显示的子页发请求。 */
const activeDeploySub = ref(
  document.querySelector('#page-deploy .seg__item.is-active')?.getAttribute('data-sub') ?? 'dashboard',
)
let themeObserver: MutationObserver | null = null
let stopPageActivation: (() => void) | null = null
let stopSubTabActivation: (() => void) | null = null
let stopLogReopen: (() => void) | null = null
let stopAddProjectBridge: (() => void) | null = null
let stopAddProjectRequests: (() => void) | null = null
let stopPageLeaveGuardBridge: (() => void) | null = null

/**
 * 旧脚本里日志链路的两个副作用：最小化时给出可点击回来的 Toast、点击日志中的
 * 源码位置拉起编辑器。迁移期仍复用旧全局函数，等 deploy 页迁完再一并收敛。
 */
function onLogMinimize() {
  logTask.minimize()
  const isRun = logTask.kind === 'run'
  const title = isRun ? '本地服务仍在运行' : '任务仍在后台运行'
  const message = isRun ? '点击此处可查看运行日志' : '点击此处可查看进度'
  window.showToast?.(title, message, { clickable: true, persistent: true })
}

function onLogReopenRequested() {
  logTask.reopen()
}

function onOpenSource(payload: { path: string; line: number; column: number | null }) {
  void window.openFileInEditorByPath?.(payload.path, payload.line, logTask.projectName)
}

/** 添加完成后广播，让项目总览子页静默刷新；分列提示已存在跳过与真失败。 */
async function onSubmitAddProject() {
  const result = await addProject.submit()
  if (!result) {
    if (addProject.error.value) notify.push(addProject.error.value, 'error')
    return
  }
  emitProjectsChanged()
  const parts = [`成功添加 ${result.added} 个`]
  if (result.skipped.length) parts.push(`${result.skipped.length} 个已存在跳过`)
  if (result.failed.length) parts.push(`${result.failed.length} 个失败`)
  notify.push(parts.join('，'), result.failed.length ? 'warning' : 'success')
}

function syncLegacyTheme() {
  const theme: Theme = document.body.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  const mode = normalizeThemeMode(document.body.getAttribute('data-theme-mode'))
  if (app.theme !== theme || app.themeMode !== mode) app.syncTheme(mode, theme)
}

onMounted(() => {
  syncLegacyTheme()
  stopPageActivation = onLegacyPageActivation(({ pageId }) => {
    activePage.value = pageId
  })
  stopSubTabActivation = onLegacySubTabActivation((sub) => {
    if (sub) activeDeploySub.value = sub
  })
  themeObserver = new MutationObserver(syncLegacyTheme)
  themeObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-theme-mode'],
  })
  todoReminderService.start()
  runRuntimeService.start()
  window.addEventListener('devtools:log-reopen-requested', onLogReopenRequested)
  stopLogReopen = () => window.removeEventListener('devtools:log-reopen-requested', onLogReopenRequested)
  stopAddProjectBridge = installAddProjectBridge()
  stopAddProjectRequests = onAddProjectRequested(() => { void addProject.show() })
  stopPageLeaveGuardBridge = installPageLeaveGuardBridge()
  deployRealtimeService.start()
  fileTransferSessionService.start()
})

onBeforeUnmount(() => {
  stopPageActivation?.()
  stopSubTabActivation?.()
  themeObserver?.disconnect()
  todoReminderService.stop()
  runRuntimeService.stop()
  deployRealtimeService.stop()
  fileTransferSessionService.stop()
  stopLogReopen?.()
  stopAddProjectBridge?.()
  stopAddProjectRequests?.()
  stopPageLeaveGuardBridge?.()
})
</script>

<template>
  <div class="migration-host" data-migration-host>
    <HomeView :active="activePage === 'home'" />
    <Teleport v-if="hasIpCheckTarget" to="#vue-ipcheck-host">
      <KeepAlive>
        <IpCheckView v-if="activePage === 'ipcheck'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasNotesTarget" to="#vue-notes-host">
      <KeepAlive>
        <NotesView v-if="activePage === 'notes'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasNotebookTarget" to="#vue-notebook-host">
      <KeepAlive>
        <NotebookView v-if="activePage === 'notebook'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasTodoTarget" to="#vue-todo-host">
      <KeepAlive>
        <TodoView v-if="activePage === 'todo'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasSettingsTarget" to="#vue-settings-host">
      <KeepAlive>
        <SettingsView v-if="activePage === 'settings'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasTwofaTarget" to="#vue-twofa-host">
      <KeepAlive>
        <TwofaView v-if="activePage === 'twofa'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasUsageTarget" to="#vue-usage-host">
      <KeepAlive>
        <UsageView v-if="activePage === 'usage'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasRunTarget" to="#vue-run-host">
      <KeepAlive>
        <RunView v-if="activePage === 'run'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasFiletransferTarget" to="#vue-filetransfer-host">
      <KeepAlive>
        <FileTransferView v-if="activePage === 'filetransfer'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasEditorTarget" to="#vue-editor-host">
      <KeepAlive>
        <FileEditorView v-if="activePage === 'editor'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasDeployDashboardTarget" to="#vue-deploy-dashboard-host">
      <KeepAlive>
        <DeployDashboardView v-if="activePage === 'deploy' && activeDeploySub === 'dashboard'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasDeployServersTarget" to="#vue-deploy-servers-host">
      <KeepAlive>
        <DeployServersView v-if="activePage === 'deploy' && activeDeploySub === 'servers'" />
      </KeepAlive>
    </Teleport>
    <Teleport v-if="hasDeployHistoryTarget" to="#vue-deploy-history-host">
      <KeepAlive>
        <DeployHistoryView v-if="activePage === 'deploy' && activeDeploySub === 'history'" />
      </KeepAlive>
    </Teleport>
    <!-- 添加项目弹窗：同为 BaseDialog，随应用常驻，从任一部署子页都能打开 -->
    <AddProjectDialog
      :open="addProject.open.value"
      :mode="addProject.mode.value"
      :visible-available="addProject.visibleAvailable.value"
      :scan-checked="addProject.scanChecked.value"
      :scan-empty-kind="addProject.scanEmptyKind.value"
      :scan-loading="addProject.scanLoading.value"
      :query="addProject.query.value"
      :entries="addProject.entries.value"
      :browse-checked="addProject.browseChecked.value"
      :breadcrumbs="addProject.breadcrumbs.value"
      :browse-loading="addProject.browseLoading.value"
      :selected-count="addProject.selectedPaths.value.length"
      :submit-label="addProject.submitLabel.value"
      :submitting="addProject.submitting.value"
      :error="addProject.error.value"
      @close="addProject.close()"
      @update:mode="addProject.switchMode($event)"
      @update:query="addProject.query.value = $event"
      @toggle-scan="addProject.toggleScan($event)"
      @toggle-all-scan="addProject.toggleAllScan($event)"
      @toggle-browse="addProject.toggleBrowse($event)"
      @navigate="addProject.browseTo($event)"
      @submit="onSubmitAddProject"
    />
    <!-- LogViewer 内部用 BaseDialog（NModal），自带 teleport 到 body -->
    <LogViewer
      v-model="logTask.visible"
      :title="logTask.title"
      :subtitle="logTask.subtitle"
      :lines="logTask.lines"
      :steps="logTask.steps"
      :percent="logTask.percent"
      :indeterminate="logTask.indeterminate"
      :progress-label="logTask.progressLabel"
      :progress-tone="logTask.progressTone"
      :result-icon="logTask.resultIcon"
      :result-text="logTask.resultText"
      :result-note="logTask.resultNote"
      :running="logTask.running"
      @minimize="onLogMinimize"
      @open-source="onOpenSource"
    />
  </div>
</template>

<style scoped>
.migration-host {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
