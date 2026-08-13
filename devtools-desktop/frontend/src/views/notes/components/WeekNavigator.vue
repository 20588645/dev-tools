<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'

defineProps<{
  weekLabel: string
  weekCaption: string
  isCurrentWeek: boolean
}>()

const emit = defineEmits<{
  previous: []
  next: []
  current: []
}>()
</script>

<template>
  <div class="notes-week-navigator" aria-label="周次导航">
    <BaseButton variant="outline" size="sm" @click="emit('previous')">‹ 上一周</BaseButton>
    <span class="notes-week-navigator__grow" aria-hidden="true" />
    <div class="notes-week-navigator__range">
      <strong>{{ weekLabel }}</strong>
      <span>{{ weekCaption }}</span>
    </div>
    <span class="notes-week-navigator__grow" aria-hidden="true" />
    <BaseButton variant="outline" size="sm" @click="emit('next')">下一周 ›</BaseButton>
    <BaseButton v-if="!isCurrentWeek" variant="ghost" size="sm" @click="emit('current')">回到本周</BaseButton>
  </div>
</template>
