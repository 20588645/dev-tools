<script setup lang="ts">
/**
 * 公共日志查看器：本地运行与部署面板共用。
 *
 * 取代旧 `#logModal` 的整块 DOM 与 `app.js` 里散落的 appendLog / setStep* /
 * 日志搜索 / updateLogModalCloseBtn。
 *
 * 外壳复用 `BaseDialog`（NModal 二次封装），不自建覆盖层——手写 position:fixed
 * 会缺少 NModal 自带的 teleport，挂在非激活 `.page`（display:none）下时整个弹窗
 * 不可见，表现为「点了没反应」。
 *
 * 行为等价点：
 * - 智能滚动：内容未占满时回顶（不裁切开头），占满时仅在用户原本贴底时跟随。
 * - 行数上限 3000，超出丢弃最早的行。
 * - Cmd/Ctrl+F 打开行内搜索，Enter / Shift+Enter 前后跳，Esc 关闭。
 * - 任务仍在进行时，关闭按钮变「最小化」，关闭动作交由父级决定（发 minimize）。
 */
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseProgress from '@/components/base/BaseProgress.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import { useEventListener } from '@/composables/use-event-listener'

import { parseLogLine, type LogLineType } from './log-format'

export interface LogLine {
  /** 单调递增，供 v-for key 使用；父级无需关心具体值。 */
  id: number
  text: string
  type: LogLineType
}

export interface LogStep {
  label: string
  state: 'pending' | 'active' | 'done'
}

/** 进度语义。`indeterminate` 用于「在跑但时长未知」（编译期），不再停在中间百分比。 */
export type LogProgressTone = 'action' | 'success' | 'warning' | 'danger'

const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  subtitle?: string
  lines: LogLine[]
  steps?: LogStep[]
  /** 0–100；indeterminate 为 true 时忽略。 */
  percent?: number
  indeterminate?: boolean
  progressLabel?: string
  progressTone?: LogProgressTone
  /** 底部结论区：留空则不显示。 */
  resultIcon?: string
  resultText?: string
  /** 结论区尾部的弱化补充（本地运行的「已等待 42s」）。 */
  resultNote?: string
  /** 任务仍在进行：关闭按钮变「最小化」，并发 minimize 而非 update:modelValue。 */
  running?: boolean
  /**
   * 更新安装这类不可中断任务：进行中不允许关掉或最小化弹窗。
   * 结束后仍可关闭。
   */
  lockOpen?: boolean
}>(), {
  subtitle: '',
  steps: () => [],
  percent: 0,
  indeterminate: false,
  progressLabel: '',
  progressTone: 'action',
  resultIcon: '',
  resultText: '',
  resultNote: '',
  running: false,
  lockOpen: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  minimize: []
  'open-source': [payload: { path: string; line: number; column: number | null }]
}>()

const terminal = useTemplateRef<HTMLElement>('terminal')
const searchInput = useTemplateRef<{ focus: () => void }>('searchInput')
const searchOpen = ref(false)
const keyword = ref('')
const activeMatch = ref(0)

const MAX_LINES = 3000
/** 超出上限时丢弃最早的行，与旧实现一致（避免长时间运行的 dev server 撑爆 DOM）。 */
const visibleLines = computed(() =>
  props.lines.length > MAX_LINES ? props.lines.slice(props.lines.length - MAX_LINES) : props.lines,
)

const normalizedKeyword = computed(() => keyword.value.trim().toLowerCase())
const matchedIds = computed(() => {
  if (!normalizedKeyword.value) return []
  return visibleLines.value
    .filter((line) => line.text.toLowerCase().includes(normalizedKeyword.value))
    .map((line) => line.id)
})
const searchInfo = computed(() => {
  if (!normalizedKeyword.value) return ''
  if (matchedIds.value.length === 0) return '无匹配'
  return `${activeMatch.value + 1}/${matchedIds.value.length}`
})
const activeMatchId = computed(() => matchedIds.value[activeMatch.value] ?? null)

/**
 * 智能滚动：内容未占满容器时强制回顶，保证日志开头不被裁切；占满时只在
 * 用户原本就贴底时才跟随最新。rAF 等布局结算，规避弹窗开场动画期间的瞬态尺寸。
 */
function scrollToLatest(wasAtBottom: boolean) {
  const element = terminal.value
  if (!element) return
  requestAnimationFrame(() => {
    if (element.scrollHeight <= element.clientHeight + 2) element.scrollTop = 0
    else if (wasAtBottom) element.scrollTop = element.scrollHeight
  })
}

