<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import type { CommandRecord } from '@/services/modules/commands-service'

withDefaults(defineProps<{
  commands: CommandRecord[]
  paramDrafts: Record<string, string>
  loading?: boolean
  emptyText?: string
}>(), {
  loading: false,
  emptyText: '暂无命令，点击「添加命令」开始',
})

const emit = defineEmits<{
  run: [cmdId: string]
  remove: [cmdId: string]
  'update:param': [payload: { id: string; value: string }]
}>()
</script>

<template>
  <div class="term-cmd-grid" :aria-busy="loading || undefined">
    <div v-if="!commands.length" class="term-cmd-grid__empty">
      {{ emptyText }}
    </div>
    <div
      v-for="cmd in commands"
      :key="cmd.id"
      class="term-cmd-card"
    >
      <div class="term-cmd-card__header">
        <span class="term-cmd-card__icon" aria-hidden="true">{{ cmd.icon || '⚡' }}</span>
        <div class="term-cmd-card__name">{{ cmd.name }}</div>
        <BaseIconButton
          class="term-cmd-card__delete"
          label="删除命令"
          size="sm"
          variant="danger"
          @click="emit('remove', cmd.id)"
        >
          <span aria-hidden="true">✕</span>
        </BaseIconButton>
      </div>
      <div class="term-cmd-card__command" :title="cmd.command">{{ cmd.command }}</div>
      <!-- 原型 .cmd-foot：参数输入与「执行」同排，无参数时执行按钮贴右 -->
      <div class="term-cmd-card__foot">
        <BaseInput
          v-if="cmd.hasParam"
          class="term-cmd-card__param"
          :model-value="paramDrafts[cmd.id] ?? cmd.paramDefault ?? ''"
          size="sm"
          :placeholder="cmd.paramPlaceholder || cmd.paramName || '参数'"
          :aria-label="`${cmd.name} 参数`"
          @update:model-value="emit('update:param', { id: cmd.id, value: $event })"
        />
        <span v-else class="term-cmd-card__spring" />
        <BaseButton variant="primary" size="sm" @click="emit('run', cmd.id)">
          执行
        </BaseButton>
      </div>
    </div>
  </div>
</template>
