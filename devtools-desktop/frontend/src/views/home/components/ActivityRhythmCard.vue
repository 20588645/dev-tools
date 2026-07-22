<script setup lang="ts">
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'

import HomeCardHeader from './HomeCardHeader.vue'

defineProps<{
  loading: boolean
  error: string
  total: number
  peak: string
  heights: number[]
}>()

defineEmits<{ retry: [] }>()
</script>

<template>
  <section class="g-card activity-card" aria-labelledby="home-activity-title">
    <HomeCardHeader label="Today · Rhythm" title="今日活动节奏" title-id="home-activity-title" hint="来自本地运行与操作记录" />
    <LoadingState v-if="loading" compact label="整理今日活动…" />
    <ErrorState v-else-if="error" compact title="活动记录暂不可用" :description="error" @retry="$emit('retry')" />
    <div v-else class="activity-body">
      <div class="activity-total">
        <strong>{{ total }}</strong>
        <span>次有效活动</span>
        <small>{{ peak }}</small>
      </div>
      <div>
        <div class="rhythm-bars" :class="{ empty: total === 0 }" :aria-label="`今日 ${total} 次有效活动`">
          <i v-for="(height, index) in heights" :key="index" :style="{ '--bar-height': `${height}%`, '--bar-opacity': total ? String(.28 + height / 140) : '.15' }" />
        </div>
        <div class="rhythm-labels"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      </div>
    </div>
  </section>
</template>