watch(() => props.lines.length, (next, previous) => {
  const element = terminal.value
  const wasAtBottom = element
    ? element.scrollHeight - element.scrollTop - element.clientHeight < 60
    : true
  // 行数减少说明父级重置了日志（换任务），此时回顶而不是跟随。
  void nextTick(() => scrollToLatest(next >= (previous ?? 0) ? wasAtBottom : true))
})

watch(() => props.modelValue, (open) => {
  if (open) void nextTick(() => scrollToLatest(true))
  else closeSearch()
})

watch(matchedIds, () => {
  if (activeMatch.value >= matchedIds.value.length) activeMatch.value = 0
  void nextTick(scrollActiveMatchIntoView)
})

function scrollActiveMatchIntoView() {
  if (activeMatchId.value === null) return
  terminal.value
    ?.querySelector(`[data-line-id="${activeMatchId.value}"]`)
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

function openSearch() {
  searchOpen.value = true
  void nextTick(() => searchInput.value?.focus())
}

function closeSearch() {
  searchOpen.value = false
  keyword.value = ''
  activeMatch.value = 0
}

function stepMatch(delta: number) {
  if (matchedIds.value.length === 0) return
  const count = matchedIds.value.length
  activeMatch.value = (activeMatch.value + delta + count) % count
  scrollActiveMatchIntoView()
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    stepMatch(event.shiftKey ? -1 : 1)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    closeSearch()
  }
}

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (!props.modelValue) return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    openSearch()
  }
})

/** 进行中时关闭即最小化到后台，由父级决定提示文案与后续行为。 */
function requestClose() {
  if (props.lockOpen && props.running) return
  if (props.running) emit('minimize')
  else emit('update:modelValue', false)
}

const showFooter = computed(() => Boolean(props.resultText) || !(props.lockOpen && props.running))
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    :title="title"
    :subtitle="subtitle"
    size="log"
    :closable="!(lockOpen && running)"
    :close-label="running && !lockOpen ? '最小化到后台' : '关闭'"
    class="log-viewer"
    @update:model-value="!$event && requestClose()"
  >
    <div class="log-viewer__stack">
      <div v-if="steps.length > 0 || progressLabel || !indeterminate" class="log-viewer__progress">
        <div v-if="steps.length > 0" class="log-viewer__steps">
          <span
            v-for="step in steps"
            :key="step.label"
            class="log-viewer__step"
            :class="`is-${step.state}`"
            :data-tone="progressTone"
          >
            <i class="log-viewer__step-dot" />{{ step.label }}
          </span>
        </div>
        <BaseProgress
          :value="indeterminate ? 100 : percent"
          :tone="progressTone"
          :processing="indeterminate"
          :label="progressLabel || '任务进度'"
        />
        <span class="log-viewer__progress-label" :data-tone="progressTone">{{ progressLabel }}</span>
      </div>

      <div v-if="searchOpen" class="log-viewer__search">
        <span aria-hidden="true">🔍</span>
        <BaseInput
          ref="searchInput"
          v-model="keyword"
          class="log-viewer__search-input"
          type="search"
          placeholder="搜索日志..."
          aria-label="搜索日志"
          @keydown="onSearchKeydown"
        />
        <span class="log-viewer__search-info">{{ searchInfo }}</span>
        <BaseButton variant="ghost" size="sm" title="上一个" aria-label="上一个匹配" @click="stepMatch(-1)">↑</BaseButton>
        <BaseButton variant="ghost" size="sm" title="下一个" aria-label="下一个匹配" @click="stepMatch(1)">↓</BaseButton>
        <BaseButton variant="ghost" size="sm" title="关闭搜索" aria-label="关闭搜索" @click="closeSearch">✕</BaseButton>
      </div>

      <div ref="terminal" class="log-viewer__terminal" tabindex="0" role="log" aria-live="polite">
        <div
          v-for="line in visibleLines"
          :key="line.id"
          class="log-viewer__line"
          :class="[
            `is-${line.type}`,
            {
              'is-match': matchedIds.includes(line.id),
              'is-active-match': line.id === activeMatchId,
            },
          ]"
          :data-line-id="line.id"
        >
          <template v-for="(segment, index) in parseLogLine(line.text)" :key="index">
            <a
              v-if="segment.kind === 'link'"
              class="log-viewer__link"
              href="#"
              @click.prevent="emit('open-source', { path: segment.path, line: segment.line, column: segment.column })"
            >{{ segment.text }}</a>
            <span
              v-else
              :style="{ color: segment.color || undefined, fontWeight: segment.bold ? 'var(--font-weight-bold)' : undefined }"
            >{{ segment.text }}</span>
          </template>
        </div>
      </div>

    </div>

    <template v-if="showFooter" #footer>
      <div class="log-viewer__footer">
        <div v-if="resultText" class="log-viewer__result" :data-tone="progressTone">
          <span v-if="resultIcon" aria-hidden="true">{{ resultIcon }}</span>
          <span>{{ resultText }}</span>
          <span v-if="resultNote" class="log-viewer__result-note">{{ resultNote }}</span>
        </div>
        <BaseButton v-if="!(lockOpen && running)" variant="secondary" @click="requestClose">
          {{ running ? '最小化' : '关闭' }}
        </BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
