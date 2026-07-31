<script setup lang="ts">
import { ref, watch } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import {
  clearRunHistory,
  deleteRunHistoryItem,
  getRunHistory,
  type RunHistoryItem,
} from '@/services/modules/run-service'

import { formatHistoryStatus, formatHistoryTime } from '../run-format'

defineOptions({ name: 'RunHistoryDialog' })

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

const items = ref<RunHistoryItem[]>([])
const loading = ref(false)
const error = ref('')
const pendingDelete = ref<RunHistoryItem | null>(null)
const confirmClear = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    items.value = await getRunHistory()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载失败'
  } finally {
    loading.value = false
  }
}

// 每次打开都重新拉取，并先清空旧内容——否则二次打开会闪现上一次的数据
watch(() => props.open, (open) => {
  if (!open) return
  items.value = []
  void load()
})

async function removeItem() {
  const target = pendingDelete.value
  pendingDelete.value = null
  if (!target) return
  try {
    await deleteRunHistoryItem(target.id)
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '删除失败'
  }
}

async function clearAll() {
  confirmClear.value = false
  try {
    await clearRunHistory()
    await load()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '清空失败'
  }
}
</script>

<template>
  <BaseDialog
    :model-value="open"
    title="📋 本地运行历史"
    subtitle="最近 100 条运行记录"
    width="min(780px, 94vw)"
    @update:model-value="!$event && emit('close')"
  >
    <LoadingState v-if="loading" title="加载中…" />
    <ErrorState v-else-if="error" title="加载失败" :description="error">
      <template #actions>
        <BaseButton variant="secondary" @click="load()">重试</BaseButton>
      </template>
    </ErrorState>
    <EmptyState v-else-if="items.length === 0" title="暂无运行历史记录" compact />

    <div v-else class="run-history__scroll">
      <table class="run-history__table">
        <thead>
          <tr>
            <th scope="col">时间</th>
            <th scope="col">项目</th>
            <th scope="col">模块</th>
            <th scope="col">状态</th>
            <th scope="col">运行时长</th>
            <th scope="col"><span class="run-history__sr">操作</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td class="run-history__time">{{ formatHistoryTime(item.startedAt) }}</td>
            <td class="run-history__ellipsis" :title="item.projectName">{{ item.projectName }}</td>
            <!-- F1：后端字段是 modules，旧前端读 moduleNames 导致此列恒为「—」 -->
            <td class="run-history__ellipsis" :title="item.modules.join(', ')">
              {{ item.modules.length > 0 ? item.modules.join(', ') : '—' }}
            </td>
            <td>
              <!-- F2：三档需要后端不再把 stopped 改写成 success 才有意义 -->
              <BaseBadge :tone="formatHistoryStatus(item.status).tone === 'neutral' ? 'neutral' : formatHistoryStatus(item.status).tone">
                {{ formatHistoryStatus(item.status).label }}
              </BaseBadge>
            </td>
            <td>{{ item.duration || '—' }}</td>
            <td>
              <BaseIconButton
                label="删除这条记录"
                variant="danger"
                size="sm"
                @click="pendingDelete = item"
              >⌫</BaseIconButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <template #footer>
      <BaseButton
        variant="danger"
        :disabled="items.length === 0"
        @click="confirmClear = true"
      >🗑 清空历史</BaseButton>
      <BaseButton variant="ghost" @click="emit('close')">关闭</BaseButton>
    </template>
  </BaseDialog>

  <!-- 删除不可逆、按钮又是小图标易误触，与「清空历史」确认粒度对齐 -->
  <ConfirmDialog
    :model-value="pendingDelete !== null"
    title="删除运行记录"
    :message="pendingDelete ? `确定删除 ${pendingDelete.projectName} 的这条运行记录？` : ''"
    confirm-text="删除"
    tone="danger"
    @update:model-value="!$event && (pendingDelete = null)"
    @confirm="removeItem"
  />
  <ConfirmDialog
    v-model="confirmClear"
    title="清空运行历史"
    message="确定清空所有运行历史记录？此操作不可撤销。"
    confirm-text="清空"
    tone="danger"
    @confirm="clearAll"
  />
</template>

<style scoped>
/* 表格局部横向滚动，不产生弹窗级溢出 */
.run-history__scroll {
  max-height: 52vh;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.run-history__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-xs);
}

.run-history__table th,
.run-history__table td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  white-space: nowrap;
}

.run-history__table th {
  position: sticky;
  top: 0;
  background: var(--color-surface-raised);
  color: var(--color-text-muted);
  font-weight: var(--font-weight-semibold);
}

.run-history__table td { color: var(--color-text-muted); }
.run-history__table tbody tr:last-child td { border-bottom: 0; }
.run-history__table tbody tr:hover td { background: var(--color-surface-subtle); }

.run-history__time {
  color: var(--color-text);
  font-family: var(--font-family-mono);
}

/* 长项目名/长模块串截断，避免撑宽弹窗（全名见 title 悬浮） */
.run-history__ellipsis {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.run-history__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
