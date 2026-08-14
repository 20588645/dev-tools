<script setup lang="ts">
import { computed, onBeforeUnmount, onActivated, onMounted, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSegmented, { type SegmentOption } from '@/components/navigation/BaseSegmented.vue'
import GroupRenameDialog from '@/components/overlay/GroupRenameDialog.vue'
import { onProjectsChanged, requestAddProject } from '@/views/deploy/add-project-events'
import { getServers, removeProject as removeProjectRequest, type DeployServer } from '@/services/modules/deploy-service'
import { getNodeRuntime, type Project } from '@/services/modules/project-service'
import { useDeployTaskStore } from '@/stores/deploy-task'
import { useLogTaskStore } from '@/stores/log-task'
import { useNotificationStore } from '@/stores/notification'

import BuildDeployDialog from './components/BuildDeployDialog.vue'
import DeployChrome from './components/DeployChrome.vue'
import DeployGroupSection from './components/DeployGroupSection.vue'
import DeployProjectCard from './components/DeployProjectCard.vue'
import ProjectConfigDialog from './components/ProjectConfigDialog.vue'
import RemoteBrowserDialog from './components/RemoteBrowserDialog.vue'
import { useBuildDeploy } from './composables/useBuildDeploy'
import { useDeployDashboard, type DeployFilter } from './composables/useDeployDashboard'
import { useDeployRealtime } from './composables/useDeployRealtime'
import { useProjectConfig } from './composables/useProjectConfig'
import { useRemoteBrowser } from './composables/useRemoteBrowser'
import './deploy-dashboard.css'

defineOptions({ name: 'DeployDashboardView' })

const page = useDeployDashboard()
const task = useDeployTaskStore()
const log = useLogTaskStore()
const notify = useNotificationStore()

const config = useProjectConfig()
const buildDeploy = useBuildDeploy()
const remoteBrowser = useRemoteBrowser()

const renamingGroup = ref<string | null>(null)
const pendingRemove = ref<Project | null>(null)
/** 配置 / 构建 / 部署弹窗共用的服务器与 Node 版本列表。 */
const servers = ref<DeployServer[]>([])
const nodeVersions = ref<string[]>([])
const currentNodeVersion = ref('')

/** 原型 .seg 分段筛选：标签随统计带数量，取代独立一行的摘要条。 */
const filterOptions = computed<SegmentOption[]>(() => {
  const stats = page.stats.value
  return [
    { label: `全部 ${stats.total}`, value: 'all' },
    { label: `多模块 ${stats.multiModule}`, value: 'multi' },
    { label: `单体项目 ${stats.total - stats.multiModule}`, value: 'single' },
    { label: `已配置 ${stats.configured}`, value: 'configured' },
    { label: `未配置 ${stats.total - stats.configured}`, value: 'unconfigured' },
  ]
})

/** 任务完成后刷新卡片，让「最近部署」摘要跟上。 */
useDeployRealtime({ onFinished: () => void page.load({ silent: true }) })

function askRemove(project: Project) {
  pendingRemove.value = project
}

async function onConfirmRemove() {
  const project = pendingRemove.value
  if (!project) return
  try {
    await removeProjectRequest(project.name)
    pendingRemove.value = null
    notify.push(`已移除 ${project.displayName}`, 'success')
    await page.load({ silent: true })
  } catch (cause) {
    notify.push(`移除失败：${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
  }
}

/**
 * 配置 / 构建 / 部署弹窗的辅助数据。失败不阻塞页面：弹窗里会给空态，
 * Node 下拉退化成只有「系统默认」——与 legacy 取数失败时的表现一致。
 */
async function loadConfigOptions() {
  const [serverList, runtime] = await Promise.all([
    getServers().catch(() => [] as DeployServer[]),
    getNodeRuntime().catch(() => ({ versions: [] as string[], current: '' })),
  ])
  servers.value = serverList
  nodeVersions.value = runtime.versions
  currentNodeVersion.value = runtime.current
}

async function onSubmitConfig() {
  const name = await config.submit()
  if (!name) {
    if (config.error.value) notify.push(`保存失败：${config.error.value}`, 'error')
    return
  }
  notify.push(`${name} 的默认配置已更新`, 'success')
  await page.load({ silent: true })
}

async function onRenameGroup(name: string) {
  const from = renamingGroup.value
  if (!from) return
  try {
    await page.renameGroup(from, name)
    renamingGroup.value = null
    notify.push(`分组已重命名：${from} → ${name}`, 'success')
  } catch (cause) {
    notify.push(`重命名失败：${cause instanceof Error ? cause.message : '未知错误'}`, 'error')
  }
}

function openBuild(project: Project) {
  buildDeploy.openBuild(project)
}

function openDeploy(project: Project) {
  buildDeploy.openDeploy(project, servers.value)
}

async function onSubmitBuildDeploy() {
  await buildDeploy.submit()
}

async function onOpenRemoteBrowser() {
  const target = buildDeploy.remoteBrowserTarget()
  if (!target) {
    notify.push('请先选择至少一个目标服务器', 'warning')
    return
  }
  await remoteBrowser.show(target)
}

function onConfirmRemotePath() {
  const path = remoteBrowser.confirm()
  buildDeploy.applyRemotePath(path)
}

/**
 * 添加项目弹窗随应用常驻（不是本子页的子组件），添加完成后靠事件通知刷新。
 * 监听器不随 deactivated 摘掉：在服务器子页添加项目后，回到本页要已是新数据。
 */
let stopProjectsChanged: (() => void) | null = null

onMounted(() => {
  void page.load()
  void loadConfigOptions()
  stopProjectsChanged = onProjectsChanged(() => { void page.load({ silent: true }) })
})

onBeforeUnmount(() => {
  stopProjectsChanged?.()
})

/**
 * 组件被 KeepAlive 缓存，重新进入子页时不会再走 onMounted。
 * 在别处（如本地运行页）改过分组后回到本页仍需拿到新数据。
 */
onActivated(() => {
  void page.load({ silent: true })
  // 服务器可能在服务器管理子页被增删，回到本页需重新取
  void loadConfigOptions()
})
</script>

<template>
  <DeployChrome>
  <div class="deploy-dashboard" data-test="deploy-dashboard">
    <div class="deploy-dashboard__toolbar">
      <BaseInput
        v-model="page.query.value"
        type="search"
        variant="search"
        class="deploy-dashboard__search"
        aria-label="搜索项目"
        placeholder="搜索项目..."
      />
      <BaseSegmented
        :model-value="page.filter.value"
        :options="filterOptions"
        aria-label="按项目类型或配置状态筛选"
        @update:model-value="page.filter.value = ($event as DeployFilter)"
      />
    </div>

    <LoadingState v-if="page.loading.value" label="正在加载项目…" />
    <ErrorState
      v-else-if="page.error.value"
      title="加载项目失败"
      :description="page.error.value"
      @retry="page.load()"
    />

    <template v-else>
      <EmptyState
        v-if="page.projects.value.length === 0"
        title="还没有项目"
        description="点击右上角「＋ 添加项目」开始"
      >
        <template #actions>
          <BaseButton @click="requestAddProject()">＋ 添加项目</BaseButton>
        </template>
      </EmptyState>
      <EmptyState v-else-if="page.filtered.value.length === 0" title="没有匹配的项目" compact />

      <div v-else-if="page.useGroupedLayout.value" class="deploy-dashboard__groups">
        <DeployGroupSection
          v-for="group in page.groupViews.value"
          :key="group.key"
          :group="group"
          @toggle="page.toggleGroup(group.key)"
          @move="page.moveGroup(group.key, $event)"
          @rename="renamingGroup = group.key"
        >
          <DeployProjectCard
            v-for="project in group.projects"
            :key="project.name"
            :project="project"
            :last="page.lastDeployOf(project.name)"
            :busy="task.isBusy(project.name)"
            @build="openBuild(project)"
            @deploy="openDeploy(project)"
            @configure="config.openFor(project)"
            @progress="log.reopen()"
            @remove="askRemove(project)"
          />
        </DeployGroupSection>
      </div>

      <div v-else class="deploy-dashboard__grid">
        <DeployProjectCard
          v-for="project in page.filtered.value"
          :key="project.name"
          :project="project"
          :last="page.lastDeployOf(project.name)"
          :busy="task.isBusy(project.name)"
          @build="openBuild(project)"
          @deploy="openDeploy(project)"
          @configure="config.openFor(project)"
          @progress="log.reopen()"
          @remove="askRemove(project)"
        />
      </div>
    </template>

    <ConfirmDialog
      :model-value="pendingRemove !== null"
      title="移除项目"
      :message="pendingRemove ? `确认从部署面板移除「${pendingRemove.displayName}」？项目文件不会被删除。` : ''"
      confirm-text="移除"
      tone="danger"
      @update:model-value="!$event && (pendingRemove = null)"
      @confirm="onConfirmRemove"
    />
    <ConfirmDialog
      :model-value="buildDeploy.pendingMultiConfirm.value !== null"
      title="多服务器部署"
      :message="buildDeploy.pendingMultiConfirm.value
        ? `确认同时部署到 ${buildDeploy.pendingMultiConfirm.value.serverIds.length} 台服务器（${buildDeploy.pendingMultiConfirm.value.names}）？`
        : ''"
      confirm-text="全部部署"
      @update:model-value="!$event && buildDeploy.cancelMultiConfirm()"
      @confirm="buildDeploy.confirmMultiDeploy()"
    />
    <GroupRenameDialog
      :group-key="renamingGroup"
      :existing-names="page.groupNames.value"
      @close="renamingGroup = null"
      @submit="onRenameGroup"
    />
    <ProjectConfigDialog
      :project="config.project.value"
      :state="config.state.value"
      :servers="servers"
      :node-versions="nodeVersions"
      :current-node-version="currentNodeVersion"
      :saving="config.saving.value"
      :error="config.error.value"
      @close="config.close()"
      @update:state="config.patch($event)"
      @toggle-server="config.toggleServer($event)"
      @submit="onSubmitConfig"
    />
    <BuildDeployDialog
      :project="buildDeploy.project.value"
      :mode="buildDeploy.mode.value"
      :title="buildDeploy.title.value"
      :subtitle="buildDeploy.subtitle.value"
      :is-multi="buildDeploy.isMulti.value"
      :selected-modules="buildDeploy.selectedModules.value"
      :favorites="buildDeploy.favorites.value"
      :module-filter="buildDeploy.moduleFilter.value"
      :module-query="buildDeploy.moduleQuery.value"
      :module-sections="buildDeploy.moduleSections.value"
      :node-version="buildDeploy.nodeVersion.value"
      :node-versions="nodeVersions"
      :current-node-version="currentNodeVersion"
      :servers="buildDeploy.servers.value"
      :server-ids="buildDeploy.serverIds.value"
      :remote-path="buildDeploy.remotePath.value"
      :path-options="buildDeploy.pathOptions.value"
      :git-branch="buildDeploy.gitBranch.value"
      :git-commits="buildDeploy.gitCommits.value"
      :conn-badges="buildDeploy.connBadges.value"
      :test-summary="buildDeploy.testSummary.value"
      :testing="buildDeploy.testing.value"
      :submitting="buildDeploy.submitting.value"
      :error="buildDeploy.error.value"
      @close="buildDeploy.close()"
      @submit="onSubmitBuildDeploy"
      @update:module-filter="buildDeploy.moduleFilter.value = $event"
      @update:module-query="buildDeploy.moduleQuery.value = $event"
      @update:node-version="buildDeploy.nodeVersion.value = $event"
      @update:remote-path="buildDeploy.remotePath.value = $event"
      @toggle-module="buildDeploy.toggleModule($event)"
      @toggle-favorite="buildDeploy.toggleFavorite($event)"
      @toggle-all="buildDeploy.toggleAll($event)"
      @toggle-server="(id, checked) => buildDeploy.setServerChecked(id, checked)"
      @quick-test="buildDeploy.quickTest()"
      @browse="onOpenRemoteBrowser"
    />
    <RemoteBrowserDialog
      :target="remoteBrowser.target.value"
      :breadcrumbs="remoteBrowser.breadcrumbs.value"
      :current-dir="remoteBrowser.currentDir.value"
      :entries="remoteBrowser.visibleEntries.value"
      :parent-dir="remoteBrowser.parentDir.value"
      :loading="remoteBrowser.loading.value"
      :error="remoteBrowser.error.value"
      :fallback="remoteBrowser.fallback.value"
      @close="remoteBrowser.close()"
      @navigate="remoteBrowser.navigate($event)"
      @confirm="onConfirmRemotePath"
    />
  </div>
  </DeployChrome>
</template>
