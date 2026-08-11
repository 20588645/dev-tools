<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import {
  formatSize,
  formatTime,
  type FtFileItem,
} from '@/services/modules/filetransfer-service'
import { useFileTransferStore, type FtSide, type FtSortKey } from '@/stores/file-transfer'

import FtPathBar from './FtPathBar.vue'
import FtRemoteTabs from './FtRemoteTabs.vue'

const props = defineProps<{
  side: FtSide
}>()

const emit = defineEmits<{
  contextmenu: [payload: { side: FtSide; event: MouseEvent; item: FtFileItem }]
  mkdir: [side: FtSide]
}>()

const store = useFileTransferStore()

const isLocal = computed(() => props.side === 'local')
const title = computed(() => (isLocal.value ? '本地' : '远程'))
const items = computed(() => (isLocal.value ? store.sortedLocalItems : store.sortedRemoteItems))
const selected = computed(() => (isLocal.value ? store.localSelected : store.remoteSelected))
const sort = computed(() => (isLocal.value ? store.localSort : store.remoteSort))
const loading = computed(() => (isLocal.value ? store.localLoading : store.remoteLoading))
const error = computed(() => (isLocal.value ? store.localError : store.remoteError))
const count = computed(() => (items.value.length ? `${items.value.length} 项` : ''))
const foot = computed(() => (isLocal.value ? store.localStatusText : store.remoteStatusText))
const connected = computed(() => store.connected)
const pathDisabled = computed(() => !isLocal.value && !connected.value)

const canUp = computed(() => {
  if (isLocal.value) return Boolean(store.localParent)
  return connected.value && Boolean(store.remotePath) && store.remotePath !== '/'
})
const canHome = computed(() => (isLocal.value ? Boolean(store.localHome) : connected.value))
const canMkdir = computed(() => (isLocal.value ? Boolean(store.localPath) : connected.value && Boolean(store.remotePath)))
const canRefresh = computed(() => (isLocal.value ? true : connected.value && Boolean(store.remotePath)))

function onUp() {
  if (isLocal.value) store.localUp()
  else store.remoteUp()
}
function onHome() {
  if (isLocal.value) store.goLocalHome()
  else store.goRemoteHome()
}
function onRefresh() {
  if (isLocal.value) store.localRefresh()
  else store.remoteRefresh()
}

function onRowClick(event: MouseEvent, item: FtFileItem) {
  store.selectClick(props.side, item.name, {
    shift: event.shiftKey,
    meta: event.metaKey || event.ctrlKey,
  })
}

function onBlankClick() {
  store.selectClick(props.side, null)
}

function onDblClick(item: FtFileItem) {
  if (!item.isDir) return
  if (isLocal.value) store.enterLocal(item.name)
  else store.enterRemote(item.name)
}

function onContext(event: MouseEvent, item: FtFileItem) {
  if (!isLocal.value && !connected.value) return
  event.preventDefault()
  if (!selected.value.includes(item.name)) store.setSelection(props.side, item.name)
  emit('contextmenu', { side: props.side, event, item })
}

function onSort(key: FtSortKey) {
  store.toggleSort(props.side, key)
}

function arrow(key: FtSortKey) {
  if (sort.value.key !== key) return ''
  return sort.value.dir < 0 ? '▼' : '▲'
}
</script>

<template>
  <section class="ft-pane" :class="isLocal ? 'ft-pane--local' : 'ft-pane--remote'">
    <header class="ft-pane-head">
      <span class="ft-pane-title">
        <svg v-if="isLocal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <path d="M8 20h8" />
        </svg>
        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="2" y="3" width="20" height="8" rx="1" />
          <rect x="2" y="13" width="20" height="8" rx="1" />
          <path d="M6 7h.01M6 17h.01" />
        </svg>
        {{ title }}
      </span>
      <span class="ft-pane-count">{{ count }}</span>
    </header>

    <FtRemoteTabs v-if="!isLocal" />

    <div class="ft-pane-toolbar">
      <BaseButton size="sm" variant="outline" :disabled="!canUp" @click="onUp">上一级</BaseButton>
      <BaseButton size="sm" variant="outline" :disabled="!canHome" @click="onHome">
        {{ isLocal ? '主目录' : '默认' }}
      </BaseButton>
      <BaseButton size="sm" variant="outline" :disabled="!canMkdir" @click="emit('mkdir', side)">新建</BaseButton>
      <span class="ft-pane-toolbar-spacer" />
      <BaseIconButton label="刷新" size="sm" :disabled="!canRefresh" @click="onRefresh">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-2.6-6.3" />
          <path d="M21 3v6h-6" />
        </svg>
      </BaseIconButton>
    </div>

    <FtPathBar :side="side" :disabled="pathDisabled" />

    <div class="ft-listhead">
      <span class="ft-lh-icon" />
      <span class="ft-lh-col" :class="{ 'is-active': sort.key === 'name' }" @click="onSort('name')">
        名称<span class="ft-lh-arr">{{ arrow('name') }}</span>
      </span>
      <span class="ft-lh-col ft-lh-size" :class="{ 'is-active': sort.key === 'size' }" @click="onSort('size')">
        大小<span class="ft-lh-arr">{{ arrow('size') }}</span>
      </span>
      <span class="ft-lh-col ft-lh-time" :class="{ 'is-active': sort.key === 'mtime' }" @click="onSort('mtime')">
        修改时间<span class="ft-lh-arr">{{ arrow('mtime') }}</span>
      </span>
    </div>

    <div class="ft-pane-body" @click.self="onBlankClick">
      <div v-if="!isLocal && !connected" class="ft-pane-state">
        <EmptyState title="远程文件浏览" description="未连接，请选择服务器后点击「连接」。" />
      </div>
      <div v-else-if="loading && !items.length" class="ft-pane-state">
        <LoadingState label="加载中…" />
      </div>
      <div v-else-if="error && !items.length" class="ft-pane-state">
        <ErrorState title="读取失败" :description="error" @retry="onRefresh" />
      </div>
      <div v-else-if="!items.length" class="ft-pane-state">
        <EmptyState title="空目录" description="该目录下没有文件。" />
      </div>
      <div v-else class="ft-list">
        <div
          v-for="item in items"
          :key="item.name"
          class="ft-row"
          :class="{
            'is-dir': item.isDir,
            'is-link': item.isSymlink,
            'is-selected': selected.includes(item.name),
          }"
          :title="item.name"
          @click.stop="onRowClick($event, item)"
          @dblclick.stop="onDblClick(item)"
          @contextmenu="onContext($event, item)"
        >
          <span class="ft-row-icon" aria-hidden="true">
            <svg v-if="item.isSymlink" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5.84" />
              <path d="M14 11a5 5 0 0 0-7.07 0L5.52 12.4a5 5 0 0 0 7.07 7.07L14 18.16" />
            </svg>
            <svg v-else-if="item.isDir" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
          </span>
          <span class="ft-row-name">
            {{ item.name }}
            <span v-if="item.isSymlink && item.target" class="ft-row-link">→ {{ item.target }}</span>
          </span>
          <span class="ft-row-size">{{ item.isDir ? '' : formatSize(item.size) }}</span>
          <span class="ft-row-time">{{ item.mtime ? formatTime(item.mtime) : '' }}</span>
        </div>
      </div>
    </div>

    <div class="ft-pane-foot">{{ foot }}</div>
  </section>
</template>
