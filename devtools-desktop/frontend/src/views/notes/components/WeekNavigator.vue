<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSwitch from '@/components/form/BaseSwitch.vue'

defineProps<{
  weekLabel: string
  weekCaption: string
  isCurrentWeek: boolean
  showWeekend: boolean
  referenceOpen: boolean
}>()

const emit = defineEmits<{
  previous: []
  next: []
  current: []
  reference: []
  'update:showWeekend': [value: boolean]
}>()
</script>

<template>
  <div class="notes-week-navigator" aria-label="周次与显示设置">
    <div class="notes-week-navigator__steps">
      <BaseButton variant="outline" size="sm" @click="emit('previous')">上一周</BaseButton>
      <div class="notes-week-navigator__range">
        <strong>{{ weekLabel }}</strong>
        <span>{{ weekCaption }}</span>
      </div>
      <BaseButton variant="outline" size="sm" @click="emit('next')">下一周</BaseButton>
      <BaseButton v-if="!isCurrentWeek" variant="ghost" size="sm" @click="emit('current')">回到本周</BaseButton>
    </div>
    <div class="notes-week-navigator__actions">
      <BaseSwitch
        class="notes-week-navigator__switch"
        :model-value="showWeekend"
        label="显示周末"
        @update:model-value="emit('update:showWeekend', $event)"
      />
      <BaseButton
        variant="secondary"
        size="sm"
        :aria-expanded="referenceOpen"
        aria-controls="notes-reference-panel"
        @click="emit('reference')"
      >
        {{ referenceOpen ? '收起参考' : 'Git 活动参考' }}
      </BaseButton>
    </div>
  </div>
</template>
