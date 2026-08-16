<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import FormField from '@/components/form/FormField.vue'
import type { DeployServer } from '@/services/modules/deploy-service'
import type { Project } from '@/services/modules/project-service'

import type { ProjectConfigState } from '../composables/useProjectConfig'

defineOptions({ name: 'ProjectConfigDialog' })

const props = defineProps<{
  project: Project | null
  state: ProjectConfigState
  servers: DeployServer[]
  nodeVersions: string[]
  /** 系统默认 Node 版本，用于「系统默认」选项的说明文案。 */
  currentNodeVersion: string
  saving: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  'update:state': [patch: Partial<ProjectConfigState>]
  'toggle-server': [id: string]
  submit: []
}>()

const nodeOptions = computed(() => [
  { value: '', label: props.currentNodeVersion ? `系统默认 (${props.currentNodeVersion})` : '系统默认' },
  ...props.nodeVersions.map(version => ({ value: version, label: version })),
])
</script>

<template>
  <!-- below-overlays：内含 Select 下拉，对话框需退到 Naive 浮层之下才能点选 -->
  <BaseDialog
    :model-value="project !== null"
    title="项目默认配置"
    :subtitle="project?.name ?? ''"
    below-overlays
    @update:model-value="!$event && emit('close')"
  >
    <div v-if="project" class="project-config">
      <FormField label="项目别名" hint="自定义显示名称，方便快速识别项目">
        <BaseInput
          :model-value="state.displayName"
          placeholder="留空则显示文件夹名"
          aria-label="项目别名"
          @update:model-value="emit('update:state', { displayName: $event })"
        />
      </FormField>

      <BaseSelect
        :model-value="state.nodeVersion"
        label="默认 Node 版本"
        :options="nodeOptions"
        help-text="部署/构建弹窗将自动选中此版本"
        @update:model-value="emit('update:state', { nodeVersion: $event })"
      />

      <FormField label="默认目标服务器" hint="部署弹窗将自动选中这些服务器（可多选）">
        <div v-if="servers.length > 0" class="project-config__servers">
          <BaseSelectableItem
            v-for="server in servers"
            :key="server.id"
            :selected="state.serverIds.includes(server.id)"
            :pressed="state.serverIds.includes(server.id)"
            @click="emit('toggle-server', server.id)"
          >
            <span class="project-config__server" :title="`${server.name} (${server.host})`">
              {{ server.name }}
              <small>{{ server.host }}</small>
            </span>
          </BaseSelectableItem>
        </div>
        <EmptyState v-else title="暂无服务器" description="先到「服务器管理」添加一台" compact />
      </FormField>

      <p v-if="error" class="project-config__error" role="alert">保存失败：{{ error }}</p>
    </div>

    <template #footer>
      <div class="project-config__actions">
        <BaseButton variant="secondary" @click="emit('close')">取消</BaseButton>
        <BaseButton variant="primary" :loading="saving" @click="emit('submit')">保存配置</BaseButton>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.project-config {
  display: flex;
  overflow: hidden auto;
  flex-direction: column;
  gap: var(--space-4);
}

.project-config__servers {
  display: grid;
  overflow-y: auto;
  max-height: 220px;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  --base-selectable-min-height: 40px;
  --base-selectable-padding: 8px 10px;
  --base-selectable-radius: 10px;
  --base-selectable-border: var(--color-border);
  --base-selectable-background: var(--color-surface-subtle);
  --base-selectable-hover-transform: none;
  --base-selectable-selected-shadow: none;
  --base-selectable-selected-background: color-mix(in srgb, var(--color-action) 10%, var(--color-surface));
  --base-selectable-selected-border: color-mix(in srgb, var(--color-action) 36%, var(--color-border));
}

.project-config__server {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-normal);
}

.project-config__server small {
  overflow: hidden;
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: 10px;
  font-weight: var(--font-weight-regular);
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 560px) {
  .project-config__servers {
    grid-template-columns: minmax(0, 1fr);
  }
}

.project-config__error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-xs);
}

.project-config__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}
</style>
