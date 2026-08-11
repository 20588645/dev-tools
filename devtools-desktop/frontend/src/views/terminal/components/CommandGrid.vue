<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import type { CommandRecord } from '@/services/modules/commands-service'

defineProps<{
  commands: CommandRecord[]
  paramDrafts: Record<string, string>
  loading?: boolean
}>()

const emit = defineEmits<{
  run: [cmdId: string]
  remove: [cmdId: string]
  'update:param': [payload: { id: string; value: string }]
}>()
</script>

<template>
  <div class="term-cmd-grid" :aria-busy="loading || undefined">
    <div v-if="!commands.length" class="term-cmd-grid__empty">
      暂无命令，点击「添加命令」开始
    </div>
    <div
      v-for="cmd in commands"
      :key="cmd.id"
      class="term-cmd-card"
    >
      <BaseIconButton
        class="term-cmd-card__delete"
        label="删除命令"
        size="sm"
        variant="danger"
        @click="emit('remove', cmd.id)"
      >
        <span aria-hidden="true">✕</span>
      </BaseIconButton>
      <div class="term-cmd-card__header">
        <div class="term-cmd-card__icon">{{ cmd.icon || '⚡' }}</div>
        <div class="term-cmd-card__name">{{ cmd.name }}</div>
      </div>
      <div class="term-cmd-card__command" :title="cmd.command">{{ cmd.command }}</div>
      <div v-if="cmd.hasParam" class="term-cmd-card__param">
        <BaseInput
          :model-value="paramDrafts[cmd.id] ?? cmd.paramDefault ?? ''"
          size="sm"
          :placeholder="cmd.paramPlaceholder || cmd.paramName || '参数'"
          :aria-label="`${cmd.name} 参数`"
          @update:model-value="emit('update:param', { id: cmd.id, value: $event })"
        />
      </div>
      <div v-else class="term-cmd-card__param term-cmd-card__param--spacer" />
      <div class="term-cmd-card__actions">
        <BaseButton class="term-cmd-card__run" size="sm" @click="emit('run', cmd.id)">
          执行
        </BaseButton>
      </div>
    </div>
  </div>
</template>
