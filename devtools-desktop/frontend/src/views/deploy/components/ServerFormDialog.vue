<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import FormField from '@/components/form/FormField.vue'
import FilterChip from '@/components/navigation/FilterChip.vue'

import { normalizeDeployPath, type ServerFormState } from '../composables/useServerForm'

defineOptions({ name: 'ServerFormDialog' })

const props = defineProps<{
  open: boolean
  title: string
  editing: boolean
  state: ServerFormState
  deployPaths: string[]
  pathDraft: string
  duplicateHint: boolean
  saving: boolean
  canSave: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:state': [patch: Partial<ServerFormState>]
  'update:pathDraft': [value: string]
  'add-path': []
  'pop-path': []
  'remove-path': [index: number]
  'edit-path': [index: number, value: string]
  submit: []
}>()

const editingIndex = ref(-1)
const editingDraft = ref('')
/** v-for 内的 ref 会收成数组，这里用函数 ref 只留当前编辑中的那一个。 */
let editInput: { focus?: () => void, select?: () => void } | null = null
function bindEditInput(el: unknown) {
  editInput = el as typeof editInput
}

watch(() => props.open, (open) => {
  if (!open) editingIndex.value = -1
})

async function startEdit(index: number, value: string) {
  editingIndex.value = index
  editingDraft.value = value
  await nextTick()
  editInput?.focus?.()
  editInput?.select?.()
}

function commitEdit() {
  if (editingIndex.value < 0) return
  const path = normalizeDeployPath(editingDraft.value)
  if (path) emit('edit-path', editingIndex.value, path)
  editingIndex.value = -1
}
</script>

<template>
  <BaseDialog
    :model-value="open"
    :title="title"
    @update:model-value="emit('update:open', $event)"
  >
    <div class="server-form">
      <FormField label="服务器名称" for-id="server-form-name" required>
        <BaseInput
          id="server-form-name"
          :model-value="state.name"
          placeholder="如：生产-茅台物流"
          @update:model-value="emit('update:state', { name: $event })"
        />
      </FormField>
      <FormField label="Host" for-id="server-form-host" required>
        <BaseInput
          id="server-form-host"
          :model-value="state.host"
          placeholder="192.168.1.100"
          @update:model-value="emit('update:state', { host: $event })"
        />
      </FormField>
      <div class="server-form__row">
        <FormField label="端口" for-id="server-form-port">
          <BaseInput
            id="server-form-port"
            :model-value="state.port"
            @update:model-value="emit('update:state', { port: $event })"
          />
        </FormField>
        <FormField label="用户名" for-id="server-form-username">
          <BaseInput
            id="server-form-username"
            :model-value="state.username"
            @update:model-value="emit('update:state', { username: $event })"
          />
        </FormField>
      </div>
      <!--
        认证方式只有密码一种后端实现，旧表单的单选项下拉是伪选择（D7）：
        改为静态文本，提交时固定传 password。
      -->
      <FormField label="认证方式">
        <p class="server-form__static">密码</p>
      </FormField>
      <FormField
        label="密码"
        for-id="server-form-password"
        :hint="editing ? '留空表示不修改现有密码' : undefined"
      >
        <BaseInput
          id="server-form-password"
          :model-value="state.password"
          type="password"
          placeholder="••••••••"
          @update:model-value="emit('update:state', { password: $event })"
        />
      </FormField>
      <FormField label="默认打开目录" for-id="server-form-remote" hint="连接后默认展示的远程目录">
        <BaseInput
          id="server-form-remote"
          :model-value="state.defaultRemotePath"
          placeholder="/"
          @update:model-value="emit('update:state', { defaultRemotePath: $event })"
        />
      </FormField>
      <FormField label="发布目录" for-id="server-form-path" hint="第一条为默认发布目录">
        <div class="server-form__tags">
          <span
            v-for="(path, index) in deployPaths"
            :key="path"
            class="server-form__tag"
            :class="{ 'is-default': index === 0 }"
          >
            <template v-if="editingIndex === index">
              <BaseInput
                :ref="bindEditInput"
                v-model="editingDraft"
                class="server-form__tag-edit"
                aria-label="编辑发布目录"
                @keydown.enter.prevent="commitEdit"
                @keydown.esc.prevent="editingIndex = -1"
                @blur="commitEdit"
              />
            </template>
            <FilterChip
              v-else
              :label="index === 0 ? `${path}（默认）` : path"
              :aria-label="`发布目录 ${path}，双击编辑`"
              removable
              class="server-form__tag-chip"
              @remove="emit('remove-path', index)"
              @dblclick="startEdit(index, path)"
            />
          </span>
          <BaseInput
            id="server-form-path"
            :model-value="pathDraft"
            class="server-form__tag-input"
            :placeholder="duplicateHint ? '⚠ 该路径已存在' : '输入路径后按 Enter 添加'"
            @update:model-value="emit('update:pathDraft', $event)"
            @keydown.enter.prevent="emit('add-path')"
            @keydown.backspace="emit('pop-path')"
          />
        </div>
      </FormField>
    </div>

    <template #footer>
      <BaseButton variant="secondary" @click="emit('update:open', false)">取消</BaseButton>
      <BaseButton :disabled="!canSave || saving" @click="emit('submit')">
        {{ saving ? '保存中…' : '保存' }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.server-form { display: grid; gap: var(--space-4); }

.server-form__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.server-form__static {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-normal);
}

.server-form__tags {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.server-form__tag {
  display: inline-flex;
  max-width: 100%;
  min-width: 0;
  align-items: center;
}

.server-form__tag-chip { font-family: var(--font-family-mono); }
.server-form__tag-edit { width: 200px; }
.server-form__tag-input { flex: 1 1 180px; min-width: 140px; }
</style>
