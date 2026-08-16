<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import type { RemoteEntry } from '@/services/modules/deploy-service'

import type { RemoteBreadcrumb, RemoteBrowserTarget } from '../composables/useRemoteBrowser'

import RemoteBrowserPanel from './RemoteBrowserPanel.vue'

defineOptions({ name: 'RemoteBrowserDialog' })

defineProps<{
  /** null 表示弹窗关闭——与其他已迁弹窗同一开合约定。 */
  target: RemoteBrowserTarget | null
  breadcrumbs: RemoteBreadcrumb[]
  currentDir: string
  entries: RemoteEntry[]
  parentDir: string | null
  loading: boolean
  error: string
  fallback: string
}>()

const emit = defineEmits<{
  close: []
  navigate: [path: string]
  confirm: []
}>()
</script>

<template>
  <BaseDialog
    :model-value="target !== null"
    title="远程目录浏览"
    :subtitle="target ? `${target.serverName} (${target.host})` : ''"
    @update:model-value="!$event && emit('close')"
  >
    <RemoteBrowserPanel
      :breadcrumbs="breadcrumbs"
      :current-dir="currentDir"
      :entries="entries"
      :parent-dir="parentDir"
      :loading="loading"
      :error="error"
      :fallback="fallback"
      @navigate="emit('navigate', $event)"
    />

    <template #footer>
      <span class="remote-browser-dialog__path" :title="currentDir">{{ currentDir }}</span>
      <BaseButton variant="secondary" @click="emit('close')">取消</BaseButton>
      <!-- 读取失败时当前目录未必真实存在，不允许直接确认 -->
      <BaseButton
        variant="primary"
        :disabled="loading || Boolean(error)"
        @click="emit('confirm')"
      >
        选择此目录
      </BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.remote-browser-dialog__path {
  overflow: hidden;
  margin-right: auto;
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
