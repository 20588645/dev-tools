<script setup lang="ts">
/**
 * redesign-v2 统一项目方块卡：本地运行与部署面板共用同一基座，
 * 等高（min-height 158px）+ 状态渐变顶边 + 贴底操作栏，保证跨页切换不跳跃。
 */
export type ProjectCardStatus = 'running' | 'building' | 'ready' | 'failed' | 'idle'

withDefaults(defineProps<{
  name: string
  path?: string
  status?: ProjectCardStatus
  /** 悬停浮起反馈（卡片本身可点或纯展示） */
  interactive?: boolean
}>(), {
  path: undefined,
  status: 'idle',
  interactive: true,
})
</script>

<template>
  <article
    class="project-card"
    :class="[`project-card--${status}`, { 'project-card--interactive': interactive }]"
    :data-status="status"
  >
    <div class="project-card__top">
      <h3 class="project-card__name"><slot name="name">{{ name }}</slot></h3>
      <div v-if="$slots.badge" class="project-card__badge"><slot name="badge" /></div>
    </div>
    <div v-if="path" class="project-card__path" :title="path">{{ path }}</div>
    <div v-if="$slots.meta" class="project-card__meta"><slot name="meta" /></div>
    <div class="project-card__foot">
      <span v-if="$slots.footnote" class="project-card__footnote"><slot name="footnote" /></span>
      <div v-if="$slots.actions" class="project-card__actions"><slot name="actions" /></div>
    </div>
  </article>
</template>

<style scoped>
.project-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 158px;
  padding: 11px 12px 9px;
  overflow: hidden;
  border: 1px solid var(--color-border-soft);
  border-radius: 13px;
  background: var(--color-surface);
  box-shadow: var(--shadow-md);
  transition: transform var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard);
}

.project-card--interactive:hover {
  transform: translateY(-2px);
  box-shadow: 0 18px 40px -14px color-mix(in srgb, var(--color-text) 30%, transparent);
}

/* 状态渐变顶边：运行=青→蓝、构建=暖橙、就绪=绿、失败=红；idle 无 */
.project-card::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 3px;
  background: var(--project-card-hue, transparent);
}

.project-card--running { --project-card-hue: linear-gradient(90deg, var(--color-running), var(--color-action)); }
.project-card--building { --project-card-hue: linear-gradient(90deg, var(--color-warning), color-mix(in srgb, var(--color-warning) 55%, var(--color-neutral-0))); }
.project-card--ready { --project-card-hue: linear-gradient(90deg, var(--color-success), color-mix(in srgb, var(--color-success) 55%, var(--color-neutral-0))); }
.project-card--failed { --project-card-hue: linear-gradient(90deg, var(--color-danger), color-mix(in srgb, var(--color-danger) 55%, var(--color-neutral-0))); }

.project-card__top {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}

.project-card__name {
  margin: 0;
  font-size: 12.5px;
  font-weight: var(--font-weight-bold);
  line-height: 1.3;
  color: var(--color-text);
}

.project-card__badge { margin-left: auto; flex: none; }

.project-card__path {
  overflow: hidden;
  color: var(--color-text-subtle);
  font-family: var(--font-family-mono);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.project-card__foot {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: auto;
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border-soft);
}

.project-card__footnote {
  margin-right: auto;
  overflow: hidden;
  color: var(--color-text-subtle);
  font-family: var(--font-family-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-card__actions {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-left: auto;
}
</style>

<style>
/* 与原型 .proj-grid 一致：常规窗口一行 4 张定宽，少卡时右侧留空，不把单卡拉宽。 */
.project-card-grid {
  display: grid;
  align-items: stretch;
  gap: var(--space-3);
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (max-width: 1280px) and (min-width: 981px) {
  .project-card-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 980px) {
  .project-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 720px) {
  .project-card-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
