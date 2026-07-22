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
import BaseInput from '@/components/form/BaseInput.vue'
import BaseTextarea from '@/components/form/BaseTextarea.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseRadio from '@/components/form/BaseRadio.vue'
import BaseSwitch from '@/components/form/BaseSwitch.vue'
import BaseTabs from '@/components/navigation/BaseTabs.vue'
import BaseSegmented from '@/components/navigation/BaseSegmented.vue'
import FilterChip from '@/components/navigation/FilterChip.vue'
import NaiveUiShowcase from '@/components/vendor/NaiveUiShowcase.vue'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const dialogOpen = ref(false)
type PreviewTab = '基础控件' | '反馈状态' | '页面骨架' | '第三方组件'
const selectedTab = ref<PreviewTab>('基础控件')
const tabs = [
  { label: '基础控件', value: '基础控件' },
  { label: '反馈状态', value: '反馈状态' },
  { label: '页面骨架', value: '页面骨架' },
  { label: '第三方组件', value: '第三方组件' },
]
const inputValue = ref('personalTools')
const textareaValue = ref('这里是一段可编辑的说明。')
const selectValue = ref('dark')
const checked = ref(true)
const radioValue = ref('local')
const switchValue = ref(true)
const segmentedValue = ref('全部')
const filterSelected = ref(true)
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
          <BaseTabs v-model="selectedTab" :items="tabs" aria-label="预览分类" />
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

      <PageSection title="表单控件">
        <BaseCard variant="raised">
          <div class="form-grid">
            <BaseInput v-model="inputValue" label="项目名称" help-text="用于列表和页面标题。" />
            <BaseSelect v-model="selectValue" label="默认主题" :options="[{ label: '暗色主题', value: 'dark' }, { label: '亮色主题', value: 'light' }]" />
            <BaseTextarea v-model="textareaValue" label="描述" :rows="3" />
            <div class="choice-stack">
              <BaseCheckbox v-model="checked" label="自动保存" description="离开页面前保存当前设置。" />
              <BaseRadio v-model="radioValue" name="preview-source" value="local" label="本地数据" />
              <BaseRadio v-model="radioValue" name="preview-source" value="remote" label="远程数据" />
              <BaseSwitch v-model="switchValue" label="启用通知" description="允许显示操作反馈。" />
            </div>
          </div>
        </BaseCard>
      </PageSection>

      <PageSection title="导航与筛选（对应业务页筛选 Tab）">
        <BaseCard>
          <div class="navigation-row">
            <BaseSegmented v-model="segmentedValue" :options="[{ label: '全部', value: '全部' }, { label: '运行中', value: '运行中' }, { label: '多模块', value: '多模块' }, { label: '单体项目', value: '单体项目' }]" />
            <FilterChip v-model:selected="filterSelected" label="收藏项目" :count="3" removable />
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

      <template v-else-if="selectedTab === '页面骨架'">
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

      <template v-else>
        <PageSection title="第三方组件适配">
          <BaseCard variant="raised">
            <NaiveUiShowcase />
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
.card-preview { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
.choice-stack { display: grid; align-content: start; gap: var(--space-3); }
.navigation-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-3); }
strong { color: var(--color-text); font-size: var(--font-size-lg); }
p { margin: var(--space-2) 0 0; color: var(--color-text-muted); font-size: var(--font-size-sm); line-height: var(--line-height-relaxed); }
.dialog-copy { margin: 0; }
@media (max-width: 720px) { .card-preview { align-items: flex-start; flex-direction: column; } .form-grid { grid-template-columns: 1fr; } }
</style>
