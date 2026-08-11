<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageTop from '@/components/layout/PageTop.vue'
import { registerPageLeaveGuard } from '@/legacy/legacy-bridge'
import { useEditorStore } from '@/stores/editor'
import { useNotificationStore } from '@/stores/notification'
import { getEditorDoc } from '@/views/editor/editor-docs'
import { edModeForExt } from '@/views/editor/editor-modes'

import CodeMirrorPane from './components/CodeMirrorPane.vue'
import EditorBrowserDialog from './components/EditorBrowserDialog.vue'
import EditorStatusbar from './components/EditorStatusbar.vue'
import EditorTabMenu, { type EdCtxItem } from './components/EditorTabMenu.vue'
import EditorTabs from './components/EditorTabs.vue'
import './editor.css'

defineOptions({ name: 'FileEditorView' })

const store = useEditorStore()
const notify = useNotificationStore()

const paneRef = ref<InstanceType<typeof CodeMirrorPane> | null>(null)
let cmReady = false
/** KeepAlive 下用激活态代替 document#page-editor 查询，避免架构门禁 document-query。 */
const pageActive = ref(true)

const browserOpen = ref(false)
const browserMode = ref<'open' | 'save'>('open')
const saveAsKey = ref<string | null>(null)

const confirmOpen = ref(false)
const confirmMessage = ref('')
const confirmText = ref('确认')
let confirmResolve: ((ok: boolean) => void) | null = null

const promptOpen = ref(false)
const promptTitle = ref('')
const promptValue = ref('')
let promptResolve: ((value: string | null) => void) | null = null

const ctxOpen = ref(false)
const ctxX = ref(0)
const ctxY = ref(0)
const ctxItems = ref<EdCtxItem[]>([])

const defaultSaveName = computed(() => {
  const key = saveAsKey.value
  const tab = key ? store.tabs[key] : null
  if (!tab) return ''
  return tab.isDraft ? `${tab.name}.txt` : tab.name
})

let stopLeaveGuard: (() => void) | null = null

