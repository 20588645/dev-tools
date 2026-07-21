<script setup lang="ts">
import {
  NButton,
  NDataTable,
  NDatePicker,
  NInput,
  NSelect,
  NTag,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { h, ref } from 'vue'

interface ProjectRow {
  name: string
  status: '运行中' | '已停止'
  updated: string
}

const message = useMessage()
const inputValue = ref('Naive UI 适配层')
const selectValue = ref('balanced')
const dateValue = ref<number | null>(Date.now())
const selectOptions = [
  { label: '稳态主题', value: 'balanced' },
  { label: '高对比主题', value: 'contrast' },
]
const rows: ProjectRow[] = [
  { name: 'personalTools', status: '运行中', updated: '刚刚' },
  { name: 'devtools-lab', status: '已停止', updated: '昨天' },
]
const columns: DataTableColumns<ProjectRow> = [
  { title: '项目', key: 'name' },
  {
    title: '状态',
    key: 'status',
    render: (row) => h(NTag, { type: row.status === '运行中' ? 'success' : 'default', bordered: false }, { default: () => row.status }),
  },
  { title: '最近更新', key: 'updated' },
]

function showMessage() {
  message.success('适配层已正确接收操作反馈')
}
</script>

<template>
  <div class="vendor-showcase">
    <div class="vendor-showcase__intro">
      <div>
        <strong>Naive UI 适配层</strong>
        <p>复杂控件由第三方库提供，主题颜色和尺寸仍由项目 Token 统一管理。</p>
      </div>
      <NButton type="primary" @click="showMessage">触发通知</NButton>
    </div>

    <div class="vendor-showcase__controls">
      <NInput v-model:value="inputValue" aria-label="项目名称" placeholder="输入项目名称" />
      <NSelect v-model:value="selectValue" aria-label="主题模式" :options="selectOptions" />
      <NDatePicker v-model:value="dateValue" aria-label="选择日期" placeholder="选择日期" type="date" clearable />
    </div>

    <NDataTable :columns="columns" :data="rows" :pagination="false" :bordered="false" />
  </div>
</template>

<style scoped>
.vendor-showcase { display: grid; gap: var(--space-4); }
.vendor-showcase__intro { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.vendor-showcase__intro strong { color: var(--color-text); font-size: var(--font-size-lg); }
.vendor-showcase__intro p { margin: var(--space-2) 0 0; color: var(--color-text-muted); font-size: var(--font-size-sm); line-height: var(--line-height-relaxed); }
.vendor-showcase__controls { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); }
@media (max-width: 720px) {
  .vendor-showcase__intro { align-items: flex-start; flex-direction: column; }
  .vendor-showcase__controls { grid-template-columns: 1fr; }
}
</style>
