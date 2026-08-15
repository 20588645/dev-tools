<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import BaseSegmented, { type SegmentOption } from '@/components/navigation/BaseSegmented.vue'
import type { NotebookSummary } from '@/services/modules/notebook-service'

import type {
  NotebookFilter,
  NotebookLoadState,
  NotebookSort,
} from '../composables/useNotebook'

const props = defineProps<{
  notes: NotebookSummary[]
  currentId: string
  totalCount: number
  pinnedCount: number
  mediaCount: number
  search: string
  appliedSearch: string
  filter: NotebookFilter
  sort: NotebookSort
  listState: NotebookLoadState
  listError: string
}>()

const emit = defineEmits<{
  select: [id: string]
  retry: []
  'update:search': [value: string]
  'update:filter': [value: NotebookFilter]
  'update:sort': [value: NotebookSort]
  move: [id: string, direction: -1 | 1]
}>()

const sortOptions = [
  { label: '最近更新', value: 'updated' },
  { label: '创建时间', value: 'created' },
  { label: '手动排序', value: 'manual' },
]

const filterOptions = computed<SegmentOption[]>(() => [
  { label: `全部 ${props.totalCount}`, value: 'all' },
  { label: `置顶 ${props.pinnedCount}`, value: 'pinned' },
  { label: `图片 ${props.mediaCount}`, value: 'media' },
])

const manualDisabled = computed(() => props.filter !== 'all' || Boolean(props.appliedSearch))

function formatUpdated(value: string) {
  if (!value) return '尚未保存'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  }
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <BaseCard
    class="notebook-list-panel"
    content-padding="0"
    content-layout="fill"
    content-overflow="hidden"
    fill-height
  >
    <header class="notebook-list-panel__header">
      <BaseInput
        class="notebook-list-panel__search"
        :model-value="search"
        type="search"
        variant="search"
        size="sm"
        placeholder="搜索标题或正文…"
        aria-label="搜索个人笔记"
        @update:model-value="emit('update:search', $event)"
      >
        <template #prefix><span aria-hidden="true">⌕</span></template>
      </BaseInput>
      <BaseSelect
        class="notebook-list-panel__sort"
        size="sm"
        :model-value="sort"
        :options="sortOptions"
        aria-label="笔记排序"
        @update:model-value="emit('update:sort', $event as NotebookSort)"
      />
    </header>

    <div class="notebook-list-panel__filters" aria-label="笔记筛选">
      <BaseSegmented
        :model-value="filter"
        :options="filterOptions"
        aria-label="笔记筛选"
        @update:model-value="emit('update:filter', $event as NotebookFilter)"
      />
      <span v-if="appliedSearch" class="notebook-list-panel__result">“{{ appliedSearch }}” · {{ notes.length }} 项</span>
    </div>

    <div v-if="listState === 'loading' && notes.length === 0" class="notebook-list-panel__state">
      <LoadingState compact label="正在加载笔记…" />
    </div>
    <div v-else-if="listState === 'error' && notes.length === 0" class="notebook-list-panel__state">
      <ErrorState compact title="笔记列表加载失败" :description="listError" @retry="emit('retry')" />
    </div>
    <div v-else-if="notes.length === 0" class="notebook-list-panel__state">
      <EmptyState
        compact
        :title="appliedSearch ? '没有匹配的笔记' : '这里还没有笔记'"
        :description="appliedSearch ? `没有找到“${appliedSearch}”相关内容` : '点击右上角新建第一篇笔记'"
      />
    </div>
    <div v-else class="notebook-note-list" role="listbox" aria-label="笔记列表">
      <div
        v-for="(note, index) in notes"
        :key="note.id"
        class="notebook-note-row"
        role="presentation"
      >
        <BaseSelectableItem
          class="notebook-note-item"
          :selected="note.id === currentId"
          role="option"
          :aria-selected="note.id === currentId"
          @click="emit('select', note.id)"
        >
          <span class="notebook-note-item__heading">
            <strong>{{ note.title || '无标题' }}</strong>
            <small v-if="note.pinned">PIN</small>
          </span>
          <span class="notebook-note-item__preview">
            {{ note.preview || '暂无正文内容' }}
            <span class="notebook-note-item__meta">
              · {{ formatUpdated(note.updatedAt) }}<template v-if="note.hasMedia"> · 含图片</template>
            </span>
          </span>
        </BaseSelectableItem>
        <span v-if="sort === 'manual'" class="notebook-note-item__order" @click.stop>
          <BaseButton
            variant="ghost"
            size="sm"
            :disabled="manualDisabled || index === 0"
            :aria-label="`上移笔记：${note.title || '无标题'}`"
            @click="emit('move', note.id, -1)"
          >↑</BaseButton>
          <BaseButton
            variant="ghost"
            size="sm"
            :disabled="manualDisabled || index === notes.length - 1"
            :aria-label="`下移笔记：${note.title || '无标题'}`"
            @click="emit('move', note.id, 1)"
          >↓</BaseButton>
        </span>
      </div>
    </div>

    <footer v-if="sort === 'manual' && manualDisabled" class="notebook-list-panel__footer">
      清空搜索并切换到“全部”后可调整顺序
    </footer>
  </BaseCard>
</template>
