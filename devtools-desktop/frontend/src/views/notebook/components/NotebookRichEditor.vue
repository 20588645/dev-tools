<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import {
  resolveNotebookAssetUrl,
  uploadNotebookImage,
} from '@/services/modules/notebook-service'
import { tauriClient } from '@/services/tauri-client'
import { useNotificationStore } from '@/stores/notification'

import {
  credentialTemplateHtml,
  notebookImagePath,
  plainTextToNotebookHtml,
  safeNotebookHttpUrl,
  sanitizeNotebookHtml,
} from '../notebook-html'

const props = defineProps<{
  noteId: string
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const notifications = useNotificationStore()
const editor = ref<HTMLElement | null>(null)
const activeTable = ref<HTMLTableElement | null>(null)
const activeRow = ref<HTMLTableRowElement | null>(null)
const activeColumn = ref(0)
type CredentialControl = {
  table: HTMLTableElement
  target: HTMLTableCellElement
  key: number
  index: number
  editing: boolean
}
const credentialControls = shallowRef<CredentialControl[]>([])
const credentialControlKeys = new WeakMap<HTMLTableElement, number>()
let applyingModel = false
let copyTimer: ReturnType<typeof setTimeout> | null = null
let credentialControlKey = 0
let composingCredential = false
let savedSelection: Range | null = null
let selectionNoteId = props.noteId
let suppressSelectionCapture = false
let selectionGuardTimer: ReturnType<typeof setTimeout> | null = null

function serializeContent() {
  if (!editor.value) return ''
  const clone = editor.value.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-credential-runtime-controls]').forEach((element) => element.remove())
  clone.querySelectorAll(
    '[contenteditable], [role], [tabindex], [aria-label], [data-editing], [data-copy-state], [data-active-column], [data-placeholder], [data-credential-project-empty]',
  ).forEach((element) => {
    [
      'contenteditable',
      'role',
      'tabindex',
      'aria-label',
      'data-editing',
      'data-copy-state',
      'data-active-column',
      'data-placeholder',
      'data-credential-project-empty',
    ].forEach((attribute) => element.removeAttribute(attribute))
  })
  clone.querySelectorAll('table[data-notebook-block="credential"][style]').forEach((table) => {
    table.removeAttribute('style')
  })
  return sanitizeNotebookHtml(clone.innerHTML)
}

function emitContent() {
  if (applyingModel) return
  emit('update:modelValue', serializeContent())
}

function createLink(url: string, label = url) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.target = '_blank'
  anchor.rel = 'noreferrer noopener'
  anchor.textContent = label
  return anchor
}

function selectionBelongsToEditor(range: Range | null) {
  const root = editor.value
  return Boolean(
    root
    && range
    && root.contains(range.startContainer)
    && root.contains(range.endContainer),
  )
}

function captureSelection() {
  const root = editor.value
  const focused = document.activeElement
  if (!root || (focused !== root && !root.contains(focused))) return
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  if (selectionBelongsToEditor(range)) savedSelection = range.cloneRange()
}

function captureSelectionBeforeFocusLeaves(event: PointerEvent) {
  const root = editor.value
  const target = event.target instanceof Node ? event.target : null

  if (!root || (target && root.contains(target))) {
    suppressSelectionCapture = false
    return
  }

  captureSelection()
  suppressSelectionCapture = true
  if (selectionGuardTimer) globalThis.clearTimeout(selectionGuardTimer)
  selectionGuardTimer = globalThis.setTimeout(() => {
    suppressSelectionCapture = false
    selectionGuardTimer = null
  }, 0)
}

function handleDocumentSelectionChange() {
  if (!suppressSelectionCapture) captureSelection()
}

function restoreSelection() {
  const root = editor.value
  const selection = window.getSelection()
  if (!root || !selection) return null

  const activeRange = selection.rangeCount ? selection.getRangeAt(0) : null
  const range = selectionBelongsToEditor(savedSelection)
    ? savedSelection!.cloneRange()
    : selectionBelongsToEditor(activeRange)
      ? activeRange!.cloneRange()
      : document.createRange()
  if (!selectionBelongsToEditor(savedSelection) && !selectionBelongsToEditor(activeRange)) {
    range.selectNodeContents(root)
    range.collapse(false)
  }

  root.focus()
  selection.removeAllRanges()
  selection.addRange(range)
  return range
}

