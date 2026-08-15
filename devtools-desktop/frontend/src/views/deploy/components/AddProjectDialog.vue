<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSegmented, { type SegmentOption } from '@/components/navigation/BaseSegmented.vue'
import type { AvailableProject, BrowseEntry } from '@/services/modules/deploy-service'

import type { AddProjectMode, BreadcrumbSegment, ScanEmptyKind } from '../composables/useAddProject'

defineOptions({ name: 'AddProjectDialog' })

defineProps<{
  open: boolean
  mode: AddProjectMode
  /** 搜索后可见的候选项目。 */
  visibleAvailable: AvailableProject[]
  scanChecked: Set<string>
  scanEmptyKind: ScanEmptyKind
  scanLoading: boolean
  query: string
  entries: BrowseEntry[]
  browseChecked: Set<string>
  breadcrumbs: BreadcrumbSegment[]
  browseLoading: boolean
  selectedCount: number
  submitLabel: string
  submitting: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  'update:mode': [mode: AddProjectMode]
  'update:query': [value: string]
  'toggle-scan': [path: string]
  'toggle-all-scan': [select: boolean]
  'toggle-browse': [path: string]
  navigate: [path: string]
  submit: []
}>()

const MODE_OPTIONS: SegmentOption[] = [
  { value: 'scan', label: '自动扫描' },
  { value: 'browse', label: '手动浏览' },
]

/** 三种空态各给一句，区分「目录下没有项目」「搜索没命中」「都添加过了」。 */
const SCAN_EMPTY: Record<ScanEmptyKind, { title: string, description?: string }> = {
  'none-found': { title: '未发现前端项目', description: '扫描目录下没有可添加的项目，可切到「手动浏览」选择嵌套目录' },
  'no-match': { title: '没有匹配的项目' },
  'all-added': { title: '所有项目已添加' },
}
</script>

