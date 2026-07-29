<script setup lang="ts">
import { computed } from 'vue'

import BaseProgress from '@/components/base/BaseProgress.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'

import type { SettingsController } from '../composables/useSettings'

const props = defineProps<{ controller: SettingsController }>()
const { upgrade } = props.controller
const visible = computed(() => ['starting', 'running', 'finished', 'error'].includes(upgrade.state))
const running = computed(() => upgrade.state === 'starting' || upgrade.state === 'running')
const step = computed(() => upgrade.percent >= 90 ? 3 : upgrade.percent >= 20 ? 2 : 1)
</script>

<template>
  <BaseDialog
    :model-value="visible"
    title="正在更新 DevTools"
    width="min(560px, calc(100vw - 32px))"
    :closable="!running"
    @update:model-value="!$event && controller.closeUpgrade()"
  >
    <div class="settings-upgrade">
      <p>{{ upgrade.message || '更新完成后应用将自动重启，请保持窗口开启。' }}</p>
      <ol class="settings-upgrade__steps">
        <li v-for="(label, index) in ['检查工作区与依赖', '编译前端与 Tauri 应用', '覆盖安装并重新启动']" :key="label" :class="{ 'is-active': step === index + 1, 'is-done': step > index + 1 || upgrade.state === 'finished' }">
          <span>{{ step > index + 1 || upgrade.state === 'finished' ? '✓' : index + 1 }}</span>
          <strong>{{ label }}</strong>
          <small>{{ step > index + 1 || upgrade.state === 'finished' ? '完成' : step === index + 1 ? '进行中' : '等待' }}</small>
        </li>
      </ol>
      <BaseProgress :value="upgrade.percent" :tone="upgrade.state === 'error' ? 'danger' : upgrade.state === 'finished' ? 'success' : 'action'" label="应用更新进度" />
      <pre class="settings-upgrade__log">{{ upgrade.log || '等待更新日志…' }}</pre>
    </div>
    <template v-if="!running" #footer>
      <BaseButton variant="secondary" @click="controller.closeUpgrade">关闭</BaseButton>
    </template>
  </BaseDialog>
</template>