function selectedLinkContext() {
  const selection = window.getSelection()
  const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : null
  const range = selectionBelongsToEditor(savedSelection)
    ? savedSelection!.cloneRange()
    : selectionBelongsToEditor(activeRange)
      ? activeRange!.cloneRange()
      : null
  const text = range?.toString().trim() ?? ''
  if (!range || range.collapsed || !text) {
    notifications.push('请先选择需要设置为链接的文字', 'warning')
    return null
  }
  return {
    text,
    suggestedUrl: safeNotebookHttpUrl(text),
  }
}

function applyLinkToSelection(url: string) {
  const root = editor.value
  const safeUrl = safeNotebookHttpUrl(url)
  if (!root || !safeUrl) {
    notifications.push('请输入以 http:// 或 https:// 开头的有效网址', 'warning')
    return false
  }

  const selection = window.getSelection()
  const activeRange = selection?.rangeCount ? selection.getRangeAt(0) : null
  const range = selectionBelongsToEditor(savedSelection)
    ? savedSelection!.cloneRange()
    : selectionBelongsToEditor(activeRange)
      ? activeRange!.cloneRange()
      : null
  const label = range?.toString().trim() ?? ''
  if (!selection || !range || range.collapsed || !label) {
    notifications.push('原有文字选择已失效，请重新选择后再试', 'warning')
    return false
  }

  const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement
  const existingLink = startElement?.closest<HTMLAnchorElement>('a[href]')
  if (existingLink && root.contains(existingLink) && existingLink.contains(range.endContainer)) {
    existingLink.href = safeUrl
    existingLink.target = '_blank'
    existingLink.rel = 'noreferrer noopener'
    range.selectNodeContents(existingLink)
  } else {
    const link = createLink(safeUrl, label)
    range.deleteContents()
    range.insertNode(link)
    range.selectNodeContents(link)
  }

  root.focus()
  selection.removeAllRanges()
  selection.addRange(range)
  savedSelection = range.cloneRange()
  emitContent()
  notifications.push('已设置为网页链接，按住 Command 单击可打开', 'success')
  return true
}

function insertHtmlAtCaret(html: string) {
  const root = editor.value
  if (!root) return []
  const range = restoreSelection()
  const activeSelection = window.getSelection()
  if (!activeSelection || !range) return []
  const fragment = range.createContextualFragment(html)
  const insertedNodes = Array.from(fragment.childNodes)
  const lastNode = fragment.lastChild
  range.deleteContents()
  range.insertNode(fragment)
  if (lastNode) {
    range.setStartAfter(lastNode)
    range.collapse(true)
    activeSelection.removeAllRanges()
    activeSelection.addRange(range)
    savedSelection = range.cloneRange()
  }
  return insertedNodes
}

function hasBlockContent(block: Element) {
  return Boolean(
    block.textContent?.trim()
    || block.querySelector('img, table, pre, blockquote, ul, ol'),
  )
}

function insertBlockHtmlAtCaret(html: string) {
  const root = editor.value
  if (!root) return []
  const range = restoreSelection()
  const activeSelection = window.getSelection()
  if (!activeSelection || !range) return []

  if (!range.collapsed) {
    range.deleteContents()
    range.collapse(true)
  }

  const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer as Element
    : range.startContainer.parentElement
  let block = startElement
  while (block && block.parentElement !== root) block = block.parentElement

  if (
    !(block instanceof HTMLElement)
    || !['P', 'DIV', 'H2', 'H3', 'BLOCKQUOTE', 'PRE'].includes(block.tagName)
  ) return insertHtmlAtCaret(html)
  const currentBlock = block

  const tailRange = document.createRange()
  tailRange.selectNodeContents(currentBlock)
  tailRange.setStart(range.startContainer, range.startOffset)
  const tailBlock = currentBlock.cloneNode(false) as HTMLElement
  tailBlock.append(tailRange.extractContents())

  const parserRange = document.createRange()
  parserRange.selectNodeContents(root)
  const fragment = parserRange.createContextualFragment(html)
  const insertedNodes = Array.from(fragment.childNodes)
  const lastNode = fragment.lastChild
  const marker = document.createComment('notebook-block-insertion')

  currentBlock.after(marker)
  marker.before(fragment)
  if (hasBlockContent(tailBlock)) marker.before(tailBlock)
  marker.remove()
  if (!hasBlockContent(currentBlock)) currentBlock.remove()

  if (lastNode?.parentNode) {
    range.setStartAfter(lastNode)
    range.collapse(true)
    activeSelection.removeAllRanges()
    activeSelection.addRange(range)
    savedSelection = range.cloneRange()
  }
  return insertedNodes
}

