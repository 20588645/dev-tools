<script setup lang="ts">
import { computed } from 'vue'

import introWorkbenchUrl from '@/assets/intro/intro-workbench.webp'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import { getNavIconSvg } from '@/components/layout/nav-icons'
import { useProjectIntro } from '@/composables/useProjectIntro'
import type { AppPageId } from '@/router/page-contract'

defineOptions({ name: 'ProjectIntroDialog' })

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const { version, sidecarLabel, sidecarClass } = useProjectIntro(open)

const features: Array<{ page: AppPageId; title: string; desc: string }> = [
  { page: 'run', title: '本地运行', desc: '多项目开发服务，启动、模块选择与自动重启' },
  { page: 'deploy', title: '构建部署', desc: '多模块构建与 SFTP 部署，含服务器和历史' },
  { page: 'terminal', title: '快捷命令', desc: '预设 Shell 一键执行，处理路由、端口和 IP' },
  { page: 'todo', title: '待办事项', desc: '三列看板管理进度，支持定时提醒' },
  { page: 'notes', title: '工时内容', desc: '按周记录工作，可查询 Git 活动并写入当天' },
  { page: 'notebook', title: '个人笔记', desc: '图片粘贴、标签分类与全文搜索' },
]

function featureIcon(page: AppPageId) {
  return getNavIconSvg(page)
}

function close() {
  open.value = false
}
</script>

<template>
  <BaseDialog
    v-model="open"
    title="DevTools Desktop"
    subtitle="前端开发全流程效率工具"
  >
    <div class="intro-stage">
      <aside class="intro-portrait">
        <img
          :src="introWorkbenchUrl"
          alt="开发者在本地工作台前工作"
          width="768"
          height="1152"
        >
      </aside>

      <div class="intro-copy">
        <p class="intro-kicker">个人前端开发工作台</p>
        <p class="intro-desc">
          把本地运行、构建部署、文件终端和记录工具放在同一处，覆盖日常开发全流程。构建完成与待办到期可通过桌面通知提醒。
        </p>
        <ul class="intro-features">
          <li v-for="item in features" :key="item.page" class="intro-feature">
            <span class="intro-feature__icon" aria-hidden="true" v-html="featureIcon(item.page)" />
            <span class="intro-feature__copy">
              <strong>{{ item.title }}</strong>
              <small>{{ item.desc }}</small>
            </span>
          </li>
        </ul>
      </div>
    </div>

    <div class="intro-facts" aria-label="运行环境">
      <span>版本 <b>{{ version }}</b></span>
      <span>Sidecar <b :class="sidecarClass">{{ sidecarLabel }}</b></span>
      <span>存储 <b>SQLite</b></span>
      <span>平台 <b>macOS · Tauri</b></span>
    </div>

    <template #footer>
      <BaseButton variant="primary" @click="close">知道了</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.intro-stage {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(196px, 0.42fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: stretch;
}

.intro-portrait {
  overflow: hidden;
  min-height: 280px;
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--component-disclosure-panel-item-radius);
  box-shadow: var(--shadow-md);
}

.intro-portrait img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 22%;
}

.intro-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--space-3);
}

.intro-kicker {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
}

.intro-desc {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-relaxed);
}

.intro-features {
  display: grid;
  min-width: 0;
  flex: 1 1 auto;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.intro-feature {
  display: grid;
  min-width: 0;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: start;
  gap: 8px;
  padding: 8px 9px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
}

.intro-feature__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  color: var(--color-action);
  background: color-mix(in srgb, var(--color-action) 11%, transparent);
  border-radius: var(--radius-sm);
}

.intro-feature__icon :deep(svg) {
  width: 14px;
  height: 14px;
}

.intro-feature__copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.intro-feature strong {
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
}

.intro-feature small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.intro-facts {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: var(--space-2) 18px;
  margin-top: var(--space-3);
  padding: 10px 14px;
  color: var(--color-text-muted);
  background: var(--color-surface-raised);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
}

.intro-facts > span {
  display: inline-flex;
  min-width: 0;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
}

.intro-facts b {
  color: var(--color-text);
  font-family: var(--font-family-mono);
  font-weight: var(--font-weight-semibold);
}

.intro-facts b.ok { color: var(--color-success); }
.intro-facts b.warn { color: var(--color-warning); }
.intro-facts b.danger { color: var(--color-danger); }

@media (max-width: 640px) {
  .intro-stage {
    grid-template-columns: minmax(0, 1fr);
  }

  .intro-portrait {
    max-height: 180px;
    min-height: 160px;
  }

  .intro-features {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
