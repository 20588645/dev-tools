<script setup lang="ts">
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseDisclosure from '@/components/disclosure/BaseDisclosure.vue'

import type { DeployGroupView } from '../composables/useDeployDashboard'

defineOptions({ name: 'DeployGroupSection' })

const props = defineProps<{
  group: DeployGroupView
  /** 该组走网关 FileZilla 交接，而不是直连 SFTP。 */
  gateway?: boolean
}>()

const emit = defineEmits<{
  toggle: []
  move: [dir: -1 | 1]
  rename: []
  publish: []
}>()

function onExpandedChange(expanded: boolean) {
  if (expanded !== !props.group.collapsed) emit('toggle')
}
</script>

<template>
  <!--
    分组用公共折叠组件的 panel 分区容器：标题条与卡片区共享一个外框。
    这同时修掉 D1——旧实现的 .run-group* 类随 run.css 删除后已无样式定义，
    分组头退化成裸文字且折叠可点性不可见。
  -->
  <BaseDisclosure
    class="deploy-group"
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
      <span class="deploy-group__summary">
        <span class="deploy-group__name" :class="{ 'is-ungrouped': group.isUngrouped }">{{ group.label }}</span>
        <span class="deploy-group__count">{{ group.projects.length }}</span>
        <span v-if="gateway" class="deploy-group__configured">网关 FileZilla</span>
        <span v-else-if="group.configuredCount > 0" class="deploy-group__configured">
          已配置 {{ group.configuredCount }}
        </span>
      </span>
    </template>
    <!-- 未分组是聚合视图而非真实分组，不提供排序与重命名 -->
    <template v-if="!group.isUngrouped" #actions>
      <div class="deploy-group__ops">
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
        <BaseIconButton label="发布方式" @click="emit('publish')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </BaseIconButton>
        <BaseIconButton label="重命名分组" @click="emit('rename')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </BaseIconButton>
      </div>
    </template>
    <div class="deploy-group__body project-card-grid">
      <slot />
    </div>
  </BaseDisclosure>
</template>

<style scoped>
.deploy-group__summary {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: var(--space-2);
}

.deploy-group__name {
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deploy-group__name.is-ungrouped {
  color: var(--color-text-muted);
  font-weight: var(--font-weight-medium);
}

.deploy-group__count {
  flex: none;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  background: var(--component-entity-card-panel);
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.deploy-group__configured {
  flex: none;
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
}

/* 分组排序/重命名是低频操作：悬停或键盘聚焦时才浮现，保持组头干净（原型只有一支淡色铅笔） */
.deploy-group__ops {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-standard);
}

.deploy-group:hover .deploy-group__ops,
.deploy-group:focus-within .deploy-group__ops {
  opacity: 1;
}

/*
  卡片网格见共享 .project-card-grid（一行 4 张定宽，与本地运行同一套）。
  容器是 14px 圆角，内层卡片收一档才有嵌套关系。
*/
.deploy-group__body {
  --component-card-radius: var(--component-disclosure-panel-item-radius);
}
</style>
