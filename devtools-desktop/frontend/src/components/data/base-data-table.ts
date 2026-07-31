import type { HTMLAttributes, VNodeChild } from 'vue'

export type BaseDataTableRow = Record<string, unknown>
export type BaseDataTableRowKey<Row extends BaseDataTableRow> = (row: Row) => string | number
export type BaseDataTableRowProps<Row extends BaseDataTableRow> = (row: Row, index: number) => HTMLAttributes

export interface BaseDataTableColumn<Row extends BaseDataTableRow> {
  key: string
  title: string
  width?: number
  minWidth?: number
  maxWidth?: number
  align?: 'left' | 'center' | 'right'
  fixed?: 'left' | 'right'
  ellipsis?: boolean
  resizable?: boolean
  render?: (row: Row, index: number) => VNodeChild
  sorter?: boolean | ((left: Row, right: Row) => number)
}
