<script setup lang="ts">
import BaseCard from '@/components/base/BaseCard.vue'

defineProps<{
  sidecar: string
  sidecarOnline: boolean
  uptime: string
  backup: string
  notification: string
  repositories: number
}>()
</script>

<template>
  <!-- 原型 .status-strip：单面板一行状态摘要 -->
  <BaseCard class="settings-status-overview" content-padding="0">
    <div class="settings-status-strip" aria-label="系统状态摘要">
      <span>
        Sidecar
        <i class="settings-status-strip__dot" :class="{ 'is-online': sidecarOnline }" aria-hidden="true" />
        <b :class="{ 'is-online': sidecarOnline }">{{ sidecar }}</b>
      </span>
      <span>已运行 <b>{{ uptime }}</b></span>
      <span>上次备份 <b>{{ backup }}</b></span>
      <span>系统通知 <b>{{ notification }}</b></span>
      <span>Git 活动 <b>{{ repositories }} 个仓库</b></span>
    </div>
  </BaseCard>
</template>
