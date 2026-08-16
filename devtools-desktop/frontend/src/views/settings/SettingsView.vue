<script setup lang="ts">
import { onActivated, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageTop from '@/components/layout/PageTop.vue'

import SettingsAboutPanel from './components/SettingsAboutPanel.vue'
import SettingsAdvancedPanel from './components/SettingsAdvancedPanel.vue'
import SettingsAppearancePanel from './components/SettingsAppearancePanel.vue'
import SettingsBackupPanel from './components/SettingsBackupPanel.vue'
import SettingsCategoryNav from './components/SettingsCategoryNav.vue'
import SettingsGeneralPanel from './components/SettingsGeneralPanel.vue'
import SettingsGitPanel from './components/SettingsGitPanel.vue'
import SettingsStatusOverview from './components/SettingsStatusOverview.vue'
import { settingsCategoryLabel, type SettingsSearchItem, useSettings } from './composables/useSettings'
import './settings.css'

defineOptions({ name: 'SettingsView' })

type ConfirmKind = 'restart' | 'reset-menu' | 'restore' | 'delete' | 'kill-test'

const controller = useSettings()
const workspaceContent = ref<HTMLElement | null>(null)
const searchInput = ref<InstanceType<typeof BaseInput> | null>(null)
const confirm = reactive({
  visible: false,
  kind: 'restart' as ConfirmKind,
  payload: '',
  title: '请确认操作',
  message: '',
  confirmText: '确认',
  tone: 'primary' as 'primary' | 'danger',
})

function openConfirm(kind: ConfirmKind, payload = '') {
  Object.assign(confirm, {
    visible: true,
    kind,
    payload,
    title: '请确认操作',
    confirmText: '确认',
    tone: 'primary',
  })
  if (kind === 'restart') {
    confirm.title = '重启 Sidecar 服务'
    confirm.message = '正在进行的构建、部署或远程任务会被中断，是否继续？'
    confirm.confirmText = '立即重启'
  } else if (kind === 'reset-menu') {
    confirm.title = '恢复默认菜单顺序'
    confirm.message = '侧边栏中的自定义排序会被清除。'
    confirm.confirmText = '恢复默认'
  } else if (kind === 'restore') {
    confirm.title = '恢复数据库备份'
    confirm.message = `确认恢复“${payload}”？当前数据库会在重启前自动保留 pre-restore 副本，恢复需重启 Sidecar 后生效。`
    confirm.confirmText = '暂存恢复'
    confirm.tone = 'danger'
  } else if (kind === 'delete') {
    confirm.title = '删除数据库备份'
    confirm.message = `确认永久删除“${payload}”？此操作无法撤销。`
    confirm.confirmText = '删除'
    confirm.tone = 'danger'
  } else if (kind === 'kill-test') {
    confirm.title = '停止测试 Sidecar'
    confirm.message = '只会停止使用测试数据目录运行的 Sidecar，不会操作正式服务。'
    confirm.confirmText = '停止测试服务'
    confirm.tone = 'danger'
  }
}

async function runConfirmedAction() {
  const kind = confirm.kind
  const payload = confirm.payload
  confirm.visible = false
  if (kind === 'restart') await controller.restartSidecar()
  if (kind === 'reset-menu') controller.resetMenuOrder()
  if (kind === 'restore') await controller.restoreBackup(payload)
  if (kind === 'delete') await controller.removeBackup(payload)
  if (kind === 'kill-test') await controller.stopTestSidecars()
}

function chooseSearchResult(item: SettingsSearchItem) {
  controller.chooseSearchResult(item)
  requestAnimationFrame(() => {
    workspaceContent.value
      ?.querySelector<HTMLElement>(`[data-setting-id="${item.id}"]`)
      ?.focus({ preventScroll: false })
  })
}

function handleSearchShortcut(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLocaleLowerCase() !== 'k') return
  event.preventDefault()
  searchInput.value?.focus()
}

onMounted(() => {
  window.addEventListener('keydown', handleSearchShortcut)
  void controller.initialize()
})

onActivated(() => {
  if (controller.initialized.value) void controller.initialize(true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleSearchShortcut)
  controller.dispose()
})
</script>

