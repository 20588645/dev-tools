<script setup lang="ts">
import { computed, onActivated, onDeactivated, onMounted, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import { getTerminalRuntime } from '@/services/terminal-runtime-service'
import { useNotificationStore } from '@/stores/notification'
import { useTerminalStore } from '@/stores/terminal'

import AddCommandDialog from './components/AddCommandDialog.vue'
import CommandGrid from './components/CommandGrid.vue'
import SudoBar from './components/SudoBar.vue'
import TerminalSearch from './components/TerminalSearch.vue'
import TerminalTabs from './components/TerminalTabs.vue'
import XtermHost from './components/XtermHost.vue'
import './terminal.css'

defineOptions({ name: 'TerminalView' })

const store = useTerminalStore()
const notify = useNotificationStore()
const xtermHost = ref<InstanceType<typeof XtermHost> | null>(null)

const addOpen = ref(false)
const confirmOpen = ref(false)
const confirmMessage = ref('')
let confirmResolve: ((ok: boolean) => void) | null = null
let searchDebounce: ReturnType<typeof setTimeout> | null = null

/** 原型工具栏右侧的命令搜索：纯前端过滤，不动数据。 */
const cmdQuery = ref('')
const filteredCommands = computed(() => {
  const query = cmdQuery.value.trim().toLowerCase()
  if (!query) return store.commands
  return store.commands.filter((cmd) => (
    cmd.name.toLowerCase().includes(query) || cmd.command.toLowerCase().includes(query)
  ))
})
const commandHint = computed(() => (
  cmdQuery.value.trim()
    ? `${filteredCommands.value.length} / ${store.commands.length} 条`
    : `${store.commands.length} 条`
))

function showConfirm(message: string) {
  confirmMessage.value = message
  confirmOpen.value = true
  return new Promise<boolean>((resolve) => {
    confirmResolve = resolve
  })
}

function closeConfirm(ok: boolean) {
  confirmOpen.value = false
  confirmResolve?.(ok)
  confirmResolve = null
}

async function ensureBoot() {
  xtermHost.value?.rebind()
  const runtime = getTerminalRuntime()
  await store.loadCommands()
  await runtime?.bootFromSessions()
  runtime?.onPageActivate()
}

onMounted(() => { void ensureBoot() })
onActivated(() => { void ensureBoot() })
onDeactivated(() => {
  getTerminalRuntime()?.onPageDeactivate()
})

function resolveCommand(cmdId: string) {
  const cmd = store.commands.find((item) => item.id === cmdId)
  if (!cmd) return null
  let finalCommand = cmd.command
  if (cmd.hasParam && cmd.paramName) {
    const paramValue = (store.paramDrafts[cmdId] ?? cmd.paramDefault ?? '').trim()
    if (!paramValue) {
      notify.push(`请填写参数：${cmd.paramPlaceholder || cmd.paramName}`, 'warning')
      return null
    }
    finalCommand = finalCommand.replace(new RegExp(`\\$\\{${cmd.paramName}\\}`, 'g'), paramValue)
  }
  return { cmd, finalCommand }
}

function onRunCommand(cmdId: string) {
  const resolved = resolveCommand(cmdId)
  if (!resolved) return
  const ok = getTerminalRuntime()?.runCommandInNewTab(resolved.finalCommand, resolved.cmd.name)
  if (ok) notify.push(`已在新终端执行：${resolved.cmd.name}`, 'success')
}

function onRestartCommand(cmdId: string) {
  const resolved = resolveCommand(cmdId)
  if (!resolved) return
  if (store.restartingCommandIds.includes(cmdId)) return
  const tabId = store.runningByCommandId[cmdId]
  if (!tabId) {
    notify.push(`「${resolved.cmd.name}」当前没有运行中的终端`, 'warning')
    return
  }
  store.beginRestart(cmdId)
  const ok = getTerminalRuntime()?.restartCommandInTab(
    tabId,
    resolved.finalCommand,
    resolved.cmd.name,
    () => { store.endRestart(cmdId) },
  )
  if (!ok) {
    store.endRestart(cmdId)
    return
  }
  notify.push(`正在重启：${resolved.cmd.name}`, 'success')
}

async function onRemoveCommand(id: string) {
  const ok = await showConfirm('确定删除这个命令？')
  if (!ok) return
  await store.removeCommand(id)
}

function toggleFullscreen() {
  const next = !store.fullscreen
  store.setFullscreen(next)
  globalThis.setTimeout(() => {
    getTerminalRuntime()?.flushResize()
  }, 100)
}

function onSearch(direction: 'next' | 'prev', incremental = false) {
  const runtime = getTerminalRuntime()
  if (!incremental) {
    runtime?.performSearch(direction, false)
    return
  }
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    searchDebounce = null
    runtime?.performSearch(direction, true)
  }, 250)
}
</script>

