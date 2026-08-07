import { computed, ref, shallowRef } from 'vue'

import {
  getFileZillaServers,
  importFileZillaServers,
  parseFileZillaXml,
  type FileZillaServer,
} from '@/services/modules/deploy-service'

export type FileZillaItemState = 'imported' | 'will-remove' | 'pending' | 'none'

export function useFileZillaImport() {
  const open = ref(false)
  const loading = ref(false)
  const importing = ref(false)
  const sourceLabel = ref('')
  const fileName = ref('')
  const items = shallowRef<FileZillaServer[]>([])
  const checked = ref<Set<string>>(new Set())
  /** 用户手选的 XML 内容；为空时后端自行定位本机配置。 */
  const xmlContent = ref('')

  const toAdd = computed(() => items.value.filter(s => !s.exists && checked.value.has(s.name)).length)
  const toRemove = computed(() => items.value.filter(s => s.exists && !checked.value.has(s.name)).length)

  const summary = computed(() => {
    const parts: string[] = []
    if (toAdd.value) parts.push(`新增 ${toAdd.value}`)
    if (toRemove.value) parts.push(`删除 ${toRemove.value}`)
    return parts.length ? parts.join('，') : `已选 ${checked.value.size} 个`
  })

  /** 默认勾选已导入项，使「不勾选 = 意图移除」的三态语义成立。 */
  function resetChecked() {
    checked.value = new Set(items.value.filter(s => s.exists).map(s => s.name))
  }

  function stateOf(server: FileZillaServer): FileZillaItemState {
    const isChecked = checked.value.has(server.name)
    if (server.exists) return isChecked ? 'imported' : 'will-remove'
    return isChecked ? 'pending' : 'none'
  }

  async function show() {
    open.value = true
    loading.value = true
    fileName.value = ''
    xmlContent.value = ''
    items.value = []
    checked.value = new Set()
    try {
      const source = await getFileZillaServers()
      items.value = source.servers
      sourceLabel.value = source.path ? `默认配置: ${source.path}` : '未找到默认配置，请选择 FileZilla 导出的 XML 文件'
    } catch {
      items.value = []
      sourceLabel.value = '未找到默认配置，请选择 FileZilla 导出的 XML 文件'
    } finally {
      resetChecked()
      loading.value = false
    }
  }

  async function loadFromXml(name: string, content: string) {
    fileName.value = name
    xmlContent.value = content
    loading.value = true
    try {
      items.value = await parseFileZillaXml(content)
      sourceLabel.value = `已加载: ${name}`
    } finally {
      resetChecked()
      loading.value = false
    }
  }

  function toggle(name: string) {
    const next = new Set(checked.value)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    checked.value = next
  }

  function toggleAll(select: boolean) {
    checked.value = select ? new Set(items.value.map(s => s.name)) : new Set()
  }

  async function submit() {
    importing.value = true
    try {
      return await importFileZillaServers([...checked.value], xmlContent.value || undefined)
    } finally {
      importing.value = false
    }
  }

  return {
    open,
    loading,
    importing,
    sourceLabel,
    fileName,
    items,
    checked,
    summary,
    show,
    loadFromXml,
    toggle,
    toggleAll,
    stateOf,
    submit,
  }
}
