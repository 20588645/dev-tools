<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'

import type { ReleaseConfirm } from '../composables/useRunActions'

/**
 * 强制释放端口的确认弹窗（F4 / L3-A）。
 *
 * `force-release` 会 `process.kill(-pid, 'SIGKILL')` 强杀整个进程组，且后端
 * **不校验该进程是否由本应用启动**。旧实现只显示 pid 和进程名就让用户按下强杀，
 * 这里把完整路径、用户、进程组一并摊开，并对非本应用进程给出显著警示。
 */

defineOptions({ name: 'RunReleaseDialog' })

defineProps<{ request: ReleaseConfirm | null }>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<template>
  <BaseDialog
    :model-value="request !== null"
    title="强制释放端口"
    width="min(520px, 92vw)"
    @update:model-value="!$event && emit('cancel')"
  >
    <template v-if="request">
      <p
        class="release__lead"
        :data-tone="request.looksExternal ? 'danger' : 'warning'"
      >
        <template v-if="request.looksExternal">
          ⚠️ 这个进程<strong>不像是本应用启动的</strong>，强制结束可能影响你正在使用的其他程序。
        </template>
        <template v-else>
          ⚠️ 将强制结束该进程<strong>及其整个进程组</strong>，未保存的工作会丢失。
        </template>
      </p>

      <dl class="release__facts">
        <div>
          <dt>端口</dt>
          <dd>{{ request.alert.port }}</dd>
        </div>
        <div>
          <dt>进程</dt>
          <dd>{{ request.alert.command || '未知' }}</dd>
        </div>
        <div>
          <dt>PID</dt>
          <dd>{{ request.alert.pid }}<span v-if="request.alert.pids.length > 1"> · 进程组共 {{ request.alert.pids.length }} 个</span></dd>
        </div>
        <div>
          <dt>用户</dt>
          <dd>{{ request.alert.user || '未知' }}</dd>
        </div>
        <div class="release__facts-wide">
          <dt>可执行路径</dt>
          <dd><code>{{ request.alert.commandPath || '未能获取' }}</code></dd>
        </div>
      </dl>

      <p class="release__note">
        确认后会强制结束该进程，等端口真正释放再启动 {{ request.projectName }}。此操作不可撤销。
      </p>
    </template>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('cancel')">取消</BaseButton>
      <BaseButton variant="danger" @click="emit('confirm')">强制结束并启动</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.release__lead {
  margin: 0 0 var(--space-4);
  padding: var(--space-3);
  border: 1px solid;
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.release__lead[data-tone="danger"] {
  border-color: color-mix(in srgb, var(--color-danger) 38%, transparent);
  background: color-mix(in srgb, var(--color-danger) 10%, transparent);
  color: var(--color-danger);
}

.release__lead[data-tone="warning"] {
  border-color: color-mix(in srgb, var(--color-warning) 38%, transparent);
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
}

.release__facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: var(--space-3);
  margin: 0 0 var(--space-4);
}

.release__facts-wide { grid-column: 1 / -1; }

.release__facts dt {
  margin-bottom: var(--space-1);
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
}

.release__facts dd {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  word-break: break-all;
}

.release__facts dd code {
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-regular);
}

.release__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
}
</style>
