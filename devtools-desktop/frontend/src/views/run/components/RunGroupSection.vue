<script setup lang="ts">
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'

import type { RunGroupView } from '../composables/useRunPage'

defineOptions({ name: 'RunGroupSection' })

defineProps<{ group: RunGroupView }>()

const emit = defineEmits<{
  toggle: []
  move: [dir: -1 | 1]
  rename: []
}>()
</script>

<template>
  <section class="run-group">
    <header class="run-group__head" :class="{ 'is-collapsed': group.collapsed }">
      <button
        type="button"
        class="run-group__toggle"
        :aria-expanded="!group.collapsed"
        @click="emit('toggle')"
      >
        <!-- 用固定尺寸容器包住再旋转：直接旋转「⌄」字形会因其自身不居中而偏移 -->
        <span class="run-group__chevron" :class="{ 'is-collapsed': group.collapsed }" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
        <span class="run-group__name" :class="{ 'is-ungrouped': group.isUngrouped }">{{ group.label }}</span>
        <span class="run-group__count">{{ group.projects.length }} 个项目</span>
        <StatusIndicator
          v-if="group.runningCount > 0"
          class="run-group__running"
          status="online"
          :label="`运行中 ${group.runningCount}`"
        />
      </button>
      <div v-if="!group.isUngrouped" class="run-group__ops">
        <BaseIconButton label="上移分组" :disabled="group.index <= 0" @click="emit('move', -1)">↑</BaseIconButton>
        <BaseIconButton label="下移分组" :disabled="group.index >= group.total - 1" @click="emit('move', 1)">↓</BaseIconButton>
        <BaseIconButton label="重命名分组" @click="emit('rename')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </BaseIconButton>
      </div>
    </header>
    <div v-show="!group.collapsed" class="run-group__body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.run-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.run-group__head {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-raised);
}

.run-group__toggle {
  display: flex;
  flex: 1 1 auto;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.run-group__toggle:focus-visible { outline: var(--component-focus-outline); }

.run-group__chevron {
  display: grid;
  flex: none;
  width: 16px;
  height: 16px;
  place-items: center;
  color: var(--color-text-muted);
  transition: transform var(--duration-fast) var(--ease-standard);
}

.run-group__chevron.is-collapsed { transform: rotate(-90deg); }

.run-group__name {
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-group__name.is-ungrouped {
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
}

.run-group__count {
  flex: none;
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
}

.run-group__running {
  flex: none;
  color: var(--color-success);
  font-size: var(--font-size-xs);
}

.run-group__ops {
  display: flex;
  flex: none;
  gap: var(--space-1);
  align-items: center;
}

/*
  P6：卡片网格自适应列宽。旧实现用固定 348px 列，单项目分组右侧会空掉一半。
  用 auto-fit 而非 auto-fill：auto-fill 会保留空轨道，只有一个项目时仍占两列宽，
  空白照样在；auto-fit 会折叠空轨道，让单卡片铺满该分组宽度。
  同时限制最大宽度，避免宽屏下单卡片被拉成一整条。
*/
.run-group__body {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-3);
}

.run-group__body > :only-child { max-width: 420px; }
</style>
