<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

import LogViewer from '@/components/logviewer/LogViewer.vue'
import {
  emitProjectsChanged,
  installAddProjectBridge,
  onAddProjectRequested,
} from '@/legacy/add-project-bridge'
import { installUpgradeProgressBridge } from '@/legacy/legacy-bridge'
import { showAppToast } from '@/services/app-toast'
import { createDeployRealtimeService } from '@/services/deploy-realtime-service'
import { createDesktopNotificationService } from '@/services/desktop-notification'
import { createExperimentalEffectsService } from '@/services/experimental-effects-service'
import { createFileTransferSessionService } from '@/services/filetransfer-session-service'
import { openInEditor } from '@/services/modules/run-service'
import { createRunRuntimeService } from '@/services/run-runtime-service'
import { createTerminalRuntimeService } from '@/services/terminal-runtime-service'
import { createTodoReminderService } from '@/services/todo-reminder-service'
import { useLogTaskStore } from '@/stores/log-task'
import { useNotificationStore } from '@/stores/notification'
import AddProjectDialog from '@/views/deploy/components/AddProjectDialog.vue'
import { useAddProject } from '@/views/deploy/composables/useAddProject'

defineOptions({ name: 'AppShellServices' })

const logTask = useLogTaskStore()
const notify = useNotificationStore()
const addProject = useAddProject()
const todoReminderService = createTodoReminderService()
const desktopNotificationService = createDesktopNotificationService()
const experimentalEffectsService = createExperimentalEffectsService()
const runRuntimeService = createRunRuntimeService()
const deployRealtimeService = createDeployRealtimeService()
const fileTransferSessionService = createFileTransferSessionService()
const terminalRuntimeService = createTerminalRuntimeService()

let stopLogReopen: (() => void) | null = null
let stopAddProjectBridge: (() => void) | null = null
let stopAddProjectRequests: (() => void) | null = null
let stopUpgradeProgressBridge: (() => void) | null = null

function onLogMinimize() {
  logTask.minimize()
  const isRun = logTask.kind === 'run'
  const title = isRun ? '本地服务仍在运行' : '任务仍在后台运行'
  const message = isRun ? '点击此处可查看运行日志' : '点击此处可查看进度'
  showAppToast(title, message, { clickable: true, persistent: true })
}

function onLogReopenRequested() {
  logTask.reopen()
}

async function onOpenSource(payload: { path: string; line: number; column: number | null }) {
  try {
    await openInEditor({
      projectName: logTask.projectName || undefined,
      path: payload.path,
      line: payload.line,
    })
    showAppToast('正在编辑器中定位代码...', payload.path)
  } catch (cause) {
    showAppToast(`无法定位代码: ${cause instanceof Error ? cause.message : '未知错误'}`)
  }
}

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

onMounted(() => {
  todoReminderService.start()
  desktopNotificationService.start()
  experimentalEffectsService.start()
  runRuntimeService.start()
  deployRealtimeService.start()
  fileTransferSessionService.start()
  terminalRuntimeService.start()
  window.addEventListener('devtools:log-reopen-requested', onLogReopenRequested)
  stopLogReopen = () => window.removeEventListener('devtools:log-reopen-requested', onLogReopenRequested)
  stopAddProjectBridge = installAddProjectBridge()
  stopAddProjectRequests = onAddProjectRequested(() => { void addProject.show() })
  stopUpgradeProgressBridge = installUpgradeProgressBridge()
})

onBeforeUnmount(() => {
  todoReminderService.stop()
  desktopNotificationService.stop()
  experimentalEffectsService.stop()
  runRuntimeService.stop()
  deployRealtimeService.stop()
  fileTransferSessionService.stop()
  terminalRuntimeService.stop()
  stopLogReopen?.()
  stopAddProjectBridge?.()
  stopAddProjectRequests?.()
  stopUpgradeProgressBridge?.()
})
</script>

<template>
  <div class="app-shell-services" data-app-shell-services aria-hidden="true">
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
.app-shell-services {
  display: contents;
}
</style>