function showConfirm(message: string, opts: { confirmText?: string } = {}) {
  confirmMessage.value = message
  confirmText.value = opts.confirmText || '确认'
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

function showPrompt(title: string, opts: { defaultValue?: string } = {}) {
  promptTitle.value = title
  promptValue.value = opts.defaultValue || ''
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

function syncActiveDoc() {
  const key = store.active
  if (!key || !cmReady || !paneRef.value) return
  const doc = getEditorDoc(key)
  const tab = store.tabs[key]
  if (!doc || !tab) return
  paneRef.value.swapDoc(doc, edModeForExt(tab.ext))
}

function onCmReady() {
  cmReady = true
  syncActiveDoc()
}

function onCmChange() {
  if (store.active) store.syncDirtyFromDoc(store.active)
}

function onCmCursor(line: number, col: number) {
  store.setCursor(line, col)
}

watch(() => store.active, () => {
  syncActiveDoc()
})

watch(() => store.activeTab?.ext, () => {
  syncActiveDoc()
})

async function ensureSession() {
  await store.restoreSession()
  await nextTick()
  syncActiveDoc()
  paneRef.value?.refresh()
}

function openBrowser(mode: 'open' | 'save', key?: string) {
  browserMode.value = mode
  saveAsKey.value = key ?? store.active
  browserOpen.value = true
}

async function onBrowsePick(path: string) {
  await store.openPath(path)
  await nextTick()
  syncActiveDoc()
}

async function onBrowseSaveAs(payload: { dir: string; filename: string }) {
  const key = saveAsKey.value
  if (!key) return
  if (!payload.filename.trim()) {
    notify.push('请填写文件名', 'warning')
    return
  }
  if (payload.filename.includes('/')) {
    notify.push('文件名不能包含 /', 'warning')
    return
  }
  if (!payload.dir) {
    notify.push('请选择保存目录', 'warning')
    return
  }
  const target = `${payload.dir}/${payload.filename}`
  const ok = await store.saveAs(key, target, payload.filename)
  if (ok) {
    browserOpen.value = false
    await nextTick()
    syncActiveDoc()
  }
}

async function onCloseTab(key: string) {
  await store.closeTab(key, showConfirm)
  await nextTick()
  syncActiveDoc()
}

function onActivate(key: string) {
  store.activate(key)
}

function onTabContext(payload: { key: string; event: MouseEvent }) {
  const tab = store.tabs[payload.key]
  if (!tab) return
  const idx = store.order.indexOf(payload.key)
  const hasOthers = store.order.length > 1
  const hasRight = idx > -1 && idx < store.order.length - 1
  const items: EdCtxItem[] = []
  if (tab.isDraft) {
    items.push({
      label: '重命名草稿',
      action: () => { void renameDraft(payload.key) },
    })
  } else {
    items.push({
      label: '复制文件路径',
      action: () => { void copyPath(payload.key) },
    })
  }
  items.push({ separator: true, label: '' })
  items.push({
    label: '关闭',
    action: () => { void onCloseTab(payload.key) },
  })
  items.push({
    label: '关闭其他',
    disabled: !hasOthers,
    action: () => {
      void store.closeOthers(payload.key, showConfirm).then(() => {
        void nextTick().then(syncActiveDoc)
      })
    },
  })
  items.push({
    label: '关闭右侧',
    disabled: !hasRight,
    action: () => {
      void store.closeToRight(payload.key, showConfirm).then(() => {
        void nextTick().then(syncActiveDoc)
      })
    },
  })
  ctxItems.value = items
  ctxX.value = payload.event.clientX
  ctxY.value = payload.event.clientY
  ctxOpen.value = true
}

async function renameDraft(key: string) {
  const tab = store.tabs[key]
  if (!tab?.isDraft) return
  const name = await showPrompt('重命名草稿', { defaultValue: tab.name })
  if (name === null) return
  await store.renameDraft(key, name)
}

async function copyPath(key: string) {
  const tab = store.tabs[key]
  if (!tab || tab.isDraft) return
  try {
    await navigator.clipboard.writeText(tab.path)
    notify.push('已复制路径', 'success')
  } catch {
    notify.push('复制失败', 'error')
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!pageActive.value) return
  if (!(e.metaKey || e.ctrlKey)) return
  const k = e.key.toLowerCase()
  if (k === 't' && e.shiftKey) {
    e.preventDefault()
    void store.reopenClosed().then(() => nextTick().then(syncActiveDoc))
  } else if (k === 's') {
    e.preventDefault()
    void store.saveCurrent()
  } else if (k === 't') {
    e.preventDefault()
    store.newScratchTab()
    void nextTick().then(syncActiveDoc)
  } else if (k === 'w') {
    e.preventDefault()
    if (store.active) void onCloseTab(store.active)
  }
}

onMounted(() => {
  pageActive.value = true
  document.addEventListener('keydown', onKeydown)
  stopLeaveGuard = registerPageLeaveGuard('editor', async () => {
    if (!store.needsLeaveConfirm) return true
    return showConfirm('有未保存的标签，确定离开编辑页？', {
      confirmText: '仍然离开',
    })
  })
  void ensureSession()
})

onActivated(() => {
  pageActive.value = true
  paneRef.value?.refresh()
})

onDeactivated(() => {
  pageActive.value = false
})

onBeforeUnmount(() => {
  pageActive.value = false
  document.removeEventListener('keydown', onKeydown)
  stopLeaveGuard?.()
  stopLeaveGuard = null
  cmReady = false
})
</script>

<template>
  <PageFrame class="ed-page" variant="immersive">
    <template #top>
      <PageTop>
        <PageHeader
          title="文件编辑器"
          description="打开本地文件，语法高亮编辑（⌘S 保存 · ⌘F 查找）"
        >
          <template #actions>
            <div class="ed-toolbar">
              <BaseButton variant="primary" @click="openBrowser('open')">
                <span class="ed-toolbar__icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                </span>
                打开文件
              </BaseButton>
              <BaseButton variant="secondary" title="保存 (⌘S)" @click="store.saveCurrent()">
                <span class="ed-toolbar__icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                </span>
                保存
              </BaseButton>
              <BaseButton
                variant="secondary"
                title="另存为"
                @click="store.active ? openBrowser('save', store.active) : notify.push('没有可另存的标签', 'warning')"
              >
                <span class="ed-toolbar__icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                </span>
                另存为
              </BaseButton>
            </div>
          </template>
        </PageHeader>
      </PageTop>
    </template>

    <div class="ed-layout">
      <EditorTabs
        :tabs="store.tabList"
        :active="store.active"
        @activate="onActivate"
        @close="onCloseTab"
        @contextmenu="onTabContext"
      />
      <div class="ed-body">
        <CodeMirrorPane
          v-show="store.hasTabs"
          ref="paneRef"
          @ready="onCmReady"
          @change="onCmChange"
          @cursor="onCmCursor"
        />
        <div v-if="!store.hasTabs" class="ed-empty">
          <div class="ed-empty-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </div>
          <div class="ed-empty-title">未打开任何文件</div>
          <div class="ed-empty-desc">点击右上角「打开文件」选择一个本地文件开始编辑</div>
          <BaseButton variant="primary" style="margin-top: 14px" @click="openBrowser('open')">
            打开文件
          </BaseButton>
        </div>
      </div>
      <EditorStatusbar
        :tab="store.activeTab"
        :cursor-line="store.cursorLine"
        :cursor-col="store.cursorCol"
        :save-status="store.saveStatus"
      />
    </div>

    <EditorBrowserDialog
      :open="browserOpen"
      :mode="browserMode"
      :default-filename="defaultSaveName"
      @update:open="browserOpen = $event"
      @pick="onBrowsePick"
      @save-as="onBrowseSaveAs"
    />

    <EditorTabMenu
      :open="ctxOpen"
      :x="ctxX"
      :y="ctxY"
      :items="ctxItems"
      @close="ctxOpen = false"
    />

    <ConfirmDialog
      :model-value="confirmOpen"
      title="请确认操作"
      :message="confirmMessage"
      :confirm-text="confirmText"
      tone="danger"
      @update:model-value="(v) => { if (!v) closeConfirm(false) }"
      @confirm="closeConfirm(true)"
    />

    <BaseDialog
      :model-value="promptOpen"
      :title="promptTitle"
      width="400px"
      @update:model-value="(v) => { if (!v) closePrompt(null) }"
    >
      <BaseInput
        v-model="promptValue"
        :aria-label="promptTitle"
        placeholder="草稿名称"
        @keydown.enter="closePrompt(promptValue)"
      />
      <template #footer>
        <BaseButton variant="ghost" @click="closePrompt(null)">取消</BaseButton>
        <BaseButton variant="primary" @click="closePrompt(promptValue)">确定</BaseButton>
      </template>
    </BaseDialog>
  </PageFrame>
</template>