/* 外壳（遮罩、层级、teleport、头部、底部）由 BaseDialog / NModal 负责 */
.log-viewer__stack {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: var(--space-3);
}

.log-viewer__footer {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  justify-content: flex-end;
  width: 100%;
}

.log-viewer__progress {
  display: grid;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2) var(--space-3);
  align-items: center;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-subtle);
}

.log-viewer__steps {
  display: flex;
  grid-column: 1 / -1;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
  overflow-x: auto;
}

.log-viewer__step {
  display: inline-flex;
  flex: 0 0 auto;
  gap: var(--space-1);
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  white-space: nowrap;
}

.log-viewer__step-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-pill);
  background: var(--color-border-strong);
}

.log-viewer__step.is-active {
  border-color: color-mix(in srgb, var(--color-action) 42%, transparent);
  background: color-mix(in srgb, var(--color-action) 12%, transparent);
  color: var(--color-action);
}

.log-viewer__step.is-active .log-viewer__step-dot { background: var(--color-action); }

.log-viewer__step.is-done {
  border-color: color-mix(in srgb, var(--color-success) 34%, transparent);
  background: color-mix(in srgb, var(--color-success) 12%, transparent);
  color: var(--color-success);
}

.log-viewer__step.is-done .log-viewer__step-dot { background: var(--color-success); }

/* 报错态压过步骤自身的成功/进行色，让整条进度语义一致。 */
.log-viewer__step[data-tone="danger"].is-active,
.log-viewer__step[data-tone="danger"].is-done {
  border-color: color-mix(in srgb, var(--color-danger) 34%, transparent);
  background: color-mix(in srgb, var(--color-danger) 12%, transparent);
  color: var(--color-danger);
}

.log-viewer__step[data-tone="danger"].is-active .log-viewer__step-dot,
.log-viewer__step[data-tone="danger"].is-done .log-viewer__step-dot { background: var(--color-danger); }

.log-viewer__progress-label {
  min-width: 42px;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  text-align: right;
}

.log-viewer__progress-label[data-tone="danger"] { color: var(--color-danger); }
.log-viewer__progress-label[data-tone="warning"] { color: var(--color-warning); }
.log-viewer__progress-label[data-tone="success"] { color: var(--color-success); }

.log-viewer__search {
  display: flex;
  flex: 0 0 auto;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-subtle);
}

.log-viewer__search-input { width: min(260px, 34vw); }

.log-viewer__search-info {
  min-width: 46px;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.log-viewer__terminal {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-page);
  color: var(--color-text);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-relaxed);
  white-space: pre-wrap;
  word-break: break-word;
}

.log-viewer__terminal:focus-visible { outline: var(--component-focus-outline); }

.log-viewer__line { min-height: 18px; }

.log-viewer__line.is-cmd { color: var(--color-action); }
.log-viewer__line.is-info { color: var(--color-text); }
.log-viewer__line.is-success { color: var(--color-success); }
.log-viewer__line.is-warn { color: var(--color-warning); }
.log-viewer__line.is-error { color: var(--color-danger); }

.log-viewer__line.is-match {
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-warning) 22%, transparent);
}

.log-viewer__line.is-active-match {
  background: color-mix(in srgb, var(--color-action) 24%, transparent);
}

.log-viewer__link {
  color: inherit;
  font-weight: var(--font-weight-semibold);
  text-decoration: underline;
}

.log-viewer__link:hover { opacity: 0.8; }

.log-viewer__result {
  display: flex;
  flex: 1 1 auto;
  gap: var(--space-1);
  align-items: center;
  min-width: 0;
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.log-viewer__result[data-tone="danger"] { color: var(--color-danger); }
.log-viewer__result[data-tone="warning"] { color: var(--color-warning); }
.log-viewer__result[data-tone="success"] { color: var(--color-success); }

.log-viewer__result-note {
  overflow: hidden;
  color: var(--color-text-muted);
  font-weight: var(--font-weight-regular);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .log-viewer__terminal { padding: var(--space-2); }
  /* 窄窗口结论区独占一行，避免把「最小化」按钮挤出可视区。 */
  .log-viewer__footer { flex-wrap: wrap; }
  .log-viewer__result { flex-basis: 100%; }
}
</style>
