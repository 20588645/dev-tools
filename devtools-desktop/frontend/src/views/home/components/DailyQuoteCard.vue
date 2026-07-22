<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'

defineProps<{
  dateLabel: string
  quote: string
  quoteIndex: number
  saved: boolean
  switching: boolean
}>()

defineEmits<{
  next: []
  toggleSaved: []
}>()
</script>

<template>
  <section class="g-card quote-card" aria-labelledby="home-daily-quote">
    <div class="quote-copy">
      <span class="quote-date">{{ dateLabel }}</span>
      <h1 id="home-daily-quote" :class="{ 'is-switching': switching }">{{ quote }}</h1>
      <div class="quote-actions">
        <BaseButton variant="outline" size="sm" @click="$emit('next')">换一条</BaseButton>
        <BaseButton :variant="saved ? 'secondary' : 'outline'" size="sm" @click="$emit('toggleSaved')">
          {{ saved ? '已收藏' : '收藏' }}
        </BaseButton>
      </div>
    </div>
    <div class="quote-index">
      <strong class="developer-name">Ledy</strong>
      <div class="quote-track" aria-hidden="true">
        <i v-for="index in 3" :key="index" :class="{ active: index - 1 === quoteIndex }" />
      </div>
      <span>DAILY NOTE</span>
    </div>
  </section>
</template>
