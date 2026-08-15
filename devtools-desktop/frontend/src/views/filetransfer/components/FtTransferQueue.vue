<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseProgress from '@/components/base/BaseProgress.vue'
import BaseSelect, { type SelectOption } from '@/components/form/BaseSelect.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import {
  formatEta,
  formatSize,
  type ConflictPolicy,
} from '@/services/modules/filetransfer-service'
import { useFileTransferStore, type FtTransferTask } from '@/stores/file-transfer'

const store = useFileTransferStore()

const conflictOptions: SelectOption[] = [
  { value: 'overwrite', label: '冲突：覆盖' },
  { value: 'skip', label: '冲突：跳过' },
  { value: 'rename', label: '冲突：重命名' },
]

const stateLabel: Record<string, string> = {
  queued: '排队',
  transferring: '传输中',
  done: '完成',
  failed: '失败',
  cancelled: '已取消',
}

function taskPercent(task: FtTransferTask): number {
  if (task.filesTotal) {
    return Math.min(100, Math.round(((task.filesDone + (task.curPercent || 0) / 100) / task.filesTotal) * 100))
  }
  return task.state === 'done' ? 100 : 0
}

function taskTone(task: FtTransferTask): 'action' | 'success' | 'danger' {
  if (task.state === 'done') return 'success'
  if (task.state === 'failed') return 'danger'
  return 'action'
}

function isActive(task: FtTransferTask) {
  return task.state === 'queued' || task.state === 'transferring'
}

function meta(task: FtTransferTask) {
  if (isActive(task)) {
    return `${task.filesDone}/${task.filesTotal || '?'} · ${formatSize(task.speed)}/s · 剩 ${formatEta(task.etaSec)}`
  }
  return `${task.filesDone}/${task.filesTotal || task.filesDone}`
}

const tasks = computed(() => store.taskList)
</script>

<template>
  <section class="ft-queue">
    <header class="ft-queue-head">
      <span class="ft-queue-title">
        传输队列
        <span class="ft-queue-count">{{ tasks.length }}</span>
      </span>
      <div class="ft-queue-actions">
        <BaseSelect
          class="ft-queue-actions__policy"
          size="sm"
          :model-value="store.conflictPolicy"
          :options="conflictOptions"
          aria-label="冲突策略"
          @update:model-value="store.conflictPolicy = $event as ConflictPolicy"
        />
        <BaseButton
          size="sm"
          variant="outline"
          :disabled="!store.hasFinishedTasks"
          @click="store.clearFinished()"
        >
          清除已完成
        </BaseButton>
        <BaseButton
          size="sm"
          variant="danger"
          :disabled="!store.hasActiveTasks"
          @click="store.cancelAll()"
        >
          全部取消
        </BaseButton>
      </div>
    </header>
    <div class="ft-queue-body">
      <div v-if="!tasks.length" class="ft-pane-state">
        <EmptyState
          title="暂无传输任务"
          description="右键文件 → 上传到远程 / 下载到本地，进度在此显示。"
        />
      </div>
      <div v-else class="ft-queue-list">
        <div
          v-for="task in tasks"
          :key="task.taskId"
          class="ft-task"
          :class="{ 'is-done': task.state === 'done', 'is-failed': task.state === 'failed' }"
        >
          <span class="ft-task-icon" aria-hidden="true">
            <svg v-if="task.direction === 'upload'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </span>
          <div class="ft-task-main">
            <div class="ft-task-name">
              {{ task.curName || (task.direction === 'upload' ? '上传' : '下载') }}
              <span class="ft-task-state">{{ stateLabel[task.state] || task.state }}</span>
            </div>
            <BaseProgress
              :value="taskPercent(task)"
              :tone="taskTone(task)"
              :processing="isActive(task) && taskPercent(task) < 100"
              :stroke-width="5"
              rail="visible"
            />
          </div>
          <span class="ft-task-meta">{{ meta(task) }}</span>
          <BaseButton
            v-if="isActive(task)"
            size="sm"
            variant="danger"
            @click="store.cancelTask(task.taskId)"
          >
            取消
          </BaseButton>
          <BaseIconButton
            v-else
            label="移除"
            size="sm"
            @click="store.removeTask(task.taskId)"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </BaseIconButton>
        </div>
      </div>
    </div>
  </section>
</template>
