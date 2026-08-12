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
