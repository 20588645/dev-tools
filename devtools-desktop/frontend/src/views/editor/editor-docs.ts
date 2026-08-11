/**
 * CodeMirror Doc 驻留模块（非 Pinia）：Doc / changeGeneration 不可序列化，
 * 与标签元数据分离；KeepAlive 切走后仍可保留，真正 unmount 时 clear。
 */

const docs = new Map<string, CodeMirrorDoc>()
const cleanGens = new Map<string, number>()

export function getCodeMirrorApi(): CodeMirrorStatic {
  const cm = window.CodeMirror
  if (!cm) throw new Error('CodeMirror 尚未加载')
  return cm
}

export function createEditorDoc(content = '', mode: string | null = null): CodeMirrorDoc {
  const CM = getCodeMirrorApi()
  return new CM.Doc(content, mode)
}

export function setEditorDoc(key: string, doc: CodeMirrorDoc, cleanGen?: number) {
  docs.set(key, doc)
  cleanGens.set(key, cleanGen ?? doc.changeGeneration())
}

export function getEditorDoc(key: string): CodeMirrorDoc | undefined {
  return docs.get(key)
}

export function getCleanGen(key: string): number | undefined {
  return cleanGens.get(key)
}

export function markEditorDocClean(key: string) {
  const doc = docs.get(key)
  if (!doc) return
  cleanGens.set(key, doc.changeGeneration())
}

export function isEditorDocDirty(key: string): boolean {
  const doc = docs.get(key)
  if (!doc) return false
  const gen = cleanGens.get(key)
  return gen == null ? !doc.isClean() : !doc.isClean(gen)
}

export function isEditorDocContentEmpty(key: string): boolean {
  const doc = docs.get(key)
  if (!doc) return true
  return !doc.getValue().trim()
}

export function renameEditorDocKey(from: string, to: string) {
  if (from === to) return
  const doc = docs.get(from)
  if (!doc) return
  docs.delete(from)
  docs.set(to, doc)
  const gen = cleanGens.get(from)
  cleanGens.delete(from)
  if (gen != null) cleanGens.set(to, gen)
}

export function removeEditorDoc(key: string) {
  docs.delete(key)
  cleanGens.delete(key)
}

export function clearEditorDocs() {
  docs.clear()
  cleanGens.clear()
}

export function editorDocKeys(): string[] {
  return [...docs.keys()]
}
