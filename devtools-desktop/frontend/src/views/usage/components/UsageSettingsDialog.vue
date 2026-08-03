<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'

import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseDataTable from '@/components/data/BaseDataTable.vue'
import type { BaseDataTableColumn, BaseDataTableRow } from '@/components/data/base-data-table'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import type {
  UsagePricingRow,
  UsagePricingSyncResult,
} from '@/services/modules/usage-service'

const props = defineProps<{
  modelValue: boolean
  pricing: UsagePricingRow[]
  loading: boolean
  syncing: boolean
  syncResult: UsagePricingSyncResult | null
  subscriptionFee: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:subscription-fee': [value: string]
  opened: []
  sync: []
  save: [value: UsagePricingRow]
  'save-subscription': []
}>()

const draft = ref<UsagePricingRow[]>([])

watch(
  () => props.pricing,
  (rows) => { draft.value = rows.map((row) => ({ ...row })) },
  { deep: true, immediate: true },
)
watch(
  () => props.modelValue,
  (value) => { if (value) emit('opened') },
)

const syncedSources = computed(() => props.syncResult?.sources.filter((source) => source.ok) ?? [])

function sourceLabel(source: string) {
  return source || '本地手动'
}

function confidenceLabel(confidence: string) {
  return ({
    verified: '多源一致',
    'single-source': '单一来源',
    conflict: '按优先来源',
    manual: '本地手动',
  } as Record<string, string>)[confidence] || confidence || '本地手动'
}

function updateNumber(row: UsagePricingRow, key: 'inputPerM' | 'outputPerM' | 'cacheReadPerM' | 'cacheCreationPerM', value: string) {
  row[key] = Number(value)
}

type PricingTableRow = UsagePricingRow & BaseDataTableRow
const pricingRows = computed<PricingTableRow[]>(() => draft.value.map(row => row as PricingTableRow))
const pricingColumns: BaseDataTableColumn<PricingTableRow>[] = [
  {
    key: 'modelId', title: '模型', width: 180,
    render: row => h('span', { class: 'usage-pricing-model usage-mono' }, row.modelId),
  },
  {
    key: 'displayName', title: '显示名', width: 136,
    render: row => h(BaseInput, {
      modelValue: row.displayName,
      class: 'usage-pricing-input',
      ariaLabel: `${row.modelId} 显示名`,
      'onUpdate:modelValue': (value: string) => { row.displayName = value },
    }),
  },
  ...([
    ['inputPerM', '输入', '输入价格'],
    ['outputPerM', '输出', '输出价格'],
    ['cacheReadPerM', '缓存命中', '缓存命中价格'],
    ['cacheCreationPerM', '缓存创建', '缓存创建价格'],
  ] as const).map(([key, title, label]): BaseDataTableColumn<PricingTableRow> => ({
    key,
    title,
    width: 86,
    render: row => h(BaseInput, {
      modelValue: row[key],
      type: 'number',
      class: 'usage-pricing-input',
      ariaLabel: `${row.modelId} ${label}`,
      'onUpdate:modelValue': (value: string) => updateNumber(row, key, value),
    }),
  })),
  {
    key: 'source', title: '来源', width: 78,
    render: row => h('div', { class: 'usage-pricing-source' }, [
      h(BaseBadge, { tone: row.source === 'manual' ? 'neutral' : 'success' }, () => sourceLabel(row.source)),
      h('small', confidenceLabel(row.confidence)),
    ]),
  },
  {
    key: 'action', title: '', width: 64, fixed: 'right',
    render: row => h(BaseButton, {
      variant: 'ghost',
      size: 'sm',
      onClick: () => emit('save', { ...row }),
    }, () => '保存'),
  },
]
</script>

<template>
  <BaseDialog
    :model-value="modelValue"
    title="数据与价格设置"
    width="min(960px, calc(100vw - 32px))"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="usage-settings">
      <section class="usage-settings__sync">
        <div>
          <strong>在线价格同步</strong>
          <p>来源按 models.dev、LiteLLM、OpenRouter 的优先级匹配。同步成功后直接覆盖可靠匹配项，未匹配模型不会被清空。</p>
        </div>
        <BaseButton :loading="syncing" @click="emit('sync')">同步并覆盖</BaseButton>
      </section>

      <div v-if="syncResult" class="usage-settings__result" role="status">
        <span><strong>{{ syncResult.applied }}</strong> 已覆盖</span>
        <span><strong>{{ syncResult.unchanged }}</strong> 无变化</span>
        <span><strong>{{ syncResult.unmatched }}</strong> 未匹配</span>
        <span><strong>{{ syncResult.conflicts }}</strong> 来源冲突</span>
        <span><strong>{{ syncResult.repriced }}</strong> 历史记录已重算</span>
        <small>{{ syncedSources.map((source) => source.source).join('、') || '没有可用在线来源' }}</small>
      </div>

      <section class="usage-settings__subscription">
        <BaseInput
          :model-value="subscriptionFee"
          class="usage-subscription-input"
          label="每月订阅总费用（USD）"
          type="number"
          placeholder="例如 220"
          help-text="用于本月回本参考，不影响 Token 统计或模型价格。"
          @update:model-value="emit('update:subscription-fee', $event)"
        />
        <BaseButton variant="secondary" @click="emit('save-subscription')">保存订阅费用</BaseButton>
      </section>

      <section class="usage-settings__models">
        <div class="usage-section-heading">
          <h2>模型单价</h2>
          <span>USD / 百万 Token</span>
        </div>
        <LoadingState v-if="loading" compact label="正在读取模型单价…" />
        <BaseDataTable
          v-else
          class="usage-pricing-table"
          :columns="pricingColumns"
          :rows="pricingRows"
          :row-key="row => row.modelId"
          density="compact"
          :scroll-x="806"
          aria-label="模型单价设置"
          empty-text="暂无本地模型价格记录"
        />
      </section>
    </div>
  </BaseDialog>
</template>
