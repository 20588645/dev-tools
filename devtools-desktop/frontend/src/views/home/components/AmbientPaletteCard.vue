<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import { useAppStore } from '@/stores/app'

import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{ palette: string[] }>()

const app = useAppStore()
const activeColor = computed(() => app.accentColor)

function pick(color: string) {
  app.applyAccentColor(color)
}

const hexLabel = (color: string) => color.replace('#', '').toUpperCase()

const hasCustomAccent = computed(() => activeColor.value !== null)
</script>

<template>
  <section class="hcard palette-card" aria-labelledby="home-palette-title">
    <HomeCardHeader title="氛围色板" title-id="home-palette-title">
      <template #action>
        <BaseButton v-if="hasCustomAccent" variant="outline" size="sm" @click="app.resetAccentColor()">恢复默认</BaseButton>
      </template>
    </HomeCardHeader>
    <div class="hcard-body">
      <div class="palette-wrap" role="group" aria-label="今日氛围色板，点击色块切换主题色">
        <div
          v-for="color in palette"
          :key="color"
          class="palette-block"
          :class="{ active: activeColor === color }"
          :style="{ background: color }"
          role="button"
          tabindex="0"
          :aria-label="`把主题色切换为 ${hexLabel(color)}`"
          :aria-pressed="activeColor === color"
          @click="pick(color)"
          @keydown.enter.prevent="pick(color)"
          @keydown.space.prevent="pick(color)"
        >
          <span>{{ hexLabel(color) }}</span>
        </div>
      </div>
      <div class="palette-note">按日期生成，每天 0 点自动换一组、当天固定；点击色块把主题色换成该色</div>
    </div>
  </section>
</template>
