<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import BaseDropdownMenu, { type DropdownMenuOption } from '@/components/overlay/BaseDropdownMenu.vue'
import type { Project } from '@/services/modules/project-service'
import type { RunJob } from '@/services/modules/run-service'
import type { PortAlert } from '@/stores/run'

import { formatJobStateLabel, formatJobUrl, formatUptime } from '../run-format'

defineOptions({ name: 'RunProjectCard' })

const props = defineProps<{
  project: Project
  job: RunJob | null
  alert: PortAlert | null
  command: string
  /** 轮询滴答，变化时触发运行时长重算。 */
  tick: number
}>()

const emit = defineEmits<{
  start: []
  configure: []
  stop: []
  restart: []
  logs: []
  open: []
  release: []
}>()

const isMulti = computed(() => props.project.type === 'multi-module')
const nodeLabel = computed(() => props.project.nodeVersion || '系统默认')
const url = computed(() => formatJobUrl(props.job))
const uptime = computed(() => {
  // 依赖 tick 以便轮询时重算（WS 不会为「时长变化」推送）
  void props.tick
  return props.job ? formatUptime(props.job.startedAt) : ''
})
/** 仅完全运行起来后可重启；启动中/停止中禁用，防连点。 */
const canRestart = computed(() => props.job?.status === 'running')

/** P2：窄窗口下把次要操作收进菜单，避免四个按钮换行把「打开地址」挤到第二行。 */
const runningMenuOptions = computed<DropdownMenuOption[]>(() => [
  { label: '查看日志', key: 'logs' },
  { label: canRestart.value ? '重启服务' : '重启服务（需运行中）', key: 'restart', disabled: !canRestart.value },
])

function onRunningMenuSelect(key: string) {
  if (key === 'logs') emit('logs')
  else if (key === 'restart') emit('restart')
}
</script>

<template>
  <BaseCard
    class="run-card"
    :data-project="project.name"
    content-layout="column"
    fill-height
  >
    <header class="run-card__head">
      <h3 class="run-card__title" :title="project.displayName">
        <span aria-hidden="true">{{ isMulti ? '📦' : '📄' }}</span>
        {{ project.displayName }}
      </h3>
      <BaseBadge :tone="isMulti ? 'info' : 'success'">{{ isMulti ? '多模块' : '单体' }}</BaseBadge>
    </header>

    <p class="run-card__path" :title="project.path">{{ project.path }}</p>

    <div class="run-card__meta">
      <span>{{ project.tool }}</span>
      <span>{{ nodeLabel }}</span>
      <span v-if="isMulti">{{ project.modules.length }} 个模块</span>
    </div>

    <div class="run-card__command">
      <span class="run-card__command-label">启动命令</span>
      <code>{{ command }}</code>
    </div>

    <div class="run-card__state" :data-tone="job ? 'active' : alert ? 'alert' : 'idle'">
      <template v-if="job">
        <StatusIndicator
          class="run-card__state-line"
          :status="job.status === 'running' ? 'online' : 'checking'"
          :label="`${formatJobStateLabel(job)} · ${url}`"
        />
        <p class="run-card__state-sub">PID {{ job.pid ?? '—' }} · {{ uptime }}</p>
      </template>
      <template v-else-if="alert">
        <p class="run-card__state-line">
          <span aria-hidden="true">⚠️</span> 端口被占用
        </p>
        <p class="run-card__state-sub">
          端口 {{ alert.port }} 被 <code>{{ alert.command }}</code> (PID {{ alert.pid }}) 占用
        </p>
      </template>
      <template v-else>
        <p class="run-card__state-line">○ 尚未运行</p>
        <p class="run-card__state-sub">点击启动可配置命令和模块</p>
      </template>
    </div>

    <footer class="run-card__actions">
      <template v-if="job">
        <BaseButton variant="danger" size="sm" @click="emit('stop')">■ 停止</BaseButton>
        <BaseButton variant="primary" size="sm" @click="emit('open')">打开地址</BaseButton>
        <BaseDropdownMenu :options="runningMenuOptions" @select="onRunningMenuSelect">
          <BaseButton variant="secondary" size="sm" aria-label="更多操作" title="更多操作">⋯</BaseButton>
        </BaseDropdownMenu>
      </template>
      <template v-else-if="alert">
        <!-- P3：不再让三个按钮平分固定宽度，长标签由内容撑开、必要时换行 -->
        <BaseButton variant="secondary" size="sm" class="run-card__release" @click="emit('release')">
          ⚡ 释放并启动
        </BaseButton>
        <BaseButton variant="primary" size="sm" @click="emit('start')">▶ 启动</BaseButton>
        <BaseButton variant="secondary" size="sm" @click="emit('configure')">配置</BaseButton>
      </template>
      <template v-else>
        <BaseButton variant="primary" size="sm" @click="emit('start')">▶ 启动运行</BaseButton>
        <BaseButton variant="secondary" size="sm" @click="emit('configure')">配置</BaseButton>
      </template>
    </footer>
  </BaseCard>
</template>

<style scoped>
.run-card {
  gap: var(--space-2);
}

.run-card__head {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
}

.run-card__title {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-card__path {
  margin: 0;
  overflow: hidden;
  color: var(--color-text-subtle);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.run-card__meta span {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.run-card__command {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.run-card__command-label {
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
}

.run-card__command code {
  display: block;
  overflow: hidden;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-subtle);
  color: var(--color-action);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-card__state {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-subtle);
}

.run-card__state[data-tone="active"] {
  border-color: color-mix(in srgb, var(--color-success) 34%, transparent);
  background: color-mix(in srgb, var(--color-success) 10%, transparent);
}

.run-card__state[data-tone="alert"] {
  border-color: color-mix(in srgb, var(--color-warning) 38%, transparent);
  background: color-mix(in srgb, var(--color-warning) 12%, transparent);
}

.run-card__state-line {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  margin: 0;
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-card__state[data-tone="active"] .run-card__state-line { color: var(--color-success); }
.run-card__state[data-tone="alert"] .run-card__state-line { color: var(--color-warning); }

.run-card__state-sub {
  margin: 0;
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
}

.run-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: auto;
  padding-top: var(--space-1);
}

/* 主操作占据剩余宽度，次要操作按内容宽——长标签不再被截断（P3） */
.run-card__actions > :not(:last-child) { flex: 1 1 auto; min-width: 0; }
.run-card__release { flex: 1 1 100%; }
</style>
