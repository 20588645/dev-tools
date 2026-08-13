<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import ProjectCard, { type ProjectCardStatus } from '@/components/cards/ProjectCard.vue'
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
const uptime = computed(() => {
  // 依赖 tick 以便轮询时重算（WS 不会为「时长变化」推送）
  void props.tick
  return props.job ? formatUptime(props.job.startedAt) : ''
})
/** 仅完全运行起来后可重启；启动中/停止中禁用，防连点。 */
const canRestart = computed(() => props.job?.status === 'running')

/** 共享 ProjectCard 的状态顶边：运行=青蓝渐变、过渡态=暖橙、端口占用=红、空闲无。 */
const cardStatus = computed<ProjectCardStatus>(() => {
  if (props.job) return props.job.status === 'running' ? 'running' : 'building'
  if (props.alert) return 'failed'
  return 'idle'
})

const badge = computed<{ tone: 'info' | 'warning' | 'danger' | 'neutral'; text: string }>(() => {
  const job = props.job
  if (job) {
    if (job.status === 'running') return { tone: 'info', text: '● 运行中' }
    return { tone: 'warning', text: `◌ ${formatJobStateLabel(job)}` }
  }
  if (props.alert) return { tone: 'danger', text: '⚠ 端口占用' }
  return { tone: 'neutral', text: '◦ 未运行' }
})

/** 贴底一行状态便签（原型 .up）：运行时长 / 过渡说明 / 占用详情 / 空闲提示。 */
const footnote = computed(() => {
  const job = props.job
  if (job) {
    if (job.status === 'running') return `已运行 ${uptime.value} · PID ${job.pid ?? '—'} · ${formatJobUrl(job)}`
    return job.status === 'stopping' ? '正在结束进程' : '等待服务监听端口'
  }
  if (props.alert) return `端口 ${props.alert.port} 被 ${props.alert.command}（PID ${props.alert.pid}）占用`
  return '尚未运行 · 启动时可选择模块与命令'
})

/** 模块标签行只展示前 3 个，其余折进 +N，避免标签换行把卡片顶高。 */
const MODULE_TAG_LIMIT = 3
const visibleModules = computed(() => props.project.modules.slice(0, MODULE_TAG_LIMIT).map(item => item.name))
const hiddenModuleCount = computed(() => Math.max(0, props.project.modules.length - visibleModules.value.length))

/** 端口标签（原型 :13900）：优先取运行实态，其次取配置的固定端口。 */
const portLabel = computed(() => {
  const port = props.job?.port || props.project.runPort
  return port ? `:${port}` : ''
})

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
  <ProjectCard
    class="run-card"
    :data-project="project.name"
    :status="cardStatus"
    :name="project.displayName"
    :path="project.path"
    :aria-label="`${project.displayName} 运行卡片`"
  >
    <template #name><span :title="project.path">{{ project.displayName }}</span></template>
    <template #badge>
      <BaseBadge :tone="badge.tone">{{ badge.text }}</BaseBadge>
    </template>

    <template #meta>
      <div class="run-card__tags">
        <span class="run-card__tag">{{ isMulti ? '多模块' : '单体' }}</span>
        <span class="run-card__tag">{{ project.tool }}</span>
        <span class="run-card__tag">{{ nodeLabel }}</span>
        <template v-if="isMulti">
          <span v-for="name in visibleModules" :key="name" class="run-card__tag is-soft">{{ name }}</span>
          <span v-if="hiddenModuleCount > 0" class="run-card__more">+{{ hiddenModuleCount }}</span>
        </template>
        <span v-if="portLabel" class="run-card__tag">{{ portLabel }}</span>
      </div>
    </template>

    <template #footnote>{{ footnote }}</template>

    <template #actions>
      <template v-if="job">
        <BaseButton variant="danger" size="sm" @click="emit('stop')">停止</BaseButton>
        <BaseButton variant="primary" size="sm" @click="emit('open')">打开地址</BaseButton>
        <BaseDropdownMenu :options="runningMenuOptions" @select="onRunningMenuSelect">
          <BaseIconButton label="更多操作">⋯</BaseIconButton>
        </BaseDropdownMenu>
      </template>
      <template v-else-if="alert">
        <BaseButton variant="secondary" size="sm" @click="emit('release')">释放并启动</BaseButton>
        <BaseButton variant="primary" size="sm" @click="emit('start')">启动</BaseButton>
        <BaseButton variant="secondary" size="sm" @click="emit('configure')">配置</BaseButton>
      </template>
      <template v-else>
        <BaseButton variant="primary" size="sm" @click="emit('start')">启动运行</BaseButton>
        <BaseButton variant="secondary" size="sm" @click="emit('configure')">配置</BaseButton>
      </template>
    </template>
  </ProjectCard>
</template>

<style scoped>
/* 标签只保留一行：多出的模块名靠 +N 表达，不许换行顶高卡片 */
.run-card__tags {
  display: flex;
  overflow: hidden;
  min-width: 0;
  max-height: 22px;
  flex: 1 1 auto;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

/* 原型 .tag：统一 mono 小标签 */
.run-card__tag {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: 10px;
  white-space: nowrap;
}

.run-card__tag.is-soft {
  color: var(--color-text-subtle);
}

.run-card__more {
  flex: 0 0 auto;
  color: var(--color-action);
  font-size: 10px;
}
</style>