async function resolveEditorImages() {
  const root = editor.value
  if (!root) return
  await Promise.all(Array.from(root.querySelectorAll<HTMLImageElement>('img')).map(async (image) => {
    const path = notebookImagePath(image.getAttribute('src') ?? '')
    if (!path) return
    try {
      image.src = await resolveNotebookAssetUrl(path)
    } catch {
      image.src = path
    }
  }))
}

function markActiveColumn(table: HTMLTableElement, column: number) {
  const fields = Array.from(table.querySelectorAll<HTMLTableCellElement>('th[data-credential-field]'))
  if (!fields.length) return
  activeColumn.value = Math.max(0, Math.min(column, fields.length - 1))
  table.querySelectorAll('[data-active-column]').forEach((element) => element.removeAttribute('data-active-column'))
  fields[activeColumn.value]?.setAttribute('data-active-column', '')
  Array.from(table.tBodies[0]?.rows ?? []).forEach((row) => {
    row.cells[activeColumn.value]?.setAttribute('data-active-column', '')
  })
}

function isCredentialEditable(element: HTMLElement | null) {
  return Boolean(element?.matches(
    '[data-credential-project], [data-credential-field], [data-credential-value]',
  ))
}

function isTrailingEmptyNode(node: ChildNode) {
  if (node.nodeType === Node.TEXT_NODE) return !node.textContent?.trim()
  if (!(node instanceof HTMLElement)) return false
  if (node.tagName === 'BR') return true
  return ['DIV', 'P'].includes(node.tagName)
    && !node.textContent?.trim()
    && !node.querySelector('img, table, pre, blockquote, ul, ol')
}

function credentialEditableText(element: HTMLElement) {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-credential-runtime-controls]').forEach((control) => control.remove())
  return clone.textContent?.trim() ?? ''
}

function removeCredentialEditableContent(element: HTMLElement) {
  Array.from(element.childNodes).forEach((node) => {
    if (node instanceof Element && node.matches('[data-credential-runtime-controls]')) return
    node.remove()
  })
}

function syncCredentialProjectEmptyState(element: HTMLElement) {
  if (!element.matches('[data-credential-project]')) return
  element.dataset.credentialProjectEmpty = String(!credentialEditableText(element))
}

function normalizeCredentialEditable(element: HTMLElement, trimTrailing = false) {
  if (!isCredentialEditable(element)) return
  if (!credentialEditableText(element)) {
    removeCredentialEditableContent(element)
    syncCredentialProjectEmptyState(element)
    return
  }
  if (trimTrailing) {
    const runtimeControls = element.querySelector(':scope > [data-credential-runtime-controls]')
    let tail = runtimeControls?.previousSibling ?? element.lastChild
    while (tail && isTrailingEmptyNode(tail)) {
      const previous = tail.previousSibling
      tail.remove()
      tail = previous
    }
  }
  syncCredentialProjectEmptyState(element)
}

