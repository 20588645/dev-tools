<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'

import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{
  dateLabel: string
  quote: string
  saved: boolean
  savedCount: number
  switching: boolean
  greeting: string
  activityTotal: number
}>()

defineEmits<{
  next: []
  toggleSaved: []
}>()
</script>

<template>
  <section class="hcard quote-card" aria-labelledby="home-daily-quote">
    <HomeCardHeader title="每日一言" :hint="dateLabel" title-id="home-daily-quote" />
    <div class="hcard-body">
      <div class="quote-stage">
        <span class="quote-mark" aria-hidden="true">“</span>
        <p class="quote-text" :class="{ 'is-switching': switching }">{{ quote }}</p>
        <span class="quote-by">— 本地文案 · 手动切换</span>
      </div>
      <div class="quote-foot">
        <span>{{ greeting }}，今日活动 {{ activityTotal }} 次</span>
        <span class="quote-foot-grow" />
        <span>已收藏 {{ savedCount }} 条</span>
        <BaseButton :variant="saved ? 'secondary' : 'outline'" size="sm" @click="$emit('toggleSaved')">
          {{ saved ? '已收藏' : '收藏' }}
        </BaseButton>
        <BaseButton variant="outline" size="sm" @click="$emit('next')">换一条</BaseButton>
      </div>
    </div>
  </section>
</template>
