<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseEntityCard from '@/components/base/BaseEntityCard.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import type { LastDeployInfo } from '@/services/modules/deploy-service'
import { projectDefaultServerIds, type Project } from '@/services/modules/project-service'

import { formatDeployAgo } from '../deploy-format'

defineOptions({ name: 'DeployProjectCard' })

const props = defineProps<{
  project: Project
  last: LastDeployInfo | null
  /** 构建/部署进行中：禁用操作并给出查看进度入口。 */
  busy: boolean
}>()

const emit = defineEmits<{
  build: []
  deploy: []
  configure: []
  remove: []
  progress: []
}>()

const isMulti = computed(() => props.project.type === 'multi-module')
const moduleCount = computed(() => props.project.modules.length)
const serverCount = computed(() => projectDefaultServerIds(props.project).length)
const nodeLabel = computed(() => props.project.nodeVersion || '系统默认')
const buildCommand = computed(() => props.project.buildCommand || 'npm run build')

/** 模块标签只列前 3 个，其余折进 +N（与本地运行页一致）。 */
const MODULE_TAG_LIMIT = 3
const visibleModules = computed(() => props.project.modules.slice(0, MODULE_TAG_LIMIT).map(item => item.name))
const hiddenModuleCount = computed(() => Math.max(0, moduleCount.value - visibleModules.value.length))

/**
 * 状态区固定两行：主行讲服务器配置，细节行讲最近一次构建/部署。
 * 行数固定后卡片高度与状态无关，未配置服务器的卡片不会矮一截（修 D4）。
 */
const state = computed<{ tone: 'neutral' | 'active' | 'warning', line: string, detail: string }>(() => {
  const line = serverCount.value > 0 ? `已配置 ${serverCount.value} 台服务器` : '未配置服务器'
  const last = props.last
  if (!last) {
    return { tone: serverCount.value > 0 ? 'active' : 'neutral', line, detail: '暂无构建/部署记录' }
  }
  const kind = last.type === 'deploy' ? '部署' : '构建'
  const target = last.type === 'deploy' && last.serverName ? ` → ${last.serverName}` : ''
  const modules = last.modules.length > 0 ? ` · ${last.modules.join(', ')}` : ''
  return {
    tone: last.status === 'success' ? 'active' : 'warning',
    line,
    detail: `${formatDeployAgo(last.timestamp)} · ${kind}${target}${modules} · ${last.duration}`,
  }
})
</script>

<template>
  <BaseEntityCard
    class="deploy-card"
    :class="{ 'is-busy': busy }"
    :data-project="project.name"
    density="compact"
    surface="sheen"
    fill-height
    body-align="stretch"
    actions-layout="spread"
    status-placement="body"
    :status-tone="state.tone"
    :aria-label="`${project.displayName} 部署卡片`"
  >
    <template #icon>
      <span class="deploy-card__icon" aria-hidden="true">
        <!-- 分层方块表示多模块、单页文档表示单体；不用 emoji，跨系统渲染一致（修 D5） -->
        <svg
          v-if="isMulti"
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" /><path d="M3 12.5 12 17l9-4.5" /><path d="M3 17 12 21.5 21 17" />
        </svg>
        <svg
          v-else
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" />
        </svg>
      </span>
    </template>
    <template #title><span :title="project.path">{{ project.displayName }}</span></template>
    <template #headerExtra>
      <span class="deploy-card__kind">{{ isMulti ? '多模块' : '单体' }}</span>
    </template>

    <!-- 工具与版本描述同一件事，合并成一枚双段徽标 -->
    <div class="deploy-card__meta">
      <span class="deploy-card__stack">
        <span class="deploy-card__stack-name">{{ project.tool }}</span>
        <span class="deploy-card__stack-ver">{{ nodeLabel }}</span>
      </span>
    </div>
    <div v-if="isMulti" class="deploy-card__mods">
      <span v-for="name in visibleModules" :key="name" class="deploy-card__mod">{{ name }}</span>
      <span v-if="hiddenModuleCount > 0" class="deploy-card__mods-more">+{{ hiddenModuleCount }}</span>
    </div>
    <div v-else class="deploy-card__command">
      <code :title="buildCommand">{{ buildCommand }}</code>
    </div>

    <template #status>{{ state.line }}</template>
    <template #statusDetail>{{ state.detail }}</template>

    <template #actions>
      <!-- 进行中只留查看进度：其余操作此时都会被后端拒绝，露出来只会误导 -->
      <BaseButton v-if="busy" variant="secondary" size="sm" @click="emit('progress')">
        查看进度…
      </BaseButton>
      <template v-else>
        <BaseButton variant="secondary" size="sm" @click="emit('build')">构建</BaseButton>
        <BaseButton variant="primary" size="sm" @click="emit('deploy')">部署</BaseButton>
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
  </BaseEntityCard>
</template>

<style scoped>
.deploy-card__icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--component-entity-card-icon-face);
  box-shadow: var(--component-entity-card-edge);
  color: var(--color-text-muted);
}

.deploy-card__icon svg {
  display: block;
}

.deploy-card__kind {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  color: var(--color-text-subtle);
  font-size: 10px;
  white-space: nowrap;
}

.deploy-card__meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
}

/* 双段徽标：左段工具名、右段版本号，中间一条分隔线 */
.deploy-card__stack {
  display: inline-flex;
  overflow: hidden;
  flex: 0 0 auto;
  align-items: stretch;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--component-entity-card-edge);
}

.deploy-card__stack-name {
  padding: 2px 7px;
  background: var(--component-entity-card-panel);
  color: var(--color-text-muted);
  font-size: 10px;
  white-space: nowrap;
}

.deploy-card__stack-ver {
  padding: 2px 7px;
  border-left: 1px solid var(--color-border);
  color: var(--color-text-subtle);
  font-family: var(--font-family-mono);
  font-size: 10px;
  white-space: nowrap;
}

/* 模块标签不加边框，只留浅底：它们从属于工具版本，不该抢同样的视觉重量 */
.deploy-card__mods {
  display: flex;
  overflow: hidden;
  min-width: 0;
  max-height: 22px;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.deploy-card__mod {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  background: var(--component-entity-card-panel);
  color: var(--color-text-subtle);
  font-size: 10px;
  white-space: nowrap;
}

.deploy-card__mods-more {
  flex: 0 0 auto;
  padding: 2px 6px;
  color: var(--color-action);
  font-size: 10px;
}

.deploy-card__command {
  min-width: 0;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--component-entity-card-panel);
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--color-action) 42%, var(--color-border));
}

.deploy-card__command code {
  display: block;
  overflow: hidden;
  color: var(--color-text);
  font-family: var(--font-family-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deploy-card__command code::before {
  color: var(--color-text-subtle);
  content: "$ ";
}

/* 进行中：整卡降低对比度，明确它此刻不接受新操作 */
.deploy-card.is-busy {
  border-color: color-mix(in srgb, var(--color-warning) 38%, var(--color-border));
}
</style>
