<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelect, { type SelectOption } from '@/components/form/BaseSelect.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import { useFileTransferStore } from '@/stores/file-transfer'

const store = useFileTransferStore()

const serverOptions = computed<SelectOption[]>(() => {
  if (!store.servers.length) {
    return [{ label: '（暂无服务器，请先在「部署面板 · 服务器管理」添加）', value: '', disabled: true }]
  }
  return store.servers.map((s) => ({
    value: s.id,
    label: `${s.name} · ${s.username}@${s.host}:${s.port || 22}`,
  }))
})

const status = computed(() => {
  if (store.statusKind === 'connecting') return { label: store.statusText, status: 'checking' as const }
  if (store.statusKind === 'connected') return { label: store.statusText, status: 'online' as const }
  return { label: store.statusText, status: 'idle' as const }
})

const hint = computed(() => {
  if (!store.servers.length) return '请先添加服务器'
  if (store.connected) return '可再选其他服务器开新标签'
  return '选择服务器后点击连接'
})
</script>

<template>
  <div class="ft-session-bar">
    <span class="ft-session-bar__label">服务器</span>
    <BaseSelect
      class="ft-session-bar__select"
      :model-value="store.selectedServerId"
      :options="serverOptions"
      :disabled="!store.servers.length"
      aria-label="选择服务器"
      placeholder="选择服务器"
      @update:model-value="store.selectedServerId = $event"
    />
    <BaseButton
      variant="primary"
      size="sm"
      :loading="store.connecting"
      :disabled="!store.servers.length || store.connecting"
      @click="store.connect()"
    >
      连接
    </BaseButton>
    <StatusIndicator :label="status.label" :status="status.status" />
    <span class="ft-session-bar__spacer" />
    <span class="ft-session-bar__hint">{{ hint }}</span>
  </div>
</template>