<template>
  <BaseDialog
    :model-value="open"
    title="添加项目"
    subtitle="从扫描目录挑选，或手动浏览嵌套的项目文件夹"
    width="min(720px, 94vw)"
    body-max-height="min(560px, 70vh)"
    @update:model-value="!$event && emit('close')"
  >
    <div class="add-project">
      <BaseSegmented
        :model-value="mode"
        :options="MODE_OPTIONS"
        aria-label="添加方式"
        @update:model-value="emit('update:mode', $event as AddProjectMode)"
      />

      <!-- 自动扫描 -->
      <template v-if="mode === 'scan'">
        <div class="add-project__panel">
          <div class="add-project__toolbar">
            <BaseInput
              :model-value="query"
              type="search"
              variant="search"
              class="add-project__search"
              aria-label="搜索项目"
              placeholder="搜索项目..."
              @update:model-value="emit('update:query', $event)"
            />
            <BaseButton variant="secondary" size="sm" @click="emit('toggle-all-scan', true)">全选</BaseButton>
            <BaseButton variant="secondary" size="sm" @click="emit('toggle-all-scan', false)">全不选</BaseButton>
            <span class="add-project__count">已选 {{ scanChecked.size }} 个</span>
          </div>

          <LoadingState v-if="scanLoading" label="正在扫描项目…" />
          <EmptyState
            v-else-if="visibleAvailable.length === 0"
            compact
            :title="SCAN_EMPTY[scanEmptyKind].title"
            :description="SCAN_EMPTY[scanEmptyKind].description"
          />
          <div v-else class="add-project__grid">
            <BaseSelectableItem
              v-for="item in visibleAvailable"
              :key="item.path"
              :selected="scanChecked.has(item.path)"
              :pressed="scanChecked.has(item.path)"
              @click="emit('toggle-scan', item.path)"
            >
              <span class="add-project__cell">
                <!--
                  整行可点，勾选框自身也可点。两者必须互斥：不 stop 的话点勾选框会
                  同时触发它的 update 与冒泡到外层行按钮的 click，两次 toggle 相互
                  抵消，表现为「点勾选框没反应」。
                -->
                <span @click.stop>
                  <BaseCheckbox
                    :model-value="scanChecked.has(item.path)"
                    :label="item.name"
                    @update:model-value="emit('toggle-scan', item.path)"
                  />
                </span>
              </span>
            </BaseSelectableItem>
          </div>
        </div>
      </template>

      <!-- 手动浏览 -->
      <template v-else>
        <div class="add-project__panel">
          <nav class="add-project__breadcrumb" aria-label="目录路径">
            <template v-for="(segment, index) in breadcrumbs" :key="segment.path">
              <span v-if="index > 0" class="add-project__separator" aria-hidden="true">/</span>
              <BaseButton
                variant="ghost"
                size="sm"
                :disabled="index === breadcrumbs.length - 1"
                @click="emit('navigate', segment.path)"
              >
                {{ segment.label }}
              </BaseButton>
            </template>
            <span class="add-project__count">已选 {{ browseChecked.size }} 个</span>
          </nav>

          <LoadingState v-if="browseLoading" label="正在读取目录…" />
          <EmptyState v-else-if="entries.length === 0" compact title="此目录下没有子文件夹" />
          <div v-else class="add-project__list">
            <BaseSelectableItem
              v-for="entry in entries"
              :key="entry.path"
              appearance="row"
              :selected="browseChecked.has(entry.path)"
              :pressed="entry.isProject && !entry.alreadyAdded ? browseChecked.has(entry.path) : undefined"
              :disabled="entry.isProject ? entry.alreadyAdded : !entry.hasSubDirs"
              @click="entry.isProject ? emit('toggle-browse', entry.path) : emit('navigate', entry.path)"
            >
              <span class="add-project__row">
                <!-- 同上：勾选框的点击不能再冒泡成整行的 toggle -->
                <span v-if="entry.isProject && !entry.alreadyAdded" @click.stop>
                  <BaseCheckbox
                    :model-value="browseChecked.has(entry.path)"
                    :label="entry.name"
                    @update:model-value="emit('toggle-browse', entry.path)"
                  />
                </span>
                <span v-else class="add-project__row-name">
                  <svg
                    class="add-project__icon"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <!-- 已添加的项目用勾，普通目录用文件夹 -->
                    <template v-if="entry.isProject">
                      <path d="M20 6 9 17l-5-5" />
                    </template>
                    <template v-else>
                      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                    </template>
                  </svg>
                  <span :title="entry.name">{{ entry.name }}</span>
                </span>

                <span class="add-project__tag">
                  {{ entry.isProject ? (entry.alreadyAdded ? '已添加' : '前端项目') : (entry.hasSubDirs ? '→' : '空') }}
                </span>
              </span>
            </BaseSelectableItem>
          </div>
        </div>
      </template>

      <p v-if="error" class="add-project__error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <BaseButton variant="secondary" @click="emit('close')">取消</BaseButton>
      <BaseButton
        variant="primary"
        :disabled="selectedCount === 0"
        :loading="submitting"
        :title="selectedCount === 0 ? '请先勾选要添加的项目' : undefined"
        @click="emit('submit')"
      >
        {{ submitLabel }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.add-project { display: grid; gap: var(--space-3); }

.add-project__panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.add-project__toolbar,
.add-project__breadcrumb {
  display: flex;
  flex-wrap: wrap;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-border-soft);
}

.add-project__search { flex: 1 1 180px; min-width: 0; }

.add-project__count {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* 候选项数量不可预期（实测 27 项），本区自滚，不把弹窗撑出视口 */
.add-project__grid {
  display: grid;
  overflow-y: auto;
  max-height: 340px;
  gap: 8px;
  padding: 10px;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  --base-selectable-min-height: 36px;
  --base-selectable-padding: 7px 10px;
  --base-selectable-radius: 10px;
  --base-selectable-background: var(--color-surface-subtle);
  --base-selectable-hover-transform: none;
  --base-selectable-selected-shadow: none;
  --base-selectable-selected-background: color-mix(in srgb, var(--color-action) 10%, var(--color-surface));
  --base-selectable-selected-border: color-mix(in srgb, var(--color-action) 28%, var(--color-border));
}

.add-project__list {
  display: grid;
  overflow-y: auto;
  max-height: 340px;
  gap: 2px;
  padding: 6px 8px 10px;
}

.add-project__cell,
.add-project__row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}

.add-project__row-name {
  display: flex;
  overflow: hidden;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add-project__icon { flex: none; }

.add-project__tag {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.add-project__separator {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.add-project__error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-xs);
}
</style>
