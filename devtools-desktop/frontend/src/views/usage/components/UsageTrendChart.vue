<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { useResizeObserver } from '@/composables/use-resize-observer'
import type { UsageTrendRow } from '@/services/modules/usage-service'
import { useAppStore } from '@/stores/app'

import { formatUsageCompact, formatUsageCost, formatUsageNumber, usageTrendTokens } from '../usage-format'
import type { UsageRange } from '../composables/useUsage'

const props = defineProps<{
  claude: UsageTrendRow[]
  codex: UsageTrendRow[]
  range: UsageRange
}>()

const app = useAppStore()
const canvas = ref<HTMLCanvasElement | null>(null)
const wrap = ref<HTMLElement | null>(null)

/** 命中的 bucket 下标；null 表示指针不在绘图区内 */
const hoverIndex = ref<number | null>(null)
const hoverX = ref(0)

const accessibleLabel = computed(() => {
  const claudeTotal = props.claude.reduce((sum, row) => sum + usageTrendTokens(row), 0)
  const codexTotal = props.codex.reduce((sum, row) => sum + usageTrendTokens(row), 0)
  return `用量趋势：Claude Code ${formatUsageCompact(claudeTotal)} Token，Codex ${formatUsageCompact(codexTotal)} Token`
})

/** 两条线共用同一组 bucket，取较长的一条作为时间轴基准 */
const axisRows = computed(() => (props.claude.length >= props.codex.length ? props.claude : props.codex))

const hoverDetail = computed(() => {
  const index = hoverIndex.value
  if (index === null) return null
  const bucket = axisRows.value[index]?.bucket
  if (!bucket) return null
  const rowTotal = (row: UsageTrendRow | null) => row
    ? row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheCreationTokens + row.requests
    : 0
  // 该时刻没有任何用量的应用不占列，否则窄卡片里全是 0
  const series = [
    { name: 'Claude Code', shortName: 'Claude', row: props.claude[index] ?? null, tone: 'claude' as const },
    { name: 'Codex', shortName: 'Codex', row: props.codex[index] ?? null, tone: 'codex' as const },
  ].filter((item) => rowTotal(item.row) > 0)
  if (!series.length) return null
  const metrics = [
    { label: '输入', pick: (row: UsageTrendRow) => row.inputTokens },
    { label: '输出', pick: (row: UsageTrendRow) => row.outputTokens },
    { label: '缓存命中', pick: (row: UsageTrendRow) => row.cacheReadTokens },
    { label: '缓存创建', pick: (row: UsageTrendRow) => row.cacheCreationTokens },
    { label: '请求', pick: (row: UsageTrendRow) => row.requests },
  ].map((metric) => ({
    label: metric.label,
    values: series.map((item) => formatUsageNumber(metric.pick(item.row as UsageTrendRow))),
  }))
  const costMicroUsd = series.reduce((sum, item) => sum + (item.row?.costMicroUsd ?? 0), 0)
  return { bucket, series, metrics, costMicroUsd }
})

// 绘图区几何，鼠标命中和绘制共用，避免两边各算一套
let box = { left: 44, top: 16, width: 0, height: 0 }

function css(name: string) {
  return getComputedStyle(document.body).getPropertyValue(name).trim()
}

function axisLabelFor(raw: string) {
  if (props.range === 'today') return raw.split(' ')[1] || raw
  if (props.range === '7d') return raw.slice(5, 13)
  if (props.range === 'custom') {
    // 自定义跨度不定：带时刻的 bucket 显示「月-日 时:分」，按天的只显示「月-日」
    return raw.includes(' ') ? raw.slice(5, 13) : raw.slice(5, 10)
  }
  return raw.slice(5, 10)
}