function configureCredentialTable(table: HTMLTableElement, editing = table.dataset.editing === 'true') {
  table.dataset.editing = String(editing)
  table.contentEditable = 'false'
  const project = table.querySelector<HTMLTableCellElement>('th[data-credential-project]')
  const fieldRow = table.tHead?.rows[1]
  if (!table.querySelector('th[data-credential-field]')) {
    Array.from(fieldRow?.cells ?? []).forEach((field) => field.setAttribute('data-credential-field', ''))
  }
  const fields = Array.from(table.querySelectorAll<HTMLTableCellElement>('th[data-credential-field]'))
  const fieldCount = Math.max(1, fields.length)
  if (project && credentialEditableText(project) === '点击填写项目名称') {
    removeCredentialEditableContent(project)
  }
  project?.setAttribute('colspan', String(fieldCount))
  if (project) {
    project.contentEditable = String(editing)
    if (editing) project.dataset.placeholder = '点击填写项目名称'
    else project.removeAttribute('data-placeholder')
    syncCredentialProjectEmptyState(project)
  }
  table.style.setProperty('--credential-columns', String(fieldCount))
  const rows = Array.from(table.tBodies[0]?.rows ?? [])
  const projectName = project ? credentialEditableText(project) || '当前项目' : '当前项目'

  fields.forEach((field, index) => {
    field.contentEditable = String(editing)
    field.removeAttribute('data-active-column')
    field.dataset.placeholder = `字段 ${index + 1}`
    if (editing) {
      field.setAttribute('aria-label', `编辑第 ${index + 1} 个字段名称`)
    } else {
      field.removeAttribute('aria-label')
    }
  })

  table.querySelectorAll<HTMLTableCellElement>('td[data-credential-value]').forEach((cell) => {
    const columnNumber = Math.max(0, Array.from(cell.parentElement?.children ?? []).indexOf(cell))
    const fieldName = fields[columnNumber]?.textContent?.trim() || `字段 ${columnNumber + 1}`
    const legacyPlaceholders = new Set([`点击填写${fieldName}`, '点击填写内容'])
    if (legacyPlaceholders.has(cell.textContent?.trim() ?? '')) cell.textContent = ''
    cell.contentEditable = String(editing)
    cell.removeAttribute('data-copy-state')
    cell.removeAttribute('data-active-column')
    if (editing) {
      cell.dataset.placeholder = `点击填写${fieldName}`
      cell.removeAttribute('role')
      cell.removeAttribute('tabindex')
      cell.removeAttribute('aria-label')
      return
    }
    cell.removeAttribute('data-placeholder')
    const rowNumber = Math.max(1, rows.indexOf(cell.closest('tr') as HTMLTableRowElement) + 1)
    cell.setAttribute('role', 'button')
    cell.setAttribute('tabindex', '0')
    cell.setAttribute('aria-label', `复制${projectName}第 ${rowNumber} 条记录的${fieldName}`)
  })
  if (editing) markActiveColumn(table, activeColumn.value)
}

function hydrateCredentialBlocks() {
  editor.value?.querySelectorAll<HTMLTableElement>('table[data-notebook-block="credential"]').forEach((table) => {
    configureCredentialTable(table)
  })
  void nextTick(refreshCredentialControls)
}

function refreshCredentialControls() {
  const root = editor.value
  if (!root) {
    credentialControls.value = []
    return
  }
  credentialControls.value = Array.from(
    root.querySelectorAll<HTMLTableElement>('table[data-notebook-block="credential"]'),
  ).flatMap((table, index) => {
    const target = table.querySelector<HTMLTableCellElement>('th[data-credential-project]')
    if (!target) return []
    let key = credentialControlKeys.get(table)
    if (!key) {
      credentialControlKey += 1
      key = credentialControlKey
      credentialControlKeys.set(table, key)
    }
    return [{
      table,
      target,
      key,
      index,
      editing: table.dataset.editing === 'true',
    }]
  })
}

function activateCredentialTable(table: HTMLTableElement) {
  activeTable.value = table
}

function clearActiveCredentialTable() {
  activeTable.value = null
  activeRow.value = null
}