<template>
  <PageFrame class="term-page" variant="immersive">
    <template #top>
      <PageTop>
        <PageHeader title="快捷命令" description="预设常用 Shell 命令，每次执行在新终端标签中运行">
          <template #icon>
            <span class="term-page__title-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="4 17 10 11 4 5" />
                <line x1="12" y1="19" x2="20" y2="19" />
              </svg>
            </span>
          </template>
          <template #actions>
            <BaseButton variant="primary" @click="addOpen = true">＋ 添加命令</BaseButton>
          </template>
        </PageHeader>
        <PageToolbar>
          <SudoBar
            :password="store.sudoPasswordDraft"
            :configured="store.sudoConfigured"
            @update:password="store.sudoPasswordDraft = $event"
            @save="store.saveSudoPassword()"
          />
          <BaseInput
            v-model="cmdQuery"
            size="sm"
            clearable
            placeholder="搜索命令…"
            aria-label="搜索命令"
            class="term-cmd-search"
          />
        </PageToolbar>
      </PageTop>
    </template>

    <div class="term-page__body">
      <!-- 原型：预设命令网格装进带头部的面板 -->
      <section class="term-cmd-panel" aria-labelledby="term-cmd-title">
        <div class="term-cmd-panel__head">
          <h2 id="term-cmd-title" class="term-cmd-panel__title">预设命令</h2>
          <span class="term-cmd-panel__hint">{{ commandHint }}</span>
        </div>
        <div class="term-cmd-grid-wrapper">
          <CommandGrid
            :commands="filteredCommands"
            :param-drafts="store.paramDrafts"
            :running-ids="store.runningCommandIds"
            :restarting-ids="store.restartingCommandIds"
            :loading="store.commandsLoading"
            :empty-text="cmdQuery.trim() ? '没有匹配的命令' : '暂无命令，点击「添加命令」开始'"
            @run="onRunCommand"
            @restart="onRestartCommand"
            @remove="onRemoveCommand"
            @update:param="store.setParamDraft($event.id, $event.value)"
          />
        </div>
      </section>

      <div class="term-panel" :class="{ fullscreen: store.fullscreen }">
        <!-- 原型：面板头（标题 + 状态 + 操作），标签行单独一排 -->
        <div class="term-panel__head">
          <h2 class="term-panel__title">终端</h2>
          <span
            class="term-status-dot"
            :class="store.connectionStatus"
            :title="store.connectionStatus"
          />
          <span class="term-panel__grow" />
          <div class="term-panel__actions">
            <span
              class="term-action-btn"
              role="button"
              tabindex="0"
              title="清除屏幕"
              @click="getTerminalRuntime()?.clearActiveScreen()"
              @keydown.enter="getTerminalRuntime()?.clearActiveScreen()"
            >
              <svg class="term-action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
              <span>清除</span>
            </span>
            <span
              class="term-action-btn"
              role="button"
              tabindex="0"
              title="重启终端"
              @click="getTerminalRuntime()?.resetActiveShell()"
              @keydown.enter="getTerminalRuntime()?.resetActiveShell()"
            >
              <svg class="term-action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              <span>重置</span>
            </span>
            <span
              class="term-action-btn"
              role="button"
              tabindex="0"
              title="切换全屏"
              @click="toggleFullscreen"
              @keydown.enter="toggleFullscreen"
            >
              <svg v-if="!store.fullscreen" class="term-action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></svg>
              <svg v-else class="term-action-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4" /></svg>
              <span>{{ store.fullscreen ? '还原' : '全屏' }}</span>
            </span>
          </div>
        </div>
        <div class="term-panel__tabs">
          <TerminalTabs
            :tabs="store.tabs"
            :active-tab-id="store.activeTabId"
            :can-close="store.canCloseTab"
            @activate="getTerminalRuntime()?.switchTab($event)"
            @close="getTerminalRuntime()?.closeTab($event)"
            @create="getTerminalRuntime()?.createTab()"
          />
        </div>
        <div class="term-panel__body">
          <TerminalSearch
            :open="store.searchOpen"
            :query="store.searchQuery"
            :count-label="store.searchCountLabel"
            @update:query="store.searchQuery = $event"
            @search="onSearch"
            @close="getTerminalRuntime()?.closeSearch()"
          />
          <XtermHost ref="xtermHost" />
        </div>
      </div>
    </div>

    <AddCommandDialog
      :open="addOpen"
      @update:open="addOpen = $event"
      @submit="(p) => { void store.addCommand(p) }"
    />

    <ConfirmDialog
      :model-value="confirmOpen"
      title="请确认操作"
      :message="confirmMessage"
      confirm-text="删除"
      tone="danger"
      @update:model-value="(v) => { if (!v) closeConfirm(false) }"
      @confirm="closeConfirm(true)"
    />
  </PageFrame>
</template>
