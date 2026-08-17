<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseSelect, { type SelectOption } from '@/components/form/BaseSelect.vue'
import SidePanel from '@/components/layout/SidePanel.vue'
import BaseSegmented, { type SegmentOption } from '@/components/navigation/BaseSegmented.vue'
import BaseDropdownMenu, { type DropdownMenuOption } from '@/components/overlay/BaseDropdownMenu.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import {
  generateGitActivity,
  getReportConfig,
  type ReportRepoResult,
} from '@/services/modules/report-service'
import { useNotificationStore } from '@/stores/notification'

import { gitActivityAlreadyInserted } from '../git-activity-text'

export type ReferenceInsertMode = 'commit' | 'current' | 'target'

export interface GitActivityItem {
  id: string
  date: string
  weekday: string
  repo: string
  repoUrl: string
  branch: string
  group: string
  author: string
  subject: string
  hash: string
}

type ReferenceStatus = 'idle' | 'loading' | 'success' | 'partial' | 'empty' | 'unconfigured' | 'error'
type GroupMode = 'date' | 'repo'
type FilterMode = 'all' | 'current'
type BatchMode = 'commit' | 'current'

const props = defineProps<{
  open: boolean
  weekLabel: string
  weekDates: string[]
  selectedDate: string
  noteContents: Record<string, string>
  canUndo: boolean
}>()

const emit = defineEmits<{
  close: []
  openSettings: []
  selectDate: [date: string]
  insert: [items: GitActivityItem[], mode: ReferenceInsertMode, targetDate?: string]
  undo: []
}>()

const notifications = useNotificationStore()
const status = ref<ReferenceStatus>('idle')
const errorMessage = ref('')
const author = ref('')
const results = ref<ReportRepoResult[]>([])
const markdown = ref('')
const lastUpdatedAt = ref<Date | null>(null)
const loadedWeekKey = ref('')
const groupMode = ref<GroupMode>('date')
const filterMode = ref<FilterMode>('all')
const targetDate = ref(props.selectedDate)
const batchMode = ref<BatchMode>('commit')
const selectedIds = ref(new Set<string>())

const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const groupOptions: SegmentOption[] = [
  { label: '按日期', value: 'date' },
  { label: '按仓库', value: 'repo' },
]
const filterOptions = computed<SegmentOption[]>(() => [
  { label: '全部', value: 'all' },
  { label: `仅 ${targetDate.value.slice(5)}`, value: 'current' },
])
const batchOptions: SelectOption[] = [
  { label: '按提交日期', value: 'commit' },
  { label: '写入目标日期', value: 'current' },
]
const moreOptions: DropdownMenuOption[] = [
  { label: '复制本周摘要', key: 'copy-summary' },
  { label: '复制提交明细', key: 'copy-details' },
  { label: '导出 Markdown', key: 'export-markdown' },
]

const weekKey = computed(() => `${props.weekDates[0] ?? ''}:${props.weekDates.at(-1) ?? ''}`)
const dateOptions = computed<SelectOption[]>(() => props.weekDates.map((date) => ({
  value: date,
  label: `${date.slice(5)} · ${weekdayFor(date)}`,
})))
const failedCount = computed(() => results.value.filter((item) => item.error).length)
const configuredCount = computed(() => results.value.length)
const activities = computed<GitActivityItem[]>(() => results.value.flatMap((result) => {
  const repo = projectName(result)
  return result.logs.map((log) => ({
    id: `${result.repo || result.project}:${log.hash}:${log.date}`,
    date: log.date,
    weekday: weekdayFor(log.date),
    repo,
    repoUrl: result.repo,
    branch: result.branch,
    group: result.group,
    author: log.author,
    subject: log.subject,
    hash: log.hash,
  }))
}))
const activeDateCount = computed(() => new Set(activities.value.map((item) => item.date)).size)
const filteredActivities = computed(() => filterMode.value === 'current'
  ? activities.value.filter((item) => item.date === targetDate.value)
  : activities.value)
const groupedActivities = computed(() => {
  const groups = new Map<string, GitActivityItem[]>()
  filteredActivities.value.forEach((item) => {
    const key = groupMode.value === 'date' ? item.date : item.repo
    groups.set(key, [...(groups.get(key) ?? []), item])
  })
  return Array.from(groups.entries()).map(([key, items]) => ({
    key,
    label: groupMode.value === 'date' ? `${weekdayFor(key)} · ${key.slice(5)}` : key,
    caption: `${items.length} 次提交`,
    items,
  }))
})
const selectedItems = computed(() => activities.value.filter((item) => selectedIds.value.has(item.id)))
const canInsertSelection = computed(() => selectedItems.value.some((item) => {
  const date = batchMode.value === 'commit' ? item.date : targetDate.value
  return !isInserted(item, date)
}))
const lastUpdatedLabel = computed(() => lastUpdatedAt.value
  ? lastUpdatedAt.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
  : '尚未查询')

function weekdayFor(date: string) {
  const parsed = new Date(`${date}T12:00:00`)
  return weekdayNames[parsed.getDay()] ?? ''
}

