<script setup lang="ts">
import { ref } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageSection from '@/components/layout/PageSection.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const dialogOpen = ref(false)
type PreviewTab = '基础控件' | '反馈状态' | '页面骨架'
const selectedTab = ref<PreviewTab>('基础控件')
const tabs: PreviewTab[] = ['基础控件', '反馈状态', '页面骨架']

const selectNextTab = (direction: 1 | -1) => {
  const currentIndex = tabs.indexOf(selectedTab.value)
  selectedTab.value = tabs[(currentIndex + direction + tabs.length) % tabs.length]
}
</script>

<template>
  <PageFrame>
    <template #top>
      <PageTop>
        <PageHeader title="UI Foundation" description="公共组件与 Design Token 预览（仅开发环境）">
          <template #icon>✦</template>
          <template #actions>
            <BaseButton variant="outline" @click="app.toggleTheme()">切换为{{ app.theme === 'dark' ? '亮色' : '暗色' }}</BaseButton>
          </template>
        </PageHeader>
        <PageToolbar>
          <div class="preview-tabs" role="tablist" aria-label="预览分类">
            <button
              v-for="tab in tabs"
              :key="tab"
              type="button"
              role="tab"
              :aria-selected="selectedTab === tab"
              :tabindex="selectedTab === tab ? 0 : -1"
              @click="selectedTab = tab"
              @keydown.right.prevent="selectNextTab(1)"
              @keydown.left.prevent="selectNextTab(-1)"
            >{{ tab }}</button>
          </div>
          <StatusIndicator :status="app.theme === 'dark' ? 'idle' : 'online'" :label="`${app.theme === 'dark' ? '暗色' : '亮色'}主题`" />
        </PageToolbar>
      </PageTop>
    </template>

    <div class="preview-grid">
      <template v-if="selectedTab === '基础控件'">
      <PageSection title="按钮与状态">
        <BaseCard variant="raised">
          <div class="component-row">
            <BaseButton>主要操作</BaseButton>
            <BaseButton variant="secondary">次要操作</BaseButton>
            <BaseButton variant="outline">描边操作</BaseButton>
            <BaseButton variant="ghost">幽灵操作</BaseButton>
            <BaseButton variant="danger">危险操作</BaseButton>
            <BaseButton loading>加载中</BaseButton>
          </div>
          <div class="component-row">
            <BaseIconButton label="更多操作">⋯</BaseIconButton>
            <BaseIconButton label="删除" variant="danger">×</BaseIconButton>
            <BaseBadge>默认</BaseBadge>
            <BaseBadge tone="info">信息</BaseBadge>
            <BaseBadge tone="success">成功</BaseBadge>
            <BaseBadge tone="warning">注意</BaseBadge>
            <BaseBadge tone="danger">错误</BaseBadge>
          </div>
        </BaseCard>
      </PageSection>

      <PageSection title="卡片与弹窗">
        <BaseCard variant="subtle" interactive>
          <div class="card-preview">
            <div><strong>可交互卡片</strong><p>所有公共展示组件从语义 Token 读取颜色和间距。</p></div>
            <BaseButton size="sm" @click="dialogOpen = true">打开弹窗</BaseButton>
          </div>
        </BaseCard>
      </PageSection>

      </template>

      <template v-else-if="selectedTab === '反馈状态'">
        <PageSection title="反馈状态">
        <BaseCard><LoadingState compact label="正在读取 Sidecar 状态…" /></BaseCard>
        <BaseCard><EmptyState title="还没有项目" description="添加第一个项目后，它会显示在这里。" /></BaseCard>
        <BaseCard><ErrorState title="连接失败" description="Sidecar 暂时没有响应。" @retry="app.markSidecarOffline()" /></BaseCard>
        </PageSection>

      </template>

      <template v-else>
        <PageSection title="页面骨架">
          <BaseCard variant="raised">
            <div class="skeleton-preview">
              <PageHeader title="页面标题" description="公共 PageHeader 负责统一标题、说明和操作布局">
                <template #icon>⌁</template>
                <template #actions><BaseButton size="sm">主操作</BaseButton></template>
              </PageHeader>
              <PageToolbar><StatusIndicator status="online" label="服务在线" /></PageToolbar>
            </div>
          </BaseCard>
        </PageSection>
      </template>
    </div>
  </PageFrame>

  <BaseDialog v-model="dialogOpen" title="组件预览弹窗">
    <p class="dialog-copy">这里用于确认遮罩、层级、关闭按钮和亮暗主题的基础表现。</p>
  </BaseDialog>
</template>

<style scoped>
.preview-grid { display: grid; gap: var(--space-6); max-width: 1120px; margin: 0 auto; }
.component-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.component-row + .component-row { margin-top: var(--space-4); }
.preview-tabs { display: flex; gap: var(--space-1); }
.preview-tabs button { min-height: var(--component-control-height-sm); padding: 0 var(--space-3); color: var(--color-text-muted); background: transparent; border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer; }
.preview-tabs button[aria-selected="true"] { color: var(--color-action); background: var(--color-surface-subtle); border-color: var(--color-border); }
.preview-tabs button:focus-visible { outline: none; box-shadow: var(--component-focus-outline); }
.card-preview { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
strong { color: var(--color-text); font-size: var(--font-size-lg); }
p { margin: var(--space-2) 0 0; color: var(--color-text-muted); font-size: var(--font-size-sm); line-height: var(--line-height-relaxed); }
.dialog-copy { margin: 0; }
@media (max-width: 720px) { .card-preview { align-items: flex-start; flex-direction: column; } }
</style>