function setCredentialEditingFor(
  table: HTMLTableElement,
  editing: boolean,
  restoreEditorFocus = true,
) {
  const root = editor.value
  if (!root || !root.contains(table)) return
  if (editing) {
    root.querySelectorAll<HTMLTableElement>(
      'table[data-notebook-block="credential"][data-editing="true"]',
    ).forEach((current) => {
      if (current === table) return
      current.querySelectorAll<HTMLElement>(
        '[data-credential-project], [data-credential-field], [data-credential-value]',
      ).forEach((element) => normalizeCredentialEditable(element, true))
      configureCredentialTable(current, false)
    })
  } else {
    table.querySelectorAll<HTMLElement>(
      '[data-credential-project], [data-credential-field], [data-credential-value]',
    ).forEach((element) => normalizeCredentialEditable(element, true))
  }
  activateCredentialTable(table)
  configureCredentialTable(table, editing)
  void nextTick(refreshCredentialControls)
  if (!editing) {
    emitContent()
    if (restoreEditorFocus) editor.value?.focus()
    return
  }
  const firstValue = table.querySelector<HTMLTableCellElement>('td[data-credential-value]')
  if (!firstValue) return
  activeRow.value = firstValue.closest('tr')
  activeColumn.value = 0
  markActiveColumn(table, 0)
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(firstValue)
  range.collapse(false)
  selection?.removeAllRanges()
  selection?.addRange(range)
  firstValue.focus()
}

function setCredentialEditing(editing: boolean, restoreEditorFocus = true) {
  const table = activeTable.value
  if (!table) return
  setCredentialEditingFor(table, editing, restoreEditorFocus)
}

function runCredentialAction(table: HTMLTableElement, action: () => void) {
  activateCredentialTable(table)
  action()
  void nextTick(refreshCredentialControls)
}

function finishCredentialEditing() {
  const root = editor.value
  if (!root) return false
  const editingTable = activeTable.value?.dataset.editing === 'true'
    ? activeTable.value
    : root.querySelector<HTMLTableElement>('table[data-notebook-block="credential"][data-editing="true"]')
  if (!editingTable) return false
  activeTable.value = editingTable
  setCredentialEditing(false, false)
  clearActiveCredentialTable()
  void nextTick(refreshCredentialControls)
  return true
}

function insertCredential() {
  const root = editor.value
  if (!root) return
  const insertedNodes = insertBlockHtmlAtCaret(credentialTemplateHtml())
  const table = insertedNodes.reduce<HTMLTableElement | null>((result, node) => {
    if (result) return result
    if (node instanceof HTMLTableElement) return node
    return node instanceof Element
      ? node.querySelector<HTMLTableElement>('table[data-notebook-block="credential"]')
      : null
  }, null)
  if (table) {
    activeColumn.value = 0
    setCredentialEditingFor(table, true)
  }
  emitContent()
  notifications.push('已插入凭据信息表，可自由调整字段与记录', 'success')
}

function addCredentialRow() {
  const table = activeTable.value
  const body = table?.tBodies[0]
  if (!table || !body || table.dataset.editing !== 'true') return
  const row = body.insertRow()
  const fields = Array.from(table.querySelectorAll<HTMLTableCellElement>('th[data-credential-field]'))
  fields.forEach((field, index) => {
    const cell = row.insertCell()
    cell.setAttribute('data-credential-value', '')
    cell.dataset.placeholder = `点击填写${field.textContent?.trim() || `字段 ${index + 1}`}`
  })
  activeRow.value = row
  configureCredentialTable(table, true)
  row.cells[0]?.focus()
  emitContent()
  void nextTick(refreshCredentialControls)
}

function removeCredentialRow() {
  const table = activeTable.value
  const body = table?.tBodies[0]
  if (!table || !body || table.dataset.editing !== 'true') return
  const rows = Array.from(body.rows)
  if (rows.length <= 1) {
    notifications.push('凭据信息表至少保留一条记录', 'warning')
    return
  }
  const target = activeRow.value && table.contains(activeRow.value) ? activeRow.value : rows[rows.length - 1]
  const index = rows.indexOf(target)
  activeRow.value = rows[index + 1] ?? rows[index - 1] ?? null
  target.remove()
  configureCredentialTable(table, true)
  emitContent()
}