<template>
  <PageFrame class="settings-view" variant="immersive" data-testid="settings-view">
    <template #top>
      <PageTop class="settings-view__top">
        <PageHeader title="系统设置" description="全局偏好、本地服务与数据安全">
          <template #icon><span class="settings-title-mark" /></template>
          <template #actions>
            <div class="settings-header-actions">
              <BaseInput
                ref="searchInput"
                v-model="controller.searchQuery.value"
                type="search"
                variant="search"
                aria-label="搜索设置"
                placeholder="搜索设置，如：备份"
                autocomplete="off"
              >
                <template #prefix>⌕</template>
                <template #suffix><kbd>⌘ K</kbd></template>
              </BaseInput>
              <StatusIndicator
                :status="controller.health.value ? 'online' : controller.loading.value ? 'checking' : 'offline'"
                :label="controller.health.value ? '本地服务正常' : controller.loading.value ? '正在检测' : '本地服务离线'"
              />
            </div>
          </template>
        </PageHeader>
      </PageTop>
    </template>

    <div class="settings-view__stage">
      <ErrorState
        v-if="controller.loadError.value"
        compact
        title="部分设置暂时无法读取"
        :description="controller.loadError.value"
        @retry="controller.initialize(true)"
      />

      <SettingsStatusOverview
        :sidecar="controller.sidecarLabel.value"
        :sidecar-online="Boolean(controller.health.value)"
        :backup="controller.latestBackupLabel.value"
        :notification="controller.notificationLabel.value"
        :repositories="controller.gitDraft.repos.length"
      />

      <div class="settings-workspace">
        <SettingsCategoryNav v-model="controller.activeCategory.value" />
        <main ref="workspaceContent" class="settings-workspace__content">
          <section v-if="controller.searchQuery.value" class="settings-search-results" aria-labelledby="settingsSearchResultsTitle">
            <div class="settings-panel-heading">
              <div><h2 id="settingsSearchResultsTitle">搜索结果</h2><p>找到 {{ controller.searchResults.value.length }} 项设置</p></div>
              <BaseButton variant="ghost" size="sm" @click="controller.searchQuery.value = ''">清除搜索</BaseButton>
            </div>
            <div v-if="controller.searchResults.value.length" class="settings-search-results__list">
              <BaseButton
                v-for="item in controller.searchResults.value"
                :key="item.id"
                class="settings-search-result"
                variant="outline"
                @click="chooseSearchResult(item)"
              >
                <span class="settings-search-result__layout">
                  <span class="settings-search-result__mark">{{ item.title.slice(0, 2).toUpperCase() }}</span>
                  <span class="settings-search-result__copy"><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
                  <small>{{ settingsCategoryLabel(item.category) }}</small>
                </span>
              </BaseButton>
            </div>
            <div v-else class="settings-search-empty">
              <strong>没有匹配的设置</strong><p>试试“备份”“主题”或“Git”</p>
            </div>
          </section>

          <template v-else>
            <SettingsGeneralPanel
              v-if="controller.activeCategory.value === 'general'"
              :controller="controller"
              @request-restart="openConfirm('restart')"
              @request-reset-menu="openConfirm('reset-menu')"
            />
            <SettingsBackupPanel
              v-else-if="controller.activeCategory.value === 'backup'"
              :controller="controller"
              @request-restore="openConfirm('restore', $event)"
              @request-delete="openConfirm('delete', $event)"
            />
            <SettingsAppearancePanel
              v-else-if="controller.activeCategory.value === 'appearance'"
              :controller="controller"
            />
            <SettingsGitPanel
              v-else-if="controller.activeCategory.value === 'git'"
              :controller="controller"
            />
            <SettingsAdvancedPanel
              v-else-if="controller.activeCategory.value === 'advanced'"
              :controller="controller"
              @request-kill-test="openConfirm('kill-test')"
            />
            <SettingsAboutPanel
              v-else
              :controller="controller"
            />
          </template>
        </main>
      </div>
    </div>

    <ConfirmDialog
      v-model="confirm.visible"
      :title="confirm.title"
      :message="confirm.message"
      :confirm-text="confirm.confirmText"
      :tone="confirm.tone"
      @confirm="runConfirmedAction"
    />
  </PageFrame>
</template>
