<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import FormField from '@/components/form/FormField.vue'
import BaseSegmented from '@/components/navigation/BaseSegmented.vue'

import type { GroupPublishDraft } from '../composables/useGroupPublish'

defineOptions({ name: 'GroupPublishDialog' })

defineProps<{
  draft: GroupPublishDraft | null
  saving: boolean
  error: string
}>()

const emit = defineEmits<{
  close: []
  save: []
  'update:publishMode': [value: GroupPublishDraft['publishMode']]
  'update:gatewayUrl': [value: string]
  'update:gatewayUsername': [value: string]
  'update:gatewayPassword': [value: string]
  'update:remotePath': [projectName: string, remotePath: string]
}>()

const modeOptions = [
  { label: '直连 SFTP', value: 'direct-sftp' },
  { label: '网关 FileZilla', value: 'gateway-filezilla' },
]
</script>

<template>
  <BaseDialog
    :model-value="draft !== null"
    title="分组发布方式"
    :subtitle="draft?.groupName ?? ''"
    @update:model-value="!$event && emit('close')"
  >
    <div v-if="draft" class="group-publish">
      <FormField label="发布方式" hint="按分组生效，组内项目共用同一套交接流程">
        <BaseSegmented
          :model-value="draft.publishMode"
          :options="modeOptions"
          aria-label="分组发布方式"
          @update:model-value="emit('update:publishMode', $event as GroupPublishDraft['publishMode'])"
        />
      </FormField>

      <p v-if="draft.publishMode === 'direct-sftp'" class="group-publish__note">
        构建完成后仍由本应用直连服务器上传。适合可以 SSH/SFTP 直达的环境。
      </p>

      <template v-else>
        <p class="group-publish__note">
          构建成功后会用系统 Chrome 打开网关并尽快登录。SFTP / FileZilla 请你在页面里手动点；交接窗口会给出本地产物路径和已配置的远程路径，方便复制到 FileZilla。
          请安装 Google Chrome，并在屏幕顶部菜单栏「显示 → 开发者」中勾选「允许 Apple 事件中的 JavaScript」（不在 chrome://settings 里）。
        </p>

        <BaseInput
          :model-value="draft.gatewayUrl"
          type="url"
          label="网关登录地址"
          placeholder="https://网关地址/client/login/index"
          @update:model-value="emit('update:gatewayUrl', $event)"
        />
        <BaseInput
          :model-value="draft.gatewayUsername"
          label="网关用户名"
          autocomplete="off"
          @update:model-value="emit('update:gatewayUsername', $event)"
        />
        <BaseInput
          :model-value="draft.gatewayPassword"
          type="password"
          label="网关密码"
          autocomplete="off"
          :placeholder="draft.passwordMasked ? '已保存，留空则不修改' : '仅保存在本地，加密存储'"
          help-text="密码不会回到前端明文；交接时代登由本机 sidecar 完成。"
          @update:model-value="emit('update:gatewayPassword', $event)"
        />

        <FormField label="项目远程路径" hint="交接发布时展示给 FileZilla 粘贴，按项目单独配置">
          <div class="group-publish__devices">
            <BaseInput
              v-for="device in draft.devices"
              :key="device.projectName"
              :model-value="device.remotePath"
              :label="device.displayName"
              :placeholder="`例如 /www/${device.projectName}/`"
              @update:model-value="emit('update:remotePath', device.projectName, $event)"
            />
          </div>
        </FormField>
      </template>

      <p v-if="error" class="group-publish__error">{{ error }}</p>
    </div>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">取消</BaseButton>
      <BaseButton variant="primary" :loading="saving" @click="emit('save')">保存</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.group-publish {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.group-publish__note,
.group-publish__error {
  margin: 0;
  font-size: var(--font-size-xs);
  line-height: 1.55;
}

.group-publish__note {
  color: var(--color-text-muted);
}

.group-publish__error {
  color: var(--color-danger);
}

.group-publish__devices {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
</style>