function addCredentialField() {
  const table = activeTable.value
  const fieldRow = table?.tHead?.rows[1]
  const body = table?.tBodies[0]
  if (!table || !fieldRow || !body || table.dataset.editing !== 'true') return
  const field = document.createElement('th')
  field.setAttribute('data-credential-field', '')
  field.textContent = ''
  field.dataset.placeholder = `字段 ${fieldRow.cells.length + 1}`
  fieldRow.append(field)
  Array.from(body.rows).forEach((row) => {
    const cell = row.insertCell()
    cell.setAttribute('data-credential-value', '')
    cell.dataset.placeholder = `点击填写字段 ${fieldRow.cells.length}`
  })
  activeColumn.value = fieldRow.cells.length - 1
  configureCredentialTable(table, true)
  field.focus()
  emitContent()
  void nextTick(refreshCredentialControls)
}

function removeCredentialField() {
  const table = activeTable.value
  if (!table || table.dataset.editing !== 'true') return
  const fields = Array.from(table.querySelectorAll<HTMLTableCellElement>('th[data-credential-field]'))
  if (fields.length <= 1) {
    notifications.push('凭据信息表至少保留一个字段', 'warning')
    return
  }
  const column = Math.max(0, Math.min(activeColumn.value, fields.length - 1))
  fields[column].remove()
  Array.from(table.tBodies[0]?.rows ?? []).forEach((row) => row.cells[column]?.remove())
  activeColumn.value = Math.max(0, column - 1)
  configureCredentialTable(table, true)
  emitContent()
}

async function copyCredentialValue(cell: HTMLTableCellElement) {
  const value = cell.innerText.trim()
  if (!value) {
    notifications.push('当前字段没有可复制内容', 'warning')
    return
  }
  try {
    await navigator.clipboard.writeText(value)
    cell.dataset.copyState = 'done'
    if (copyTimer) globalThis.clearTimeout(copyTimer)
    copyTimer = globalThis.setTimeout(() => cell.removeAttribute('data-copy-state'), 1200)
    notifications.push('已复制此项', 'success')
  } catch {
    notifications.push('未能访问剪贴板，请检查系统权限', 'error')
  }
}

function insertTab() {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return
  const range = selection.getRangeAt(0)
  const tab = document.createTextNode('\t')
  range.deleteContents()
  range.insertNode(tab)
  range.setStartAfter(tab)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
  emitContent()
}

function alignSelection() {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !editor.value?.contains(selection.anchorNode)) return
  const text = selection.toString()
  if (!text.trim()) {
    notifications.push('请先选择需要对齐的文本', 'warning')
    return
  }
  const rows = text.split('\n').map((line) => line.split(/\t| {2,}/).map((part) => part.trim()).filter(Boolean))
  const normalized = rows.some((row) => row.length > 1)
    ? rows
    : text.split('\n').map((line) => line.split(/\s+/).filter(Boolean))
  const replacement = document.createTextNode(normalized.map((row) => row.join('\t')).join('\n'))
  const range = selection.getRangeAt(0)
  range.deleteContents()
  range.insertNode(replacement)
  range.selectNodeContents(replacement)
  selection.removeAllRanges()
  selection.addRange(range)
  emitContent()
}

function normalizeDocument() {
  const root = editor.value
  if (!root) return
  const clone = root.cloneNode(true) as HTMLElement
  clone.querySelectorAll('[data-credential-runtime-controls]').forEach((element) => element.remove())
  const normalized = sanitizeNotebookHtml(clone.innerHTML)
  root.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(root)
  selection?.removeAllRanges()
  selection?.addRange(range)
  const inserted = document.execCommand('insertHTML', false, normalized)
  if (!inserted) root.innerHTML = normalized
  hydrateCredentialBlocks()
  void resolveEditorImages()
  emitContent()
  notifications.push('已统一整篇笔记格式', 'success')
}

async function copyDocument() {
  const clone = editor.value?.cloneNode(true) as HTMLElement | undefined
  clone?.querySelectorAll('[data-credential-runtime-controls]').forEach((element) => element.remove())
  const text = clone?.innerText.trim() ?? ''
  if (!text) {
    notifications.push('当前笔记没有可复制内容', 'warning')
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    notifications.push('已复制笔记正文', 'success')
  } catch {
    notifications.push('未能访问剪贴板，请检查系统权限', 'error')
  }
}

