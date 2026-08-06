<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseEntityCard from '@/components/base/BaseEntityCard.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
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

/**
 * 四种状态统一成「主行 + 细节行」，交给公共卡片的两行状态区渲染。
 * 行数固定后卡片高度与状态无关，异常态不会把同排卡片顶高。
 */
const state = computed<{ tone: 'neutral' | 'active' | 'warning', line: string, detail: string }>(() => {
  const job = props.job
  if (job) {
    const running = job.status === 'running'
    return {
      tone: running ? 'active' : 'neutral',
      line: `${formatJobStateLabel(job)} · ${formatJobUrl(job)}`,
      detail: running
        ? `PID ${job.pid ?? '—'} · 已运行 ${uptime.value}`
        : '等待服务监听端口',
    }
  }
  if (props.alert) {
    return {
      tone: 'warning',
      line: `端口 ${props.alert.port} 被占用`,
      detail: `${props.alert.command} · PID ${props.alert.pid} · 可释放后启动`,
    }
  }
  return { tone: 'neutral', line: '尚未运行', detail: '启动时可选择模块与命令' }
})

/** 模块标签行只展示前 3 个，其余折进 +N，避免标签换行把卡片顶高。 */
const MODULE_TAG_LIMIT = 3
const visibleModules = computed(() => props.project.modules.slice(0, MODULE_TAG_LIMIT).map(item => item.name))
const hiddenModuleCount = computed(() => Math.max(0, props.project.modules.length - visibleModules.value.length))


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
  <BaseEntityCard
    class="run-card"
    :data-project="project.name"
    density="compact"
    surface="sheen"
    fill-height
    body-align="stretch"
    actions-layout="spread"
    status-placement="body"
    :status-tone="state.tone"
    :aria-label="`${project.displayName} 运行卡片`"
  >
    <template #icon>
      <span class="run-card__icon" aria-hidden="true">
        <!-- 分层方块表示多模块、单页文档表示单体；不用 emoji，跨系统渲染一致 -->
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
    <!-- 卡片不再单独占一行显示路径，但保留悬浮全名便于确认是哪个目录 -->
    <template #title><span :title="project.path">{{ project.displayName }}</span></template>
    <template #headerExtra>
      <span class="run-card__kind">{{ isMulti ? '多模块' : '单体' }}</span>
    </template>

    <!-- 工具与版本描述同一件事，合并成一枚双段徽标，不与模块标签抢视觉重量 -->
    <div class="run-card__meta">
      <span class="run-card__stack">
        <span class="run-card__stack-name">{{ project.tool }}</span>
        <span class="run-card__stack-ver">{{ nodeLabel }}</span>
      </span>
    </div>
    <!--
      多模块列出前几个模块名，数量由 +N 表达，不再在头部重复一次；
      单体项目没有模块行，改用启动命令补位，两种卡片的行数节奏一致。
    -->
    <div v-if="isMulti" class="run-card__mods">
      <span v-for="name in visibleModules" :key="name" class="run-card__mod">{{ name }}</span>
      <span v-if="hiddenModuleCount > 0" class="run-card__mods-more">+{{ hiddenModuleCount }}</span>
    </div>
    <div v-else class="run-card__command">
      <code :title="command">{{ command }}</code>
    </div>

    <template #status>{{ state.line }}</template>
    <template #statusDetail>{{ state.detail }}</template>

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
  </BaseEntityCard>
</template>

<style scoped>
/* 内高光 + 微渐变让图标像有厚度的物件，而不是平面色块 */
.run-card__icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--component-entity-card-icon-face);
  box-shadow: var(--component-entity-card-edge);
  color: var(--color-text-muted);
}

.run-card__icon svg {
  display: block;
}

.run-card__kind {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  color: var(--color-text-subtle);
  font-size: 10px;
  white-space: nowrap;
}

.run-card__meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
}

/* 双段徽标：左段是工具名、右段是版本号，中间一条分隔线 */
.run-card__stack {
  display: inline-flex;
  overflow: hidden;
  flex: 0 0 auto;
  align-items: stretch;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--component-entity-card-edge);
}

.run-card__stack-name {
  padding: 2px 7px;
  background: var(--component-entity-card-panel);
  color: var(--color-text-muted);
  font-size: 10px;
  white-space: nowrap;
}

.run-card__stack-ver {
  padding: 2px 7px;
  border-left: 1px solid var(--color-border);
  color: var(--color-text-subtle);
  font-family: var(--font-family-mono);
  font-size: 10px;
  white-space: nowrap;
}

/*
  模块标签不加边框，只留浅底：它们从属于工具版本，
  同样的边框会让两行抢一样的视觉重量。
*/
.run-card__mods {
  display: flex;
  overflow: hidden;
  min-width: 0;
  max-height: 22px;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.run-card__mod {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
  background: var(--component-entity-card-panel);
  color: var(--color-text-subtle);
  font-size: 10px;
  white-space: nowrap;
}

.run-card__mods-more {
  flex: 0 0 auto;
  padding: 2px 6px;
  color: var(--color-action);
  font-size: 10px;
}

/*
  命令区用左竖线加极淡面表达「终端片段」，
  不再套一层完整边框，避免卡片里出现框中框。
*/
.run-card__command {
  min-width: 0;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  background: var(--component-entity-card-panel);
  /* 竖线带一点动作色，让它读起来像终端提示符区而不是普通浅底块 */
  box-shadow: inset 2px 0 0 color-mix(in srgb, var(--color-action) 42%, var(--color-border));
}

.run-card__command code {
  display: block;
  overflow: hidden;
  color: var(--color-text);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-card__command code::before {
  color: var(--color-text-subtle);
  content: "$ ";
}

</style>
