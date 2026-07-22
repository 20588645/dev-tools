<script setup lang="ts">
import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{
  message: string
  wave: number[]
}>()
</script>

<template>
  <section class="g-card spectrum-card" aria-labelledby="home-spectrum-title">
    <HomeCardHeader label="Ambient Palette" title="今日色谱" title-id="home-spectrum-title" hint="由时间与活动节奏生成" />
    <div class="spectrum-main">
      <div>
        <div class="spectrum-title">{{ message }}</div>
        <div class="palette" aria-hidden="true"><span /><span /><span /><span /></div>
      </div>
      <div class="spectrum-wave" aria-hidden="true">
        <i v-for="(height, index) in wave" :key="index" :style="{ '--bar-height': `${height}%`, '--bar-opacity': String(.32 + height / 150) }" />
      </div>
    </div>
  </section>
</template>