async function handlePaste(event: ClipboardEvent) {
  const clipboard = event.clipboardData
  if (!clipboard) return
  const imageItem = Array.from(clipboard.items).find((item) => item.kind === 'file' && item.type.startsWith('image/'))
  if (imageItem) {
    event.preventDefault()
    const file = imageItem.getAsFile()
    if (!file) return
    try {
      const result = await uploadNotebookImage(file)
      const image = document.createElement('img')
      image.src = await resolveNotebookAssetUrl(result.url)
      image.alt = file.name.slice(0, 160)
      insertHtmlAtCaret(`<p>${image.outerHTML}</p><p><br></p>`)
      emitContent()
      notifications.push('图片已保存到本机', 'success')
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : '图片上传失败', 'error')
    }
    return
  }

  const html = clipboard.getData('text/html')
  const text = clipboard.getData('text/plain')
  if (!html && !text) return
  event.preventDefault()
  insertHtmlAtCaret(html ? sanitizeNotebookHtml(html) : plainTextToNotebookHtml(text))
  hydrateCredentialBlocks()
  emitContent()
  notifications.push('已按笔记样式粘贴', 'success')
}

function handleInput(event: Event) {
  const target = event.target instanceof HTMLElement ? event.target : null
  const input = event instanceof InputEvent ? event : null
  if (composingCredential || input?.isComposing) return
  if (target && isCredentialEditable(target)) {
    normalizeCredentialEditable(target, Boolean(input?.inputType.startsWith('delete')))
    void nextTick(refreshCredentialControls)
  }
  emitContent()
}

function handleCompositionStart(event: CompositionEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null
  if (isCredentialEditable(target)) composingCredential = true
}

function handleCompositionEnd(event: CompositionEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null
  if (!isCredentialEditable(target)) return
  composingCredential = false
  normalizeCredentialEditable(target!)
  emitContent()
  void nextTick(refreshCredentialControls)
}

function handleFocusOut(event: FocusEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null
  if (!target || !isCredentialEditable(target)) return
  normalizeCredentialEditable(target, true)
  emitContent()
  void nextTick(refreshCredentialControls)
}

async function handleClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null
  const link = target?.closest<HTMLAnchorElement>('a[href]')
  if (link && editor.value?.contains(link)) {
    event.preventDefault()
    if (event.metaKey || event.ctrlKey) {
      const url = safeNotebookHttpUrl(link.href)
      if (url) await tauriClient.openExternalUrl(url)
    }
    return
  }
  const cell = target?.closest<HTMLTableCellElement>('td[data-credential-value]')
  const table = cell?.closest<HTMLTableElement>('table[data-notebook-block="credential"]')
  if (cell && table?.dataset.editing !== 'true') {
    event.preventDefault()
    await copyCredentialValue(cell)
  } else if (cell && table) {
    activeRow.value = cell.closest('tr')
    activeColumn.value = Array.from(cell.parentElement?.children ?? []).indexOf(cell)
    markActiveColumn(table, activeColumn.value)
    activateCredentialTable(table)
  }
}

function handleFocusIn(event: FocusEvent) {
  captureSelection()
  const target = event.target instanceof Element ? event.target : null
  const table = target?.closest<HTMLTableElement>('table[data-notebook-block="credential"][data-editing="true"]')
  if (!table) return
  const row = target?.closest<HTMLTableRowElement>('tbody tr')
  const field = target?.closest<HTMLTableCellElement>('th[data-credential-field]')
  const cell = target?.closest<HTMLTableCellElement>('td[data-credential-value]')
  if (row) activeRow.value = row
  const selected = field ?? cell
  if (selected) {
    activeColumn.value = Array.from(selected.parentElement?.children ?? []).indexOf(selected)
    markActiveColumn(table, activeColumn.value)
  }
  activateCredentialTable(table)
}

function handleKeydown(event: KeyboardEvent) {
  const root = editor.value
  if (!root || !root.contains(document.activeElement)) return
  if (composingCredential || event.isComposing) return
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'l') {
    event.preventDefault()
    alignSelection()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'c') {
    const target = event.target instanceof Element ? event.target : null
    const value = target?.closest<HTMLTableCellElement>('td[data-credential-value]')
    if (value) {
      event.preventDefault()
      void copyCredentialValue(value)
      return
    }
  }
  if (event.key === 'Tab') {
    event.preventDefault()
    insertTab()
    return
  }
  const target = event.target instanceof Element ? event.target : null
  const cell = target?.closest<HTMLTableCellElement>('td[data-credential-value]')
  const table = cell?.closest<HTMLTableElement>('table[data-notebook-block="credential"]')
  if (cell && table?.dataset.editing !== 'true' && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    void copyCredentialValue(cell)
    return
  }
}

