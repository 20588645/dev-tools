<script setup lang="ts" generic="Row extends BaseDataTableRow = BaseDataTableRow">
import { computed } from 'vue'
import {
  NDataTable,
  type DataTableColumns,
} from 'naive-ui'

import type {
  BaseDataTableColumn,
  BaseDataTableRow,
  BaseDataTableRowKey,
  BaseDataTableRowProps,
} from './base-data-table'

const props = withDefaults(defineProps<{
  columns: BaseDataTableColumn<Row>[]
  rows: Row[]
  rowKey?: BaseDataTableRowKey<Row>
  rowProps?: BaseDataTableRowProps<Row>
  density?: 'compact' | 'default' | 'comfortable'
  bordered?: boolean
  striped?: boolean
  loading?: boolean
  maxHeight?: number
  scrollX?: number
  emptyText?: string
  ariaLabel?: string
}>(), {
  rowKey: undefined,
  rowProps: undefined,
  density: 'default',
  bordered: false,
  striped: false,
  loading: false,
  maxHeight: undefined,
  scrollX: undefined,
  emptyText: '暂无数据',
  ariaLabel: '数据表格',
})

const resolvedColumns = computed<DataTableColumns<Row>>(() => props.columns.map(column => ({
  key: column.key,
  title: column.title,
  width: column.width,
  minWidth: column.minWidth,
  maxWidth: column.maxWidth,
  align: column.align,
  fixed: column.fixed,
  ellipsis: column.ellipsis,
  resizable: column.resizable,
  render: column.render,
  sorter: column.sorter,
})))

const size = computed(() => ({
  compact: 'small' as const,
  default: 'medium' as const,
  comfortable: 'large' as const,
}[props.density]))

const tableThemeOverrides = {
  borderColor: 'var(--color-border)',
  thColor: 'var(--color-surface-subtle)',
  thColorHover: 'var(--color-surface-subtle)',
  thColorSorting: 'var(--color-surface-subtle)',
  thTextColor: 'var(--color-text-muted)',
  thFontWeight: 'var(--font-weight-semibold)',
  tdColor: 'transparent',
  tdColorHover: 'var(--color-surface-subtle)',
  tdColorStriped: 'var(--color-surface-subtle)',
  tdTextColor: 'var(--color-text)',
  loadingColor: 'var(--color-action)',
  borderRadius: 'var(--radius-md)',
}
</script>

<template>
  <div class="base-data-table" role="region" :aria-label="ariaLabel">
    <NDataTable
      :columns="resolvedColumns"
      :data="rows"
      :row-key="rowKey"
      :row-props="rowProps"
      :size="size"
      :bordered="bordered"
      :striped="striped"
      :loading="loading"
      :max-height="maxHeight"
      :scroll-x="scrollX"
      :pagination="false"
      :single-line="false"
      :theme-overrides="tableThemeOverrides"
    >
      <template #empty>
        <slot name="empty">
          <span class="base-data-table__empty">{{ emptyText }}</span>
        </slot>
      </template>
    </NDataTable>
  </div>
</template>

<style scoped>
.base-data-table {
  min-width: 0;
  color: var(--color-text);
}

.base-data-table__empty {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}
</style>
