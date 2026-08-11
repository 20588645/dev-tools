<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import type { RemoteEntry } from '@/services/modules/deploy-service'

import { formatDeployTime, formatFileSize } from '../deploy-format'
import type { RemoteBreadcrumb } from '../composables/useRemoteBrowser'

defineOptions({ name: 'RemoteBrowserPanel' })

/**
 * 远程目录浏览的列表本体：面包屑 + 四列条目 + 连接态。
 *
 * 只服务远程浏览一处，不与添加项目的手动浏览共用——两者的列数、选择语义与
 * 状态维度都不同，详见 decision.md 第 14 节。
 */
const props = defineProps<{
  breadcrumbs: RemoteBreadcrumb[]
  /** 当前所在目录的绝对路径，用于拼子项路径。 */
  currentDir: string
  entries: RemoteEntry[]
  /** 当前目录的上级。null 表示已在根目录，不显示返回上级行。 */
  parentDir: string | null
  loading: boolean
  error: string
  /** 后端把请求路径回落到上级时的说明，非空则在列表上方提示。 */
  fallback: string
}>()

const emit = defineEmits<{ navigate: [path: string] }>()

/** 拼子项绝对路径。根目录下不能拼成 `//name`。 */
function childPath(name: string): string {
  return props.currentDir === '/' ? `/${name}` : `${props.currentDir}/${name}`
}
</script>

<template>
  <div class="remote-browser">
    <nav class="remote-browser__breadcrumb" aria-label="远程目录路径">
      <template v-for="(segment, index) in breadcrumbs" :key="segment.path">
        <span v-if="index > 0" class="remote-browser__separator" aria-hidden="true">/</span>
        <BaseButton
          variant="ghost"
          size="sm"
          :disabled="index === breadcrumbs.length - 1"
          @click="emit('navigate', segment.path)"
        >
          {{ segment.label }}
        </BaseButton>
      </template>
    </nav>

    <p v-if="fallback" class="remote-browser__fallback" role="status">{{ fallback }}</p>

    <LoadingState v-if="loading" label="正在连接服务器…" />

    <!-- 读取失败给返回根目录的出口：回落链已在后端走完，此处只剩根目录可试 -->
    <div v-else-if="error" class="remote-browser__error" role="alert">
      <p class="remote-browser__error-text">{{ error }}</p>
      <BaseButton variant="secondary" size="sm" @click="emit('navigate', '/')">返回根目录</BaseButton>
    </div>

    <div v-else class="remote-browser__list">
      <BaseSelectableItem
        v-if="parentDir !== null"
        appearance="row"
        @click="emit('navigate', parentDir)"
      >
        <span class="remote-browser__row">
          <span class="remote-browser__name">
            <svg
              class="remote-browser__icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 19V5" /><path d="m5 12 7-7 7 7" />
            </svg>
            <span>..</span>
          </span>
          <span class="remote-browser__meta">返回上级</span>
        </span>
      </BaseSelectableItem>

      <EmptyState v-if="entries.length === 0 && parentDir === null" compact title="空目录" />
      <p v-else-if="entries.length === 0" class="remote-browser__empty">空目录</p>

      <template v-for="entry in entries" :key="entry.name">
        <!-- 目录可进入 -->
        <BaseSelectableItem
          v-if="entry.isDir"
          appearance="row"
          @click="emit('navigate', childPath(entry.name))"
        >
          <span class="remote-browser__row">
            <span class="remote-browser__name">
              <svg
                class="remote-browser__icon"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
              </svg>
              <span :title="entry.name">{{ entry.name }}</span>
            </span>
            <span class="remote-browser__size">目录</span>
            <span class="remote-browser__meta">{{ formatDeployTime(entry.mtime) }}</span>
          </span>
        </BaseSelectableItem>

        <!--
          文件是「这个目录里有什么」的参考信息，不是可选项。用 disabled 按钮渲染
          会压到 0.42 不透明度并给 not-allowed 光标，看着像坏掉的选项；改为普通
          静态行，正常可读但不可点。
        -->
        <div v-else class="remote-browser__row remote-browser__row--static">
          <span class="remote-browser__name">
            <svg
              class="remote-browser__icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M14 3v5h5" />
              <path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
            </svg>
            <span :title="entry.name">{{ entry.name }}</span>
          </span>
          <span class="remote-browser__size">{{ formatFileSize(entry.size) }}</span>
          <span class="remote-browser__meta">{{ formatDeployTime(entry.mtime) }}</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.remote-browser { display: grid; gap: var(--space-2); }

.remote-browser__breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
}

.remote-browser__separator {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.remote-browser__fallback {
  margin: 0;
  color: var(--color-warning);
  font-size: var(--font-size-xs);
}

/* 目录条目数不可预期，本区自滚，不把弹窗撑出视口 */
.remote-browser__list {
  display: grid;
  overflow-y: auto;
  min-height: 220px;
  max-height: 360px;
  align-content: start;
  gap: var(--space-1);
}

.remote-browser__row {
  display: grid;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
  grid-template-columns: minmax(0, 1fr) auto auto;
}

/* 文件行不可点，内边距与可点行对齐，避免两类行错位 */
.remote-browser__row--static {
  min-height: var(--component-control-height);
  padding: var(--space-3);
  color: var(--color-text-muted);
}

.remote-browser__name {
  display: flex;
  overflow: hidden;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remote-browser__icon { flex: none; }

.remote-browser__size,
.remote-browser__meta {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

.remote-browser__size {
  min-width: 64px;
  text-align: right;
  font-family: var(--font-family-mono);
}

.remote-browser__meta { min-width: 108px; text-align: right; }

.remote-browser__error {
  display: grid;
  justify-items: center;
  gap: var(--space-3);
  padding: var(--space-6) 0;
}

.remote-browser__error-text {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
  text-align: center;
}

.remote-browser__empty {
  margin: 0;
  padding: var(--space-4) 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  text-align: center;
}
</style>
