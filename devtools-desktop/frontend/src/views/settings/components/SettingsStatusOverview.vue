<script setup lang="ts">
defineProps<{
  sidecar: string
  sidecarOnline: boolean
  backup: string
  notification: string
  repositories: number
}>()
</script>

<template>
  <section class="settings-status-overview" aria-label="系统状态摘要">
    <article class="settings-status-card">
      <span class="settings-status-card__mark" :class="{ 'is-online': sidecarOnline }">SC</span>
      <span><small>Sidecar</small><strong>{{ sidecar }}</strong></span>
    </article>
    <article class="settings-status-card">
      <span class="settings-status-card__mark">DB</span>
      <span><small>数据备份</small><strong>{{ backup }}</strong></span>
    </article>
    <article class="settings-status-card">
      <span class="settings-status-card__mark">NT</span>
      <span><small>系统通知</small><strong>{{ notification }}</strong></span>
    </article>
    <article class="settings-status-card">
      <span class="settings-status-card__mark">GL</span>
      <span><small>Git 活动</small><strong>{{ repositories }} 个仓库</strong></span>
    </article>
  </section>
</template>
