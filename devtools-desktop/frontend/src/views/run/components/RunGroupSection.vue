<script setup lang="ts">
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import BaseDisclosure from '@/components/disclosure/BaseDisclosure.vue'

import type { RunGroupView } from '../composables/useRunPage'

defineOptions({ name: 'RunGroupSection' })

const props = defineProps<{ group: RunGroupView }>()

const emit = defineEmits<{
  toggle: []
  move: [dir: -1 | 1]
  rename: []
}>()

function onExpandedChange(expanded: boolean) {
  if (expanded !== !props.group.collapsed) emit('toggle')
}
</script>

<template>
  <BaseDisclosure
    class="run-group"
    :data-group="group.key"
    role="region"
    :aria-label="`${group.label}项目分组`"
    :model-value="!group.collapsed"
    variant="panel"
    header-padding="10px 0 5px"
    header-min-height="34px"
    content-gap="0"
    content-padding="6px 18px 16px"
    @update:model-value="onExpandedChange"
  >
    <template #header>
      <span class="run-group__summary">
        <span class="run-group__name" :class="{ 'is-ungrouped': group.isUngrouped }">{{ group.label }}</span>
        <span class="run-group__count">{{ group.projects.length }}</span>
        <StatusIndicator
          v-if="group.runningCount > 0"
          class="run-group__running"
          status="online"
          :label="`运行中 ${group.runningCount}`"
        />
      </span>
    </template>
    <template v-if="!group.isUngrouped" #actions>
      <div class="run-group__ops">
        <BaseIconButton label="上移分组" :disabled="group.index <= 0" @click="emit('move', -1)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
          </svg>
        </BaseIconButton>
        <BaseIconButton label="下移分组" :disabled="group.index >= group.total - 1" @click="emit('move', 1)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14" /><path d="M19 12l-7 7-7-7" />
          </svg>
        </BaseIconButton>
        <BaseIconButton label="重命名分组" @click="emit('rename')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </BaseIconButton>
      </div>
    </template>
    <div class="run-group__body">
      <slot />
    </div>
  </BaseDisclosure>
</template>

<style scoped>
.run-group__summary {
  display: flex;
  flex: 1 1 auto;
  gap: var(--space-2);
  align-items: center;
  min-width: 0;
}

/*
  分组用公共折叠组件的 panel 分区容器：标题条与卡片区共享一个外框，
  标题因此不需要再弱化成 eyebrow 去避免抢戏，恢复主文本字号。
*/
.run-group__name {
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-group__name.is-ungrouped {
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
}

.run-group__count {
  flex: none;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: var(--component-entity-card-panel);
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.run-group__running {
  flex: none;
  color: var(--color-success);
  font-size: var(--font-size-xs);
}

/* 分组排序/重命名是低频操作：悬停或键盘聚焦时才浮现，保持组头干净（原型只有一支淡色铅笔） */
.run-group__ops {
  display: flex;
  flex: none;
  gap: var(--space-1);
  align-items: center;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.run-group:hover .run-group__ops,
.run-group:focus-within .run-group__ops {
  opacity: 1;
}

/*
  P6：卡片网格自适应列宽。旧实现用固定 348px 列，单项目分组右侧会空掉一半。
  用 auto-fit 而非 auto-fill：auto-fill 会保留空轨道，只有一个项目时仍占两列宽，
  空白照样在；auto-fit 会折叠空轨道，让单卡片铺满该分组宽度。
  同时限制最大宽度，避免宽屏下单卡片被拉成一整条。

  stretch 让同排卡片等高；配合卡片内固定行数的状态区，跨排高度也一致。
*/
.run-group__body {
  /* 容器已经是 14px 圆角，内层卡片收一档才有嵌套关系 */
  --component-card-radius: var(--component-disclosure-panel-item-radius);

  display: grid;
  align-items: stretch;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.run-group__body > :only-child { max-width: 420px; }
</style>
