/** 关闭 / 离开前是否需要确认（对齐 legacy `edTabNeedsConfirm`）。 */
export interface EditorDirtyTabLike {
  dirty: boolean
  isDraft: boolean
  /** 内容 trim 后为空（空草稿不算脏确认） */
  isContentEmpty: boolean
}

export function tabNeedsConfirm(tab: EditorDirtyTabLike): boolean {
  if (!tab.dirty) return false
  if (tab.isDraft) return !tab.isContentEmpty
  return true
}

export function hasConfirmableDirtyTabs(tabs: readonly EditorDirtyTabLike[]): boolean {
  return tabs.some(tabNeedsConfirm)
}
