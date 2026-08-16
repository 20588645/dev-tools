<script setup lang="ts">
import { computed } from 'vue'

import LogViewer from '@/components/logviewer/LogViewer.vue'
import type { LogLine, LogProgressTone, LogStep } from '@/components/logviewer/LogViewer.vue'
import { resolveLogLineType } from '@/components/logviewer/log-format'
import type { AppUpgradeSnapshot } from '@/composables/useAppUpgrade'

const STEP_LABELS = ['检查工作区与依赖', '编译前端与 Tauri 应用', '覆盖安装并重新启动'] as const

const props = defineProps<{
  upgrade: AppUpgradeSnapshot
}>()

const emit = defineEmits<{
  close: []
}>()

const visible = computed(() => ['starting', 'running', 'finished', 'error'].includes(props.upgrade.state))
const running = computed(() => props.upgrade.state === 'starting' || props.upgrade.state === 'running')
const currentStep = computed(() => (props.upgrade.percent >= 90 ? 3 : props.upgrade.percent >= 20 ? 2 : 1))

const lines = computed<LogLine[]>(() => {
  const text = props.upgrade.log || '等待更新日志…'
  return text.split('\n').map((line, index) => ({
    id: index + 1,
    text: line,
    type: resolveLogLineType(line),
  }))
})

const steps = computed<LogStep[]>(() => {
  const active = currentStep.value
  const finished = props.upgrade.state === 'finished'
  return STEP_LABELS.map((label, index) => {
    const n = index + 1
    if (finished || n < active) return { label, state: 'done' as const }
    if (n === active) return { label, state: 'active' as const }
    return { label, state: 'pending' as const }
  })
})

const progressTone = computed<LogProgressTone>(() => {
  if (props.upgrade.state === 'error') return 'danger'
  if (props.upgrade.state === 'finished') return 'success'
  return 'action'
})

const resultText = computed(() => {
  if (props.upgrade.state === 'finished' || props.upgrade.state === 'error') return props.upgrade.message
  return ''
})
</script>

<template>
  <LogViewer
    :model-value="visible"
    title="正在更新 DevTools"
    :subtitle="upgrade.message || '更新完成后应用将自动重启，请保持窗口开启。'"
    :lines="lines"
    :steps="steps"
    :percent="upgrade.percent"
    :indeterminate="upgrade.state === 'starting'"
    :progress-label="running ? (upgrade.message || '正在更新…') : ''"
    :progress-tone="progressTone"
    :result-text="resultText"
    :running="running"
    lock-open
    @update:model-value="!$event && emit('close')"
  />
</template>
