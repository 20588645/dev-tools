<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import ProjectCard, { type ProjectCardStatus } from '@/components/cards/ProjectCard.vue'
import type { LastDeployInfo } from '@/services/modules/deploy-service'
import { projectDefaultServerIds, type Project } from '@/services/modules/project-service'

import { formatDeployAgo } from '../deploy-format'

defineOptions({ name: 'DeployProjectCard' })

const props = defineProps<{
  project: Project
  last: LastDeployInfo | null
  /** 构建/部署进行中：禁用操作并给出查看进度入口。 */
  busy: boolean
  /** 分组启用了网关 FileZilla 交接，主按钮改为构建后交接。 */
  handoff?: boolean
  /** 网关模式下该项目是否已填写设备 IP。 */
  handoffReady?: boolean
}>()

const emit = defineEmits<{
  build: []
  deploy: []
  configure: []
  remove: []
  progress: []
}>()

const isMulti = computed(() => props.project.type === 'multi-module')
const serverCount = computed(() => projectDefaultServerIds(props.project).length)
const nodeLabel = computed(() => props.project.nodeVersion || '系统默认')

/** 模块标签只列前 3 个，其余折进 +N（与本地运行页一致）。 */
const MODULE_TAG_LIMIT = 3
const visibleModules = computed(() => props.project.modules.slice(0, MODULE_TAG_LIMIT).map(item => item.name))
const hiddenModuleCount = computed(() => Math.max(0, props.project.modules.length - visibleModules.value.length))

const isLastToday = computed(() => {
  if (!props.last?.timestamp) return false
  const then = new Date(props.last.timestamp)
  const now = new Date()
  return then.getFullYear() === now.getFullYear()
    && then.getMonth() === now.getMonth()
    && then.getDate() === now.getDate()
})

const lastKind = computed(() => props.last?.type === 'deploy' ? '部署' : '构建')

/** 共享 ProjectCard 状态顶边：进行中=暖橙、上次失败=红、今日成功=绿、其余无。 */
const cardStatus = computed<ProjectCardStatus>(() => {
  if (props.busy) return 'building'
  if (!props.last) return 'idle'
  if (props.last.status === 'error') return 'failed'
  return isLastToday.value ? 'ready' : 'idle'
})

const badge = computed<{ tone: 'success' | 'warning' | 'danger' | 'neutral'; text: string }>(() => {
  if (props.busy) return { tone: 'warning', text: '◌ 任务进行中' }
  if (props.last?.status === 'error') return { tone: 'danger', text: `✕ 上次${lastKind.value}失败` }
  if (props.last && isLastToday.value) return { tone: 'success', text: `✓ 今日已${lastKind.value}` }
  return { tone: 'neutral', text: '◦ 空闲' }
})

/**
 * 贴底一行状态便签（原型 dp-sum）：服务器配置 + 最近一次构建/部署。
 * 始终单行，卡片高度与状态无关，未配置服务器的卡片不会矮一截（修 D4）。
 */
const footnote = computed(() => {
  const targetHint = props.handoff
    ? (props.handoffReady ? '已配网关设备' : '未配置网关设备')
    : (serverCount.value > 0 ? `已配 ${serverCount.value} 台服务器` : '未配置服务器')
  if (props.busy) return `${targetHint} · 任务进行中`
  const last = props.last
  if (!last) return `${targetHint} · 暂无构建/部署记录`
  const target = last.type === 'deploy' && last.serverName ? ` → ${last.serverName}` : ''
  const state = last.status === 'success' ? '✓' : '✕'
  return `${targetHint} · ${formatDeployAgo(last.timestamp)} ${lastKind.value}${target} ${state} · ${last.duration}`
})
</script>

<template>
  <ProjectCard
    class="deploy-card"
    :class="{ 'is-busy': busy }"
    :data-project="project.name"
    :status="cardStatus"
    :name="project.displayName"
    :path="project.path"
    :aria-label="`${project.displayName} 部署卡片`"
  >
    <template #name><span :title="project.path">{{ project.displayName }}</span></template>
    <template #badge>
      <BaseBadge :tone="badge.tone">{{ badge.text }}</BaseBadge>
    </template>

    <template #meta>
      <div class="deploy-card__tags">
        <span class="deploy-card__tag">{{ isMulti ? '多模块' : '单体' }}</span>
        <span class="deploy-card__tag">{{ project.tool }}</span>
        <span class="deploy-card__tag">{{ nodeLabel }}</span>
        <template v-if="isMulti">
          <span v-for="name in visibleModules" :key="name" class="deploy-card__tag is-soft">{{ name }}</span>
          <span v-if="hiddenModuleCount > 0" class="deploy-card__more">+{{ hiddenModuleCount }}</span>
        </template>
      </div>
    </template>

    <template #footnote>{{ footnote }}</template>

    <template #actions>
      <!-- 进行中只留查看进度：其余操作此时都会被后端拒绝，露出来只会误导 -->
      <BaseButton v-if="busy" variant="secondary" size="sm" @click="emit('progress')">
        查看进度…
      </BaseButton>
      <template v-else>
        <BaseButton variant="secondary" size="sm" @click="emit('build')">构建</BaseButton>
        <BaseButton variant="primary" size="sm" @click="emit('deploy')">
          {{ handoff ? '交接发布' : '部署' }}
        </BaseButton>
        <BaseIconButton label="默认配置" @click="emit('configure')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </BaseIconButton>
        <BaseIconButton label="移除项目" variant="danger" @click="emit('remove')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </BaseIconButton>
      </template>
    </template>
  </ProjectCard>
</template>

<style scoped>
/* 标签只保留一行：多出的模块名靠 +N 表达，不许换行顶高卡片 */
.deploy-card__tags {
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
.deploy-card__tag {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 6px;
  background: var(--color-surface-subtle);
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: 10px;
  white-space: nowrap;
}

.deploy-card__tag.is-soft {
  color: var(--color-text-subtle);
}

.deploy-card__more {
  flex: 0 0 auto;
  color: var(--color-action);
  font-size: 10px;
}

/* 进行中：整卡边框偏暖，明确它此刻不接受新操作 */
.deploy-card.is-busy {
  border-color: color-mix(in srgb, var(--color-warning) 38%, var(--color-border));
}
</style>