async function applyModelValue(value: string) {
  const root = editor.value
  if (!root) return
  const safe = sanitizeNotebookHtml(value)
  if (serializeContent() === safe) return
  applyingModel = true
  root.innerHTML = safe
  hydrateCredentialBlocks()
  await resolveEditorImages()
  applyingModel = false
}

watch(() => [props.noteId, props.modelValue] as const, ([, value]) => {
  if (selectionNoteId !== props.noteId) {
    selectionNoteId = props.noteId
    savedSelection = null
  }
  void nextTick(() => applyModelValue(value))
}, { immediate: true })

onMounted(() => {
  document.addEventListener('pointerdown', captureSelectionBeforeFocusLeaves, true)
  document.addEventListener('selectionchange', handleDocumentSelectionChange)
  void nextTick(refreshCredentialControls)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', captureSelectionBeforeFocusLeaves, true)
  document.removeEventListener('selectionchange', handleDocumentSelectionChange)
  savedSelection = null
  if (selectionGuardTimer) globalThis.clearTimeout(selectionGuardTimer)
  if (copyTimer) globalThis.clearTimeout(copyTimer)
})

defineExpose({
  captureSelection,
  alignSelection,
  selectedLinkContext,
  applyLinkToSelection,
  finishCredentialEditing,
  normalizeDocument,
  insertCredential,
  copyDocument,
})
</script>

<template>
  <div class="notebook-rich-editor">
    <article
      ref="editor"
      class="notebook-rich-editor__content"
      contenteditable="true"
      data-placeholder="从这里开始记录…"
      spellcheck="false"
      @input="handleInput"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd"
      @keyup="captureSelection"
      @pointerup="captureSelection"
      @paste="handlePaste"
      @click="handleClick"
      @focusin="handleFocusIn"
      @focusout="handleFocusOut"
      @keydown="handleKeydown"
    />
    <Teleport
      v-for="control in credentialControls"
      :key="control.key"
      :to="control.target"
    >
      <div
        class="notebook-credential-toolbar"
        :class="{ 'is-editing': control.editing }"
        :data-credential-control-index="control.index"
        data-credential-runtime-controls
        contenteditable="false"
        role="toolbar"
        :aria-label="`凭据信息表 ${control.index + 1} 操作`"
        @pointerdown.prevent.stop
        @click.stop
      >
        <BaseButton
          v-if="control.editing"
          variant="ghost"
          size="sm"
          aria-label="删除当前记录"
          @click="runCredentialAction(control.table, removeCredentialRow)"
        >− 记录</BaseButton>
        <BaseButton
          v-if="control.editing"
          variant="ghost"
          size="sm"
          aria-label="新增记录"
          @click="runCredentialAction(control.table, addCredentialRow)"
        >＋ 记录</BaseButton>
        <BaseButton
          v-if="control.editing"
          variant="ghost"
          size="sm"
          aria-label="删除当前字段"
          @click="runCredentialAction(control.table, removeCredentialField)"
        >− 字段</BaseButton>
        <BaseButton
          v-if="control.editing"
          variant="ghost"
          size="sm"
          aria-label="新增字段"
          @click="runCredentialAction(control.table, addCredentialField)"
        >＋ 字段</BaseButton>
        <BaseButton
          class="notebook-credential-toolbar__mode"
          variant="secondary"
          size="sm"
          :aria-label="control.editing ? '完成' : '编辑'"
          :title="control.editing ? '完成' : '编辑凭据信息表'"
          @click="setCredentialEditingFor(control.table, !control.editing)"
        >
          <span v-if="control.editing">完成</span>
          <svg
            v-else
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </BaseButton>
      </div>
    </Teleport>
  </div>
</template>