function projectName(result: ReportRepoResult) {
  const value = result.project || result.repo
  return value.split('/').filter(Boolean).at(-1)?.replace(/\.git$/, '') || '未命名仓库'
}

function isInserted(item: GitActivityItem, date: string) {
  return gitActivityAlreadyInserted(props.noteContents[date] ?? '', item)
}

function updateSelection(id: string, checked: boolean) {
  const next = new Set(selectedIds.value)
  if (checked) next.add(id)
  else next.delete(id)
  selectedIds.value = next
}

function chooseTargetDate(date: string) {
  targetDate.value = date
  emit('selectDate', date)
}

function insertOne(item: GitActivityItem) {
  if (isInserted(item, targetDate.value)) return
  emit('insert', [item], 'target', targetDate.value)
}

function insertSelected() {
  if (!canInsertSelection.value) {
    notifications.push('所选提交已经加入对应工时日期', 'warning')
    return
  }
  emit('insert', selectedItems.value, batchMode.value)
  selectedIds.value = new Set()
}

async function loadActivity(force = false) {
  if (!props.open || !props.weekDates.length) return
  if (!force && loadedWeekKey.value === weekKey.value && status.value !== 'error') return

  status.value = 'loading'
  errorMessage.value = ''
  selectedIds.value = new Set()

  try {
    const config = await getReportConfig()
    author.value = config.author
    const repos = config.repos.filter((item) => item.repo.trim())
    if (!config.token || repos.length === 0) {
      results.value = []
      markdown.value = ''
      status.value = 'unconfigured'
      loadedWeekKey.value = weekKey.value
      return
    }

    const generated = await generateGitActivity({
      token: config.token,
      author: config.author,
      since: props.weekDates[0],
      until: props.weekDates.at(-1) ?? props.weekDates[0],
      repos,
    })
    results.value = generated.results
    markdown.value = generated.markdown
    lastUpdatedAt.value = new Date()
    loadedWeekKey.value = weekKey.value

    if (generated.results.length > 0 && generated.results.every((item) => item.error)) {
      status.value = 'error'
      errorMessage.value = '所有仓库均查询失败，请检查网络、Token 与仓库配置。'
    } else if (generated.results.some((item) => item.error)) {
      status.value = 'partial'
    } else if (generated.results.every((item) => item.logs.length === 0)) {
      status.value = 'empty'
    } else {
      status.value = 'success'
    }
  } catch (error) {
    results.value = []
    markdown.value = ''
    status.value = 'error'
    errorMessage.value = error instanceof Error ? error.message : '暂时无法查询 Git 活动'
  }
}

function summaryText() {
  return [
    `Git 活动 · ${props.weekLabel}`,
    `作者：${author.value || '全部'}`,
    `仓库：${configuredCount.value}`,
    `提交：${activities.value.length}`,
    `活跃日期：${activeDateCount.value}`,
  ].join('\n')
}

function detailsText() {
  return activities.value
    .map((item) => `${item.date} [${item.repo}] ${item.subject}（${item.hash}）`)
    .join('\n')
}

async function copyText(value: string, message: string) {
  try {
    await navigator.clipboard.writeText(value)
    notifications.push(message, 'success')
  } catch {
    notifications.push('复制失败，请检查剪贴板权限', 'error')
  }
}

function exportMarkdown() {
  const content = markdown.value || `${summaryText()}\n\n## 提交明细\n\n${detailsText()}\n`
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `git-activity-${props.weekDates[0]}_${props.weekDates.at(-1)}.md`
  link.click()
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000)
  notifications.push('Git 活动 Markdown 已导出', 'success')
}

function handleMoreAction(key: string) {
  if (key === 'copy-summary') void copyText(summaryText(), '本周 Git 活动摘要已复制')
  if (key === 'copy-details') void copyText(detailsText(), '本周 Git 活动明细已复制')
  if (key === 'export-markdown') exportMarkdown()
}

watch(() => props.selectedDate, (date) => {
  if (date && props.weekDates.includes(date)) targetDate.value = date
}, { immediate: true })

watch([() => props.open, weekKey], ([open]) => {
  if (open) void loadActivity()
}, { immediate: true })
</script>

