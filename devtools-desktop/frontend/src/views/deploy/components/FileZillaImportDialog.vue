<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import type { FileZillaServer } from '@/services/modules/deploy-service'

import type { FileZillaItemState } from '../composables/useFileZillaImport'

defineOptions({ name: 'FileZillaImportDialog' })

const props = defineProps<{
  open: boolean
  loading: boolean
  importing: boolean
  sourceLabel: string
  fileName: string
  items: FileZillaServer[]
  checked: Set<string>
  summary: string
  stateOf: (server: FileZillaServer) => FileZillaItemState
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  toggle: [name: string]
  'toggle-all': [select: boolean]
  'pick-xml': [name: string, content: string]
  'read-error': [message: string]
  submit: []
}>()

const STATE_LABEL: Record<FileZillaItemState, string> = {
  imported: '已导入',
  'will-remove': '将删除',
  pending: '待导入',
  none: '',
}

function readFile(file: File) {
  const reader = new FileReader()
  reader.onload = () => emit('pick-xml', file.name, String(reader.result ?? ''))
  // 不静默失败：权限、损坏或编码问题也要给反馈，否则点了「没反应」
  reader.onerror = () => emit('read-error', reader.error?.message || '无法读取所选文件')
  reader.readAsText(file, 'utf-8')
}

/**
 * 文件选择没有对应的公共组件（原生 file input 无法被 Naive 封装替代），
 * 按架构规则不在模板里写原生控件：改为按需创建一个游离元素触发系统选择框。
 */
function pickFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.xml'
  input.addEventListener('change', () => {
    const file = input.files?.[0]
    if (file) readFile(file)
  }, { once: true })
  input.click()
}
</script>

<template>
  <BaseDialog
    :model-value="open"
    title="从 FileZilla 导入服务器"
    :subtitle="sourceLabel"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="fz-import">
      <div class="fz-import__source">
        <BaseButton variant="secondary" size="sm" @click="pickFile">选择 XML 文件</BaseButton>
        <span v-if="fileName" class="fz-import__filename">{{ fileName }}</span>
      </div>
      <p class="fz-import__note">仅显示 SFTP 协议的服务器，FTP 已自动过滤</p>

      <LoadingState v-if="loading" label="正在读取配置…" />
      <EmptyState v-else-if="items.length === 0" compact title="未找到 SFTP 服务器配置" />
      <template v-else>
        <div class="fz-import__toolbar">
          <BaseButton variant="ghost" size="sm" @click="emit('toggle-all', true)">全选</BaseButton>
          <BaseButton variant="ghost" size="sm" @click="emit('toggle-all', false)">全不选</BaseButton>
          <span class="fz-import__summary">{{ summary }}</span>
        </div>
        <div class="fz-import__grid">
          <BaseSelectableItem
            v-for="server in items"
            :key="server.name"
            appearance="row"
            :selected="checked.has(server.name)"
            :pressed="checked.has(server.name)"
            @click="emit('toggle', server.name)"
          >
            <span class="fz-import__item">
              <BaseCheckbox
                :model-value="checked.has(server.name)"
                :label="server.name"
                @update:model-value="emit('toggle', server.name)"
              />
              <span
                v-if="STATE_LABEL[props.stateOf(server)]"
                class="fz-import__tag"
                :class="`is-${props.stateOf(server)}`"
              >{{ STATE_LABEL[props.stateOf(server)] }}</span>
              <span class="fz-import__addr">{{ server.host }}:{{ server.port }}</span>
            </span>
          </BaseSelectableItem>
        </div>
      </template>
    </div>

    <template #footer>
      <BaseButton variant="secondary" @click="emit('update:open', false)">取消</BaseButton>
      <BaseButton :disabled="checked.size === 0 || importing" @click="emit('submit')">
        {{ importing ? '同步中…' : '同步服务器' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.fz-import { display: grid; gap: var(--space-3); }

.fz-import__source {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}

.fz-import__filename {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fz-import__note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.fz-import__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.fz-import__summary {
  margin-left: auto;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.fz-import__grid {
  display: grid;
  max-height: 360px;
  gap: var(--space-1);
  overflow-y: auto;
}

.fz-import__item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
}

.fz-import__tag { font-size: var(--font-size-xs); }
.fz-import__tag.is-imported { color: var(--color-success); }
.fz-import__tag.is-will-remove { color: var(--color-danger); }
.fz-import__tag.is-pending { color: var(--color-info); }

.fz-import__addr {
  overflow: hidden;
  margin-left: auto;
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
