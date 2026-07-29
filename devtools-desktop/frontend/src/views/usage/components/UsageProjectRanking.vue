<script setup lang="ts">
import { computed } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import type { UsageProjectStat } from '@/services/modules/usage-service'

import { formatUsageNumber, formatUsagePercent, usageProjectTokens } from '../usage-format'

const props = defineProps<{ projects: UsageProjectStat[] }>()
const visible = computed(() => props.projects.slice(0, 6))
const max = computed(() => Math.max(...visible.value.map(usageProjectTokens), 1))
const total = computed(() => props.projects.reduce((sum, project) => sum + usageProjectTokens(project), 0) || 1)
</script>

<template>
  <div class="usage-ranking">
    <div class="usage-section-heading"><h2>项目用量</h2></div>
    <EmptyState v-if="!visible.length" compact title="暂无项目用量" />
    <div v-else class="usage-table-wrap" aria-label="项目用量排名">
      <table class="usage-table">
        <thead><tr><th>排名</th><th>项目 / 应用</th><th>请求数</th><th>Tokens</th><th>占比</th></tr></thead>
        <tbody>
          <tr v-for="(project, index) in visible" :key="project.project">
            <td><span class="usage-rank">{{ index + 1 }}</span></td>
            <td>
              <div class="usage-project-name">
                <BaseBadge
                  v-for="app in project.apps"
                  :key="app"
                  class="usage-app-tag"
                  :class="app === 'codex' ? 'is-codex' : 'is-claude'"
                >{{ app === 'codex' ? 'Codex' : 'Claude' }}</BaseBadge>
                <strong>{{ project.project }}</strong>
              </div>
              <div class="usage-project-bar"><i :style="{ width: `${usageProjectTokens(project) / max * 100}%` }" /></div>
            </td>
            <td>{{ formatUsageNumber(project.requests) }}</td>
            <td>{{ formatUsageNumber(usageProjectTokens(project)) }}</td>
            <td>{{ formatUsagePercent(usageProjectTokens(project) / total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
