<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import { useProjectIntro } from '@/composables/useProjectIntro'

defineOptions({ name: 'ProjectIntroDialog' })

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const open = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const { version, sidecarLabel, sidecarClass } = useProjectIntro(open)

const features = [
  { icon: '▶', title: '本地运行', desc: '管理多项目开发服务，快速启动、模块选择、自动重启。' },
  { icon: '↗', title: '构建部署', desc: '多模块构建 + SFTP 部署，服务器管理，历史记录追踪。' },
  { icon: '⚡', title: '快捷命令', desc: '预设 Shell 命令一键执行，VPN 路由、杀端口、查 IP。' },
  { icon: '✓', title: '待办事项', desc: '三列看板管理任务进度，支持定时提醒通知。' },
  { icon: '✏️', title: '工时内容', desc: '按周记录每日工作内容，直接查询 Git 活动并写入对应日期。' },
  { icon: '📒', title: '个人笔记', desc: '个人知识库，支持图片粘贴、标签分类、全文搜索。' },
  { icon: '🔔', title: '系统通知', desc: '构建完成、运行异常、待办到期通过桌面通知提醒。' },
] as const

function close() {
  open.value = false
}
</script>

<template>
  <BaseDialog
    v-model="open"
    title="DevTools Desktop"
    subtitle="前端开发全流程效率工具"
    width="min(720px, 92vw)"
  >
    <div class="intro-hero">
      <div class="intro-mark" aria-hidden="true">⌘</div>
      <div>
        <div class="intro-title">个人前端开发工作台</div>
        <div class="intro-desc">集成本地运行、构建部署、快捷命令、任务管理、工时记录和个人笔记，覆盖日常开发全流程。</div>
      </div>
    </div>

    <div class="intro-grid">
      <div v-for="item in features" :key="item.title" class="intro-item">
        <div class="intro-item-icon" aria-hidden="true">{{ item.icon }}</div>
        <div>
          <strong>{{ item.title }}</strong>
          <span>{{ item.desc }}</span>
        </div>
      </div>
    </div>

    <div class="intro-system-grid">
      <div class="intro-system-item">
        <span>版本</span>
        <strong>{{ version }}</strong>
      </div>
      <div class="intro-system-item">
        <span>Sidecar</span>
        <strong :class="sidecarClass">{{ sidecarLabel }}</strong>
      </div>
      <div class="intro-system-item">
        <span>存储</span>
        <strong>SQLite</strong>
      </div>
      <div class="intro-system-item">
        <span>平台</span>
        <strong>macOS · Tauri</strong>
      </div>
    </div>

    <div class="intro-meta">
      <span>Tauri 2.x</span>
      <span>Node.js Sidecar</span>
      <span>SQLite</span>
      <span>macOS</span>
    </div>

    <template #footer>
      <BaseButton variant="primary" @click="close">知道了</BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
/* L3（legacy token 化）：介绍弹窗视觉自 styles/legacy/runtime.css 收编自持。 */
.intro-hero {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-surface-raised) 72%, transparent);
}

.intro-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  color: var(--color-action);
  background: color-mix(in srgb, var(--color-action) 11%, transparent);
  font-size: 22px;
  font-weight: var(--font-weight-bold);
}

.intro-title {
  margin-bottom: 5px;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-bold);
}

.intro-desc {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-relaxed);
}

.intro-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: var(--space-3);
}

@media (max-width: 640px) {
  .intro-grid { grid-template-columns: 1fr; }

  .intro-system-grid { grid-template-columns: 1fr; }
}

.intro-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 9px;
  min-height: 88px;
  padding: 11px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.intro-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  color: var(--color-action);
  background: color-mix(in srgb, var(--color-action) 11%, transparent);
  font-size: 15px;
  line-height: 1;
}

.intro-item strong {
  display: block;
  margin-bottom: 4px;
  color: var(--color-text);
  font-size: 12px;
}

.intro-item span {
  display: block;
  color: var(--color-text-subtle);
  font-size: 10.5px;
  line-height: 1.5;
}

.intro-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: var(--space-3);
}

.intro-meta span {
  padding: 5px 9px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  font-size: 10px;
  font-weight: 650;
}

.intro-system-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-2);
  margin-top: var(--space-3);
}

.intro-system-item {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised);
}

.intro-system-item span,
.intro-system-item strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.intro-system-item span {
  margin-bottom: 5px;
  color: var(--color-text-subtle);
  font-size: 10px;
  font-weight: 650;
}

.intro-system-item strong {
  color: var(--color-text);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
}

.intro-system-item strong.ok { color: var(--color-success); }
.intro-system-item strong.warn { color: var(--color-warning); }
.intro-system-item strong.danger { color: var(--color-danger); }
</style>
