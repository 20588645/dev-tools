<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'

import { formatBackupSize, formatBackupTime, type SettingsController } from '../composables/useSettings'

const props = defineProps<{ controller: SettingsController }>()
const emit = defineEmits<{
  'request-restore': [file: string]
  'request-delete': [file: string]
}>()
const {
  backups,
  visibleBackups,
  backupsExpanded,
  pendingRestore,
  latestBackupLabel,
  operation,
} = props.controller
</script>

<template>
  <section class="settings-category-panel" aria-labelledby="settingsBackupTitle">
    <div class="settings-panel-heading">
      <div><h2 id="settingsBackupTitle">数据与备份</h2><p>每日自动备份，滚动保留最近 7 份</p></div>
      <span>{{ backups.length }} SNAPSHOTS</span>
    </div>

    <div class="settings-backup-summary" data-setting-id="backup" tabindex="-1">
      <div>
        <strong>{{ pendingRestore ? '恢复已暂存' : backups.length ? '数据保护正常' : '尚未创建备份' }}</strong>
        <p>{{ pendingRestore ? '重启 Sidecar 后生效，也可以先取消恢复' : `最近备份：${latestBackupLabel}` }}</p>
      </div>
      <div class="settings-inline-control">
        <BaseButton
          v-if="pendingRestore"
          size="sm"
          variant="ghost"
          :loading="operation.backupCancel === 'working'"
          @click="controller.cancelRestore"
        >取消恢复</BaseButton>
        <BaseButton
          size="sm"
          :loading="operation.backupCreate === 'working'"
          @click="controller.createBackup"
        >立即备份</BaseButton>
      </div>
    </div>

    <div class="settings-backup-table">
      <div class="settings-backup-row is-head">
        <span>备份文件</span><span>创建时间</span><span>大小</span><span>操作</span>
      </div>
      <div v-if="!visibleBackups.length" class="settings-backup-empty">暂无本地备份</div>
      <div v-for="backup in visibleBackups" :key="backup.file" class="settings-backup-row">
        <strong :title="backup.file">{{ backup.file }}</strong>
        <span>{{ formatBackupTime(backup.createdAt) }}</span>
        <span>{{ formatBackupSize(backup.size) }}</span>
        <span class="settings-backup-actions">
          <BaseButton
            size="sm"
            variant="secondary"
            :disabled="operation.backupRestore === 'working'"
            @click="emit('request-restore', backup.file)"
          >恢复</BaseButton>
          <BaseIconButton
            class="settings-subtle-danger-action"
            size="sm"
            variant="ghost"
            :label="`删除备份 ${backup.file}`"
            :disabled="operation.backupDelete === 'working'"
            @click="emit('request-delete', backup.file)"
          >×</BaseIconButton>
        </span>
      </div>
      <footer v-if="backups.length > 3">
        <BaseButton size="sm" variant="ghost" @click="backupsExpanded = !backupsExpanded">
          {{ backupsExpanded ? '收起备份列表' : `查看全部 ${backups.length} 份` }}
        </BaseButton>
      </footer>
    </div>
  </section>
</template>