<template>
  <SidePanel
    v-if="open"
    class="notes-reference-panel"
    title="Git 活动参考"
    subtitle="选择后才会写入工时内容"
    width="100%"
  >
    <template #actions>
      <BaseIconButton
        label="刷新数据"
        size="sm"
        :disabled="status === 'loading'"
        @click="loadActivity(true)"
      >↻</BaseIconButton>
      <BaseButton variant="ghost" size="sm" @click="emit('openSettings')">仓库设置</BaseButton>
      <BaseButton variant="outline" size="sm" @click="emit('close')">关闭</BaseButton>
    </template>

    <div
      class="notes-reference-body"
      :class="{ 'is-unconfigured': status === 'unconfigured' }"
    >
      <section class="notes-reference-query">
        <div>
          <strong>当前周代码活动</strong>
          <span>作者 {{ author || '全部' }} · {{ configuredCount }} 个仓库 · 最近更新 {{ lastUpdatedLabel }}</span>
        </div>
        <div class="notes-reference-query__meta">
          <BaseBadge>{{ weekDates[0]?.slice(5) }} — {{ weekDates.at(-1)?.slice(5) }}</BaseBadge>
          <BaseBadge>分支：按仓库配置</BaseBadge>
          <BaseBadge>时区：Asia/Shanghai</BaseBadge>
        </div>
      </section>

      <section v-if="status !== 'loading' && status !== 'unconfigured'" class="notes-reference-summary" aria-label="本周 Git 活动汇总">
        <div><strong>{{ configuredCount }}</strong><span>已配置仓库</span></div>
        <div><strong>{{ activities.length }}</strong><span>本周提交</span></div>
        <div><strong>{{ activeDateCount }}</strong><span>活跃日期</span></div>
        <div><strong>{{ failedCount }}</strong><span>查询失败</span></div>
      </section>

      <LoadingState v-if="status === 'loading' || status === 'idle'" compact label="正在查询当前周 Git 活动…" />

      <EmptyState
        v-else-if="status === 'unconfigured'"
        compact
        title="先完成 GitLab 配置"
        description="Token、默认作者和仓库列表统一在系统设置中维护。"
      >
        <template #actions>
          <BaseButton variant="secondary" @click="emit('openSettings')">前往系统设置</BaseButton>
        </template>
      </EmptyState>

      <ErrorState
        v-else-if="status === 'error'"
        compact
        title="暂时无法查询代码活动"
        :description="errorMessage"
        @retry="loadActivity(true)"
      />

      <EmptyState
        v-else-if="status === 'empty'"
        compact
        title="本周暂时没有提交"
        description="已完成全部仓库查询，没有找到符合当前周和作者条件的提交。"
      >
        <template #actions>
          <BaseButton variant="outline" @click="loadActivity(true)">重新查询</BaseButton>
        </template>
      </EmptyState>

      <div v-else class="notes-reference-activity">
        <div v-if="status === 'partial'" class="notes-reference-notice" role="status">
          <div>
            <strong>部分仓库查询失败</strong>
            <span>其余仓库结果已正常展示，可刷新后重试失败项。</span>
          </div>
          <BaseButton variant="ghost" size="sm" @click="loadActivity(true)">重新查询</BaseButton>
        </div>

        <div class="notes-reference-controls">
          <BaseSegmented v-model="groupMode" :options="groupOptions" aria-label="Git 活动分组方式" />
          <BaseSegmented v-model="filterMode" :options="filterOptions" aria-label="Git 活动日期过滤" />
        </div>

        <div class="notes-reference-target">
          <div class="notes-reference-target__copy">
            <strong>目标工时日期</strong>
            <span>逐条加入时写入这里，也可以直接点击左侧日期切换</span>
          </div>
          <BaseSelect
            class="notes-reference-target__control"
            :model-value="targetDate"
            :options="dateOptions"
            aria-label="目标工时日期"
            @update:model-value="chooseTargetDate"
          />
        </div>

        <div class="notes-reference-groups">
          <section v-for="group in groupedActivities" :key="group.key" class="notes-reference-group">
            <header>
              <strong>{{ group.label }}</strong>
              <span>{{ group.caption }}</span>
            </header>
            <article v-for="item in group.items" :key="item.id" class="notes-reference-commit">
              <BaseCheckbox
                class="notes-reference-commit__select"
                :model-value="selectedIds.has(item.id)"
                :label="`选择提交：${item.subject}`"
                @update:model-value="updateSelection(item.id, $event)"
              />
              <div class="notes-reference-commit__copy">
                <strong>{{ item.subject }}</strong>
                <span>{{ item.repo }}<small v-if="item.branch">{{ item.branch }}</small></span>
              </div>
              <div class="notes-reference-commit__meta">
                <span>{{ item.date.slice(5) }}</span>
                <code>{{ item.hash }}</code>
              </div>
              <BaseButton
                variant="outline"
                size="sm"
                :disabled="isInserted(item, targetDate)"
                @click="insertOne(item)"
              >
                {{ isInserted(item, targetDate) ? '已加入' : `加入 ${targetDate.slice(5)}` }}
              </BaseButton>
            </article>
          </section>

          <EmptyState
            v-if="groupedActivities.length === 0"
            compact
            title="当前日期没有提交"
            description="切换为“全部”，或选择其他目标日期查看。"
          />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="notes-reference-footer">
        <span class="notes-reference-selection">已选 <strong>{{ selectedIds.size }}</strong> 条</span>
        <div>
          <BaseSelect v-model="batchMode" :options="batchOptions" aria-label="批量写入方式" />
          <BaseButton variant="ghost" size="sm" :disabled="!canUndo" @click="emit('undo')">撤销上次</BaseButton>
          <BaseDropdownMenu :options="moreOptions" @select="handleMoreAction">
            <BaseButton variant="ghost" size="sm">更多</BaseButton>
          </BaseDropdownMenu>
          <BaseButton size="sm" :disabled="!canInsertSelection" @click="insertSelected">加入所选</BaseButton>
        </div>
      </div>
    </template>
  </SidePanel>
</template>
