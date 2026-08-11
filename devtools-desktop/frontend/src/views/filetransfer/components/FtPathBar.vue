<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import BaseInput from '@/components/form/BaseInput.vue'
import {
  listLocal,
  listRemote,
  splitPathInput,
  type FtFileItem,
} from '@/services/modules/filetransfer-service'
import { useFileTransferStore, type FtSide } from '@/stores/file-transfer'

const props = defineProps<{
  side: FtSide
  disabled?: boolean
}>()

const store = useFileTransferStore()
const draft = ref('')
const currentPath = ref('')
let suggestTimer: ReturnType<typeof setTimeout> | null = null

const sug = computed(() => (props.side === 'local' ? store.localSug : store.activeTab?.sug))
const placeholder = computed(() => (
  props.side === 'local'
    ? '输入路径回车跳转，输入时提示子目录'
    : '输入远程路径回车跳转，输入时提示子目录'
))

watch(
  () => (props.side === 'local' ? store.localPath : store.remotePath),
  (path) => {
    draft.value = path || ''
    currentPath.value = path || ''
  },
  { immediate: true },
)

function hideSuggest() {
  if (props.side === 'local') {
    store.localSug = { dir: null, items: [], list: [], active: -1, open: false }
    return
  }
  const tab = store.activeTab
  if (tab) tab.sug = { dir: null, items: [], list: [], active: -1, open: false }
}

function patchSug(patch: Partial<{ dir: string | null; items: FtFileItem[]; list: FtFileItem[]; active: number; open: boolean }>) {
  if (props.side === 'local') {
    store.localSug = { ...store.localSug, ...patch }
    return
  }
  const tab = store.activeTab
  if (!tab) return
  tab.sug = { ...tab.sug, ...patch }
}

async function updateSuggest() {
  if (props.disabled || (props.side === 'remote' && !store.sessionId)) {
    hideSuggest()
    return
  }
  const { dir } = splitPathInput(draft.value)
  const state = sug.value
  if (!state) return

  if (state.dir !== dir) {
    try {
      const data = props.side === 'local'
        ? await listLocal(dir)
        : await listRemote(store.sessionId!, dir)
      patchSug({ dir, items: data.items.filter((it) => it.isDir) })
    } catch {
      patchSug({ dir, items: [] })
    }
  }

  const cur = splitPathInput(draft.value)
  const latest = sug.value
  if (!latest || cur.dir !== latest.dir) return
  const pfx = cur.prefix.toLowerCase()
  const list = latest.items.filter((it) => it.name.toLowerCase().startsWith(pfx)).slice(0, 50)
  if (!list.length) {
    hideSuggest()
    return
  }
  patchSug({ list, active: -1, open: true })
}

function onInput() {
  if (suggestTimer) clearTimeout(suggestTimer)
  suggestTimer = setTimeout(() => { void updateSuggest() }, 150)
}

function acceptSuggest(idx: number) {
  const state = sug.value
  const item = state?.list[idx]
  if (!item) return
  const { dir } = splitPathInput(draft.value)
  const full = dir === '/' ? `/${item.name}` : `${dir}/${item.name}`
  hideSuggest()
  if (props.side === 'local') void store.loadLocal(full)
  else if (store.sessionId) void store.loadRemote(full)
}

function moveSuggest(delta: number) {
  const state = sug.value
  if (!state?.open || !state.list.length) return
  const next = (state.active + delta + state.list.length) % state.list.length
  patchSug({ active: next })
}

function onKeydown(event: KeyboardEvent) {
  const state = sug.value
  if (event.key === 'ArrowDown') {
    if (state?.open) {
      event.preventDefault()
      moveSuggest(1)
    }
    return
  }
  if (event.key === 'ArrowUp') {
    if (state?.open) {
      event.preventDefault()
      moveSuggest(-1)
    }
    return
  }
  if (event.key === 'Tab') {
    if (state?.open && state.list.length) {
      event.preventDefault()
      const it = state.list[state.active >= 0 ? state.active : 0]
      const { dir } = splitPathInput(draft.value)
      draft.value = `${dir === '/' ? '/' : `${dir}/`}${it.name}/`
      onInput()
    }
    return
  }
  if (event.key === 'Enter') {
    if (state?.open && state.active >= 0) {
      event.preventDefault()
      acceptSuggest(state.active)
      return
    }
    const v = draft.value.trim()
    if (!v) return
    hideSuggest()
    if (props.side === 'local') void store.loadLocal(v)
    else if (store.sessionId) void store.loadRemote(v)
    return
  }
  if (event.key === 'Escape') {
    if (state?.open) {
      hideSuggest()
      return
    }
    draft.value = currentPath.value
  }
}

function onSuggestDown(event: MouseEvent, idx: number) {
  event.preventDefault()
  acceptSuggest(idx)
}

function onBlur() {
  setTimeout(() => hideSuggest(), 120)
}

onMounted(() => {
  draft.value = props.side === 'local' ? store.localPath : store.remotePath
  currentPath.value = draft.value
})

onBeforeUnmount(() => {
  if (suggestTimer) clearTimeout(suggestTimer)
})
</script>

<template>
  <div class="ft-pathbar">
    <BaseInput
      v-model="draft"
      size="sm"
      variant="plain"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-label="side === 'local' ? '本地路径' : '远程路径'"
      autocomplete="off"
      @update:model-value="onInput"
      @keydown="onKeydown"
      @blur="onBlur"
    />
    <div
      v-if="sug?.open && sug.list.length"
      class="ft-path-suggest"
      role="listbox"
    >
      <div
        v-for="(item, i) in sug.list"
        :key="item.name"
        class="ft-suggest-item"
        :class="{ 'is-active': i === sug.active }"
        role="option"
        @mousedown="onSuggestDown($event, i)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        </svg>
        <span class="ft-suggest-name">{{ item.name }}</span>
      </div>
    </div>
  </div>
</template>
