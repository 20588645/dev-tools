<script setup lang="ts">
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseDisclosure from '@/components/disclosure/BaseDisclosure.vue'

import type { DeployGroupView } from '../composables/useDeployDashboard'

defineOptions({ name: 'DeployGroupSection' })

const props = defineProps<{ group: DeployGroupView }>()

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
    header-padding="var(--space-2) 0"
    header-min-height="26px"
    content-gap="0"
    content-padding="var(--space-3)"
    @update:model-value="onExpandedChange"
  >
    <template #header>
      <span class="deploy-group__summary">
        <span class="deploy-group__name" :class="{ 'is-ungrouped': group.isUngrouped }">{{ group.label }}</span>
        <span class="deploy-group__count">{{ group.projects.length }}</span>
        <span v-if="group.configuredCount > 0" class="deploy-group__configured">
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
        <BaseIconButton label="重命名分组" @click="emit('rename')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </BaseIconButton>
      </div>
    </template>
    <div class="deploy-group__body">
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
  font-weight: var(--font-weight-semibold);
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

.deploy-group__ops {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-1);
}

/*
  auto-fit 而非固定三列（修 D2）：固定列会让单项目分组右侧空掉两列，
  10 个项目分散 6 组时首屏只能看到 5 张卡。auto-fit 折叠空轨道让单卡片
  铺满该组宽度；同时限制最大宽度，避免宽屏下单卡被拉成一整条。

  stretch 让同排卡片等高；配合卡片内固定行数的状态区，跨排高度也一致。
*/
.deploy-group__body {
  display: grid;
  align-items: stretch;
  gap: var(--space-3);
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));

  /* 容器是 14px 圆角，内层卡片收一档才有嵌套关系 */
  --component-card-radius: var(--component-disclosure-panel-item-radius);
}

.deploy-group__body > :only-child { max-width: 420px; }
</style>
