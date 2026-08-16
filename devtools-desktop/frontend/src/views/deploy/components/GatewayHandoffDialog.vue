<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'

import type { GatewayHandoffState, HandoffCopiedPath } from '../composables/useGroupPublish'

defineOptions({ name: 'GatewayHandoffDialog' })

defineProps<{
  handoff: GatewayHandoffState | null
  copied: HandoffCopiedPath
}>()

const emit = defineEmits<{
  close: []
  copy: [kind: Exclude<HandoffCopiedPath, ''>]
  retry: []
}>()

const statusLabel = (status: GatewayHandoffState['status']) => {
  if (status === 'connecting') return '代登中'
  if (status === 'success') return '已打开网关'
  if (status === 'error') return '代登失败'
  return ''
}
</script>

<template>
  <BaseDialog
    :model-value="handoff !== null"
    title="交接到 FileZilla"
    :subtitle="handoff?.displayName ?? ''"
    @update:model-value="!$event && emit('close')"
  >
    <div v-if="handoff" class="gateway-handoff">
      <p class="gateway-handoff__lead">
        网关会在系统 Chrome 里打开并尽量自动登录。请你在页面里点
        <template v-if="handoff.deviceIp">设备 {{ handoff.deviceIp }} 的</template>
        SFTP 调起 FileZilla，再把本地产物拖到远程目录。
      </p>

      <div class="gateway-handoff__path">
        <BaseInput
          :model-value="handoff.distPath || (handoff.status === 'connecting' ? '正在获取本地产物路径…' : '')"
          label="本地产物路径"
          readonly
        />
        <BaseButton
          variant="secondary"
          :disabled="!handoff.distPath"
          @click="emit('copy', 'dist')"
        >
          {{ copied === 'dist' ? '已复制' : '复制本地路径' }}
        </BaseButton>
      </div>

      <div class="gateway-handoff__path">
        <BaseInput
          :model-value="handoff.remotePath || (handoff.status === 'connecting' ? '正在获取远程路径…' : '未配置远程路径')"
          label="远程路径"
          readonly
          help-text="来自项目发布目录，或默认服务器里配置的部署路径，供 FileZilla 粘贴。"
        />
        <BaseButton
          variant="secondary"
          :disabled="!handoff.remotePath"
          @click="emit('copy', 'remote')"
        >
          {{ copied === 'remote' ? '已复制' : '复制远程路径' }}
        </BaseButton>
      </div>

      <p
        class="gateway-handoff__status"
        :class="`is-${handoff.status}`"
        :data-status="handoff.status"
      >
        <span class="gateway-handoff__badge">{{ statusLabel(handoff.status) }}</span>
        <span>{{ handoff.message }}</span>
      </p>
    </div>

    <template #footer>
      <BaseButton
        v-if="handoff?.status === 'error'"
        variant="secondary"
        @click="emit('retry')"
      >
        重试代登
      </BaseButton>
      <BaseButton variant="primary" @click="emit('close')">完成</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.gateway-handoff {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.gateway-handoff__lead {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.55;
}

.gateway-handoff__path {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: stretch;
}

.gateway-handoff__status {
  display: flex;
  gap: var(--space-2);
  align-items: flex-start;
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.gateway-handoff__status.is-success {
  color: var(--color-success);
}

.gateway-handoff__status.is-error {
  color: var(--color-danger);
}

.gateway-handoff__badge {
  flex: none;
  font-weight: var(--font-weight-semibold);
}
</style>