function drawSeries(
  context: CanvasRenderingContext2D,
  rows: UsageTrendRow[],
  color: string,
  area: typeof box,
  max: number,
) {
  if (!rows.length) return
  context.beginPath()
  rows.forEach((row, index) => {
    const x = area.left + (rows.length <= 1 ? 0 : index / (rows.length - 1)) * area.width
    const y = area.top + area.height - (usageTrendTokens(row) / max) * area.height
    if (index === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  })
  context.strokeStyle = color
  context.lineWidth = 2
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.shadowColor = color
  context.shadowBlur = 4
  context.stroke()
  context.shadowBlur = 0
}

function drawPoint(
  context: CanvasRenderingContext2D,
  rows: UsageTrendRow[],
  index: number,
  color: string,
  area: typeof box,
  max: number,
) {
  const row = rows[index]
  if (!row) return
  const x = area.left + (rows.length <= 1 ? 0 : index / (rows.length - 1)) * area.width
  const y = area.top + area.height - (usageTrendTokens(row) / max) * area.height
  context.beginPath()
  context.arc(x, y, 3.5, 0, Math.PI * 2)
  context.fillStyle = color
  context.fill()
  context.beginPath()
  context.arc(x, y, 3.5, 0, Math.PI * 2)
  context.strokeStyle = css('--color-surface')
  context.lineWidth = 1.5
  context.stroke()
}

function draw() {
  const element = canvas.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const ratio = Math.min(globalThis.devicePixelRatio || 1, 2)
  element.width = Math.floor(rect.width * ratio)
  element.height = Math.floor(rect.height * ratio)
  const context = element.getContext('2d')
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.clearRect(0, 0, rect.width, rect.height)

  const allRows = [...props.claude, ...props.codex]
  const max = Math.max(...allRows.map(usageTrendTokens), 1)
  const grid = css('--color-border')
  const label = css('--color-text-subtle')

  context.font = '10px var(--font-family-sans), sans-serif'

  // Y 轴刻度文字宽度实测后再定左边距，否则「958.0 万」这类长标签会被裁掉
  const tickLabels: string[] = []
  for (let index = 0; index <= 4; index += 1) tickLabels.push(formatUsageCompact(max * ((4 - index) / 4)))
  const widest = Math.max(...tickLabels.map((text) => context.measureText(text).width))
  const gutter = Math.ceil(widest) + 14

  box = {
    left: gutter,
    top: 16,
    width: Math.max(40, rect.width - gutter - 14),
    height: Math.max(80, rect.height - 48),
  }

  context.fillStyle = label
  context.textAlign = 'right'
  context.textBaseline = 'middle'
  for (let index = 0; index <= 4; index += 1) {
    const y = box.top + (index / 4) * box.height
    context.beginPath()
    context.setLineDash([3, 4])
    context.moveTo(box.left, y)
    context.lineTo(box.left + box.width, y)
    context.strokeStyle = grid
    context.lineWidth = 1
    context.stroke()
    context.setLineDash([])
    context.fillText(tickLabels[index], box.left - 8, y)
  }

  const labels = axisRows.value
  context.fillStyle = label
  context.textAlign = 'center'
  context.textBaseline = 'top'
  const labelCount = Math.min(6, labels.length)
  for (let index = 0; index < labelCount; index += 1) {
    const rowIndex = labelCount <= 1 ? 0 : Math.round((index / (labelCount - 1)) * (labels.length - 1))
    const x = box.left + (labelCount <= 1 ? 0 : index / (labelCount - 1)) * box.width
    context.fillText(axisLabelFor(labels[rowIndex]?.bucket ?? ''), x, box.top + box.height + 8)
  }

  // 准线画在数据线之下，避免盖住线条
  if (hoverIndex.value !== null && labels.length) {
    const ratioX = labels.length <= 1 ? 0 : hoverIndex.value / (labels.length - 1)
    const x = box.left + ratioX * box.width
    context.beginPath()
    context.moveTo(x, box.top)
    context.lineTo(x, box.top + box.height)
    context.strokeStyle = css('--color-text-subtle')
    context.lineWidth = 1
    context.globalAlpha = .5
    context.stroke()
    context.globalAlpha = 1
  }

  const claudeColor = css('--color-series-1')
  const codexColor = css('--color-series-2')
  drawSeries(context, props.claude, claudeColor, box, max)
  drawSeries(context, props.codex, codexColor, box, max)

  if (hoverIndex.value !== null) {
    drawPoint(context, props.claude, hoverIndex.value, claudeColor, box, max)
    drawPoint(context, props.codex, hoverIndex.value, codexColor, box, max)
  }
}

function onPointerMove(event: PointerEvent) {
  const element = canvas.value
  const rows = axisRows.value
  if (!element || !rows.length) return
  const rect = element.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top
  if (x < box.left - 6 || x > box.left + box.width + 6 || y < box.top - 6 || y > box.top + box.height + 6) {
    if (hoverIndex.value !== null) {
      hoverIndex.value = null
      draw()
    }
    return
  }
  const ratioX = box.width <= 0 ? 0 : (x - box.left) / box.width
  const index = Math.max(0, Math.min(rows.length - 1, Math.round(ratioX * (rows.length - 1))))
  hoverX.value = box.left + (rows.length <= 1 ? 0 : index / (rows.length - 1)) * box.width
  if (index !== hoverIndex.value) {
    hoverIndex.value = index
    draw()
  }
}

function onPointerLeave() {
  if (hoverIndex.value === null) return
  hoverIndex.value = null
  draw()
}

/** tooltip 贴近准线，靠近右边界时翻到左侧，避免溢出卡片 */
const tooltipStyle = computed(() => {
  const columns = hoverDetail.value?.series.length ?? 1
  const width = 96 + columns * 74
  const wrapWidth = wrap.value?.clientWidth ?? 0
  const flip = wrapWidth > 0 && hoverX.value + 14 + width > wrapWidth
  return flip
    ? { right: `${Math.max(0, wrapWidth - hoverX.value + 14)}px`, width: `${width}px` }
    : { left: `${hoverX.value + 14}px`, width: `${width}px` }
})

useResizeObserver(wrap, () => draw())
watch(
  [() => props.claude, () => props.codex, () => props.range, () => app.theme],
  () => {
    hoverIndex.value = null
    void nextTick(draw)
  },
  { deep: true, immediate: true },
)
onBeforeUnmount(() => {
  hoverIndex.value = null
})
</script>

<template>
  <div ref="wrap" class="usage-trend">
    <div class="usage-trend__legend" aria-hidden="true">
      <span v-if="claude.length"><i class="usage-trend__line usage-trend__line--claude" />Claude Code</span>
      <span v-if="codex.length"><i class="usage-trend__line usage-trend__line--codex" />Codex</span>
    </div>
    <canvas
      ref="canvas"
      :aria-label="accessibleLabel"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
    />
    <div v-if="hoverDetail" class="usage-trend__tip" :style="tooltipStyle" role="status">
      <strong>{{ hoverDetail.bucket }}</strong>
      <table>
        <thead>
          <tr>
            <td />
            <th v-for="item in hoverDetail.series" :key="item.name" :class="`is-${item.tone}`">
              <i :class="`usage-trend__line usage-trend__line--${item.tone}`" />{{ item.shortName }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="metric in hoverDetail.metrics" :key="metric.label">
            <th scope="row">{{ metric.label }}</th>
            <td v-for="(value, index) in metric.values" :key="index">{{ value }}</td>
          </tr>
        </tbody>
      </table>
      <div class="usage-trend__tip-total">
        <dt>成本</dt>
        <dd>{{ hoverDetail.costMicroUsd > 0 ? formatUsageCost(hoverDetail.costMicroUsd) : '不可计算' }}</dd>
      </div>
    </div>
  </div>
</template>
