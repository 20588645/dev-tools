<script setup lang="ts">
import { computed, onActivated, onBeforeUnmount, onMounted, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import BaseSegmented, { type SegmentOption } from '@/components/navigation/BaseSegmented.vue'
import BaseDropdownMenu, { type DropdownMenuOption } from '@/components/overlay/BaseDropdownMenu.vue'
import GroupRenameDialog from '@/components/overlay/GroupRenameDialog.vue'
import { onProjectsChanged, requestAddProject } from '@/views/deploy/add-project-events'
import { getNodeRuntime, type Project } from '@/services/modules/project-service'
import { useNotificationStore } from '@/stores/notification'

import RunConfigDialog, { type RunConfigMode, type RunConfigSubmit } from './components/RunConfigDialog.vue'
import RunGroupSection from './components/RunGroupSection.vue'
import RunHistoryDialog from './components/RunHistoryDialog.vue'
import RunProjectCard from './components/RunProjectCard.vue'
import RunReleaseDialog from './components/RunReleaseDialog.vue'
import { useRunActions } from './composables/useRunActions'
import { useRunPage, type RunFilter } from './composables/useRunPage'
import { useRunRealtime } from './composables/useRunRealtime'

defineOptions({ name: 'RunView' })

const page = useRunPage()
const { store } = page
const actions = useRunActions()
const notify = useNotificationStore()

const configProject = ref<Project | null>(null)
const configMode = ref<RunConfigMode>('start')
const configSubmitting = ref(false)
const historyOpen = ref(false)
const renamingGroup = ref<string | null>(null)
const renameSubmitting = ref(false)
const nodeVersions = ref<string[]>([])
const currentNodeVersion = ref('')

/** 启动模式下要展示的收藏模块（含按需带上的首页模块）。 */
const configFavorites = computed(() => (
  configProject.value ? page.favoriteModulesOf(configProject.value) : []
))

function openConfig(project: Project, mode: RunConfigMode) {
  configMode.value = mode
  configProject.value = project
}

function closeConfig() {
  configProject.value = null
}

/**
 * 弹窗提交：先落配置，再按模式决定是否启动。
 * 配置先落库是刻意的——启动失败时用户改过的命令/端口不该白填一次。
 */
async function onConfigSubmit(value: RunConfigSubmit) {
  const project = configProject.value
  if (!project) return
  configSubmitting.value = true
  try {
    await page.saveConfig(project.name, value.patch)
    if (value.launchModules === null) {
      closeConfig()
      notify.push(`已保存 ${project.displayName} 的运行配置`, 'success')
      return
    }
    closeConfig()
    await actions.start(project, {
      projectName: project.name,
      command: value.patch.runCommand,
      moduleNames: value.launchModules,
      nodeVersion: value.patch.nodeVersion,
      autoRestart: value.autoRestart,
      // F3：显式填写的端口强制覆盖后端推断
      port: value.patch.runPort || undefined,
    })
  } catch (cause) {
    notify.push(`保存配置失败：${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
  } finally {
    configSubmitting.value = false
  }
}

async function onRenameGroup(name: string) {
  const from = renamingGroup.value
  if (!from) return
  renameSubmitting.value = true
  try {
    await page.renameGroup(from, name)
    renamingGroup.value = null
    notify.push(`分组已重命名：${from} → ${name}`, 'success')
  } catch (cause) {
    notify.push(`重命名失败：${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
  } finally {
    renameSubmitting.value = false
  }
}


/** tick 驱动卡片「运行时长」重算——WS 不会为时长变化推送。 */
const { tick } = useRunRealtime({
  onStatus: ({ job, active }) => {
    actions.syncLogStatus(job)
    // 异常退出且带端口时顺手做一次占用诊断，让卡片直接给出可操作的下一步
    if (!active && job.status === 'error' && job.port) void store.diagnosePort(job.projectName, job.port)
  },
  onLog: ({ id, text, type }) => actions.appendLog(id, text, type),
})

/** 原型 .seg 分段筛选：标签随统计带数量（全部 8 / 运行中 1 …）。 */
const filterOptions = computed<SegmentOption[]>(() => {
  const stats = page.stats.value
  return [
    { label: `全部 ${stats.total}`, value: 'all' },
    { label: `运行中 ${stats.running}`, value: 'running' },
    { label: `多模块 ${stats.multiModule}`, value: 'multi' },
    { label: `单体项目 ${stats.total - stats.multiModule}`, value: 'single' },
  ]
})

/** 原型页头副题：把三个统计数并进一句摘要，不再占一行大卡。 */
const headerSummary = computed(() => {
  if (page.loading.value) return '正在加载项目…'
  const stats = page.stats.value
  return `${stats.total} 个项目 · ${stats.running} 运行中 · ${stats.multiModule} 多模块`
})

/**
 * P1：窄窗口下「全部停止」出现会把工具栏顶成两行、挤掉「运行历史」。
 * 改为把这两个入口收进同一个溢出菜单，工具栏高度恒定一行。
 */
const overflowOptions = computed<DropdownMenuOption[]>(() => {
  const options: DropdownMenuOption[] = [{ label: '📋 运行历史', key: 'history' }]
  if (store.hasRunning) options.push({ label: `■ 全部停止（${store.runningCount}）`, key: 'batch-stop' })
  return options
})

/*
  「添加项目」与部署面板共用同一个弹窗（迁移前两页页头都是 onclick="showAddProject()"）。
  弹窗随 MigrationHost 常驻，故直接发请求事件，不必向上抛给挂载方。
 */

function onOverflowSelect(key: string) {
  if (key === 'history') historyOpen.value = true
  else if (key === 'batch-stop') void actions.batchStop()
}

/**
 * 卡片「▶ 启动」：多模块需要选模块，交给配置弹窗（第 4 步）；
 * 单体项目意图明确，直接启动。
 */
function onStart(project: Project) {
  // 多模块必须先选模块，走启动弹窗；单体意图明确，直接启动
  if (project.type === 'multi-module') {
    openConfig(project, 'start')
    return
  }
  void actions.start(project, {
    projectName: project.name,
    command: page.commandOf(project),
    moduleNames: [],
    nodeVersion: project.nodeVersion,
    // F3：显式填写的端口强制覆盖后端推断
    port: project.runPort || undefined,
  })
}

/** 强释后的启动意图：多模块取收藏模块，收藏为空则不自动启动（交由用户选）。 */
function resolveIntent(projectName: string) {
  const project = page.projectOf(projectName)
  if (!project) return null
  const moduleNames = project.type === 'multi-module' ? page.favoriteModulesOf(project) : []
  if (project.type === 'multi-module' && moduleNames.length === 0) return null
  return {
    projectName: project.name,
    command: page.commandOf(project),
    moduleNames,
    nodeVersion: project.nodeVersion,
    port: project.runPort || undefined,
  }
}

/** 添加项目弹窗不是本页的子组件（随应用常驻），添加完成后靠事件通知刷新。 */
let stopProjectsChanged: (() => void) | null = null

onMounted(async () => {
  void page.load()
  stopProjectsChanged = onProjectsChanged(() => { void page.load({ silent: true }) })
  try {
    const runtime = await getNodeRuntime()
    nodeVersions.value = runtime.versions
    currentNodeVersion.value = runtime.current
  } catch {
    // 拿不到版本列表时仍可用「系统默认」，不阻塞页面
    nodeVersions.value = []
  }
})

onBeforeUnmount(() => {
  stopProjectsChanged?.()
})

/**
 * 组件被 KeepAlive 缓存，重新进入页面时不会再走 onMounted。
 * 旧实现每次 switchPage('run') 都重拉项目，这里靠 onActivated 保持等价——
 * 否则在别处（如部署页）改了项目分组/命令后回到本页仍是旧数据。
 */
onActivated(() => { void page.load({ silent: true }) })
</script>

<template>
  <PageFrame>
    <template #top>
      <PageTop>
        <PageHeader title="本地运行" :description="headerSummary">
          <template #icon>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" /><line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </template>
          <template #actions>
            <BaseButton variant="primary" @click="requestAddProject()">+ 添加项目</BaseButton>
          </template>
        </PageHeader>
        <PageToolbar>
          <div class="run-toolbar__search">
            <BaseInput v-model="page.query.value" placeholder="搜索可运行项目..." clearable />
          </div>
          <BaseSegmented
            :model-value="page.filter.value"
            :options="filterOptions"
            aria-label="按运行状态或项目类型筛选"
            @update:model-value="page.filter.value = ($event as RunFilter)"
          />
          <BaseDropdownMenu :options="overflowOptions" @select="onOverflowSelect">
            <BaseButton variant="secondary" aria-label="更多操作" title="运行历史与批量操作">⋯</BaseButton>
          </BaseDropdownMenu>
        </PageToolbar>
      </PageTop>
    </template>

    <LoadingState v-if="page.loading.value" title="正在加载项目" />
    <ErrorState
      v-else-if="page.error.value"
      title="加载项目失败"
      :description="page.error.value"
    >
      <template #actions>
        <BaseButton variant="secondary" @click="page.load()">重试</BaseButton>
      </template>
    </ErrorState>

    <template v-else>
      <EmptyState
        v-if="page.projects.value.length === 0"
        title="还没有可运行的项目"
        description="点击右上角「+ 添加项目」开始"
      >
        <template #actions>
          <BaseButton variant="primary" @click="requestAddProject()">+ 添加项目</BaseButton>
        </template>
      </EmptyState>
      <EmptyState v-else-if="page.filtered.value.length === 0" title="没有匹配的项目" compact />

      <div v-else-if="page.useGroupedLayout.value" class="run-groups">
        <RunGroupSection
          v-for="group in page.groupViews.value"
          :key="group.key"
          :group="group"
          @toggle="page.toggleGroup(group.key)"
          @move="page.moveGroup(group.key, $event)"
          @rename="renamingGroup = group.key"
        >
          <RunProjectCard
            v-for="project in group.projects"
            :key="project.name"
            :project="project"
            :job="store.jobOf(project.name)"
            :alert="store.alertOf(project.name)"
            :command="page.commandOf(project)"
            :tick="tick"
            @start="onStart(project)"
            @configure="openConfig(project, 'config')"
            @stop="actions.stop(project.name)"
            @restart="actions.restart(project.name)"
            @logs="actions.showLogs(project.name)"
            @open="actions.openUrls(project.name)"
            @release="actions.requestRelease(project.name)"
          />
        </RunGroupSection>
      </div>

      <div v-else class="run-grid">
        <RunProjectCard
          v-for="project in page.filtered.value"
          :key="project.name"
          :project="project"
          :job="store.jobOf(project.name)"
          :alert="store.alertOf(project.name)"
          :command="page.commandOf(project)"
          :tick="tick"
          @start="onStart(project)"
          @configure="openConfig(project, 'config')"
          @stop="actions.stop(project.name)"
          @restart="actions.restart(project.name)"
          @logs="actions.showLogs(project.name)"
          @open="actions.openUrls(project.name)"
          @release="actions.requestRelease(project.name)"
        />
      </div>
    </template>

    <RunReleaseDialog
      :request="actions.releaseConfirm.value"
      @cancel="actions.cancelRelease()"
      @confirm="actions.confirmRelease(resolveIntent)"
    />
    <RunConfigDialog
      :project="configProject"
      :mode="configMode"
      :node-versions="nodeVersions"
      :current-node-version="currentNodeVersion"
      :group-names="page.groupNames.value"
      :favorite-modules="configFavorites"
      :submitting="configSubmitting"
      @close="closeConfig"
      @submit="onConfigSubmit"
    />
    <RunHistoryDialog :open="historyOpen" @close="historyOpen = false" />
    <GroupRenameDialog
      :group-key="renamingGroup"
      :existing-names="page.groupNames.value"
      :submitting="renameSubmitting"
      @close="renamingGroup = null"
      @submit="onRenameGroup"
    />
  </PageFrame>
</template>

<style scoped>
.run-toolbar__search { flex: 1 1 260px; max-width: 360px; min-width: 0; }

/* 自适应列宽，避免固定列宽在少量项目时留大片空白（P6） */
.run-grid {
  display: grid;
  align-items: stretch;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.run-grid > :only-child { max-width: 420px; }

/* 组间比组内松，让「标题 + 卡片」成为一个视觉整体 */
.run-groups {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
</style>
