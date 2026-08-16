<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import type { FtFileItem } from '@/services/modules/filetransfer-service'
import { useFileTransferStore, type FtSide } from '@/stores/file-transfer'

import FtContextMenu, { type FtCtxItem } from './components/FtContextMenu.vue'
import FtFilePane from './components/FtFilePane.vue'
import FtSessionBar from './components/FtSessionBar.vue'
import FtSplitter from './components/FtSplitter.vue'
import FtTransferQueue from './components/FtTransferQueue.vue'
import './filetransfer.css'

defineOptions({ name: 'FileTransferView' })

const store = useFileTransferStore()

const ctxOpen = ref(false)
const ctxX = ref(0)
const ctxY = ref(0)
const ctxItems = ref<FtCtxItem[]>([])

const promptOpen = ref(false)
const promptTitle = ref('')
const promptValue = ref('')
const promptConfirm = ref('确定')
let promptResolve: ((value: string | null) => void) | null = null

const confirmOpen = ref(false)
const confirmMessage = ref('')
let confirmResolve: ((ok: boolean) => void) | null = null

const splitStyle = computed(() => ({
  '--ft-left': `${(store.splitRatio * 100).toFixed(2)}%`,
}))

async function ensureBoot() {
  await store.loadServers()
  if (!store.localPath && !store.localLoading) {
    await store.loadLocal('')
  }
}

onMounted(() => { void ensureBoot() })
onActivated(() => { void store.loadServers({ force: true }) })

function showPrompt(title: string, opts: { defaultValue?: string; confirmText?: string } = {}) {
  promptTitle.value = title
  promptValue.value = opts.defaultValue || ''
  promptConfirm.value = opts.confirmText || '确定'
  promptOpen.value = true
  return new Promise<string | null>((resolve) => {
    promptResolve = resolve
  })
}

function closePrompt(value: string | null) {
  promptOpen.value = false
  promptResolve?.(value)
  promptResolve = null
}

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

async function onMkdir(side: FtSide) {
  const name = await showPrompt('新建文件夹', { confirmText: '新建' })
  if (!name?.trim()) return
  await store.mkdir(side, name)
}

async function onRename(side: FtSide, name: string) {
  const next = await showPrompt('重命名', { defaultValue: name, confirmText: '重命名' })
  if (!next?.trim() || next.trim() === name) return
  await store.rename(side, name, next)
}

async function onDelete(side: FtSide, names: string[]) {
  const list = names.filter(Boolean)
  if (!list.length) return
  const items = side === 'local' ? store.localItems : store.remoteItems
  const byName = new Map(items.map((it) => [it.name, it]))
  const msg = list.length === 1
    ? (byName.get(list[0])?.isDir
      ? `确定删除目录「${list[0]}」及其全部内容？此操作不可恢复。`
      : `确定删除「${list[0]}」？此操作不可恢复。`)
    : `确定删除选中的 ${list.length} 项？其中的目录会连同内容一并删除，此操作不可恢复。`
  const ok = await showConfirm(msg)
  if (!ok) return
  await store.remove(side, list)
}

function onContextmenu(payload: { side: FtSide; event: MouseEvent; item: FtFileItem }) {
  const { side, event, item } = payload
  const names = side === 'local' ? store.localSelected : store.remoteSelected
  const n = names.length
  const multi = n > 1
  const items: FtCtxItem[] = []

  if (!multi && item.isDir) {
    items.push({
      label: '打开',
      action: () => {
        if (side === 'local') store.enterLocal(item.name)
        else store.enterRemote(item.name)
      },
    })
  }
  if (side === 'local' && store.sessionId) {
    items.push({
      label: multi ? `上传到远程（${n}）` : '上传到远程',
      action: () => { void store.upload(names) },
    })
  }
  if (side === 'remote') {
    items.push({
      label: multi ? `下载到本地（${n}）` : '下载到本地',
      action: () => { void store.download(names) },
    })
  }
  if (!multi) {
    items.push({
      label: '重命名',
      action: () => { void onRename(side, item.name) },
    })
  }
  items.push({
    label: multi ? `删除（${n}）` : '删除',
    danger: true,
    action: () => { void onDelete(side, names) },
  })

  ctxX.value = event.clientX
  ctxY.value = event.clientY
  ctxItems.value = items
  ctxOpen.value = true
}
</script>

<template>
  <PageFrame class="ft-page" variant="immersive">
    <template #top>
      <PageTop>
        <PageHeader title="文件传输" description="FileZilla 式双栏文件管理：本地与远程服务器互传">
          <template #icon>
            <span class="ft-page__title-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="17 11 21 7 17 3" />
                <line x1="21" y1="7" x2="9" y2="7" />
                <polyline points="7 13 3 17 7 21" />
                <line x1="3" y1="17" x2="15" y2="17" />
              </svg>
            </span>
          </template>
          <template #actions>
            <BaseIconButton
              label="刷新两栏目录"
              :disabled="!store.localPath && !store.sessionId"
              @click="store.refreshAll()"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-2.6-6.3" />
                <path d="M21 3v6h-6" />
              </svg>
            </BaseIconButton>
          </template>
        </PageHeader>
        <PageToolbar>
          <FtSessionBar />
        </PageToolbar>
      </PageTop>
    </template>

    <div class="ft-workspace" :style="splitStyle">
      <FtFilePane side="local" @contextmenu="onContextmenu" @mkdir="onMkdir" />
      <FtSplitter @update:ratio="store.setSplitRatio" />
      <FtFilePane side="remote" @contextmenu="onContextmenu" @mkdir="onMkdir" />
    </div>

    <FtTransferQueue />

    <FtContextMenu
      :open="ctxOpen"
      :x="ctxX"
      :y="ctxY"
      :items="ctxItems"
      @close="ctxOpen = false"
    />

    <BaseDialog
      :model-value="promptOpen"
      :title="promptTitle"
      size="compact"
      @update:model-value="(v) => { if (!v) closePrompt(null) }"
    >
      <BaseInput
        v-model="promptValue"
        :aria-label="promptTitle"
        @keydown.enter="closePrompt(promptValue)"
      />
      <template #footer>
        <BaseButton variant="ghost" @click="closePrompt(null)">取消</BaseButton>
        <BaseButton variant="primary" @click="closePrompt(promptValue)">{{ promptConfirm }}</BaseButton>
      </template>
    </BaseDialog>

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
