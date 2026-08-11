<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { getCodeMirrorApi } from '@/views/editor/editor-docs'
import { edThemeName } from '@/views/editor/editor-modes'

const emit = defineEmits<{
  ready: [cm: CodeMirrorEditor]
  change: []
  cursor: [line: number, col: number]
  destroy: []
}>()

const hostRef = ref<HTMLElement | null>(null)
let cm: CodeMirrorEditor | null = null
let themeObserver: MutationObserver | null = null

function mountCm() {
  if (!hostRef.value || cm) return
  const CM = getCodeMirrorApi()
  cm = CM(hostRef.value, {
    value: '',
    mode: null,
    theme: edThemeName(),
    lineNumbers: true,
    lineWrapping: false,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    extraKeys: {
      'Cmd-F': 'findPersistent',
      'Ctrl-F': 'findPersistent',
      'Cmd-Alt-F': 'replace',
      'Ctrl-Shift-F': 'replace',
      Tab: (editor: CodeMirrorEditor) => {
        if (editor.somethingSelected()) editor.indentSelection('add')
        else editor.replaceSelection('  ', 'end')
      },
    },
  })
  cm.on('change', onChange)
  cm.on('cursorActivity', onCursor)
  themeObserver = new MutationObserver(() => {
    cm?.setOption('theme', edThemeName())
  })
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] })
  emit('ready', cm)
}

function onChange() {
  emit('change')
}

function onCursor() {
  if (!cm) return
  const c = cm.getCursor()
  emit('cursor', c.line + 1, c.ch + 1)
}

function destroyCm() {
  themeObserver?.disconnect()
  themeObserver = null
  if (cm) {
    cm.off('change', onChange)
    cm.off('cursorActivity', onCursor)
    const wrapper = cm.getWrapperElement()
    wrapper.parentNode?.removeChild(wrapper)
    cm = null
  }
  emit('destroy')
}

function refresh() {
  if (!cm) return
  setTimeout(() => {
    cm?.refresh()
    cm?.focus()
  }, 0)
}

function swapDoc(doc: CodeMirrorDoc, mode: string | null) {
  if (!cm) return
  cm.swapDoc(doc)
  cm.setOption('mode', mode)
  refresh()
}

function getEditor() {
  return cm
}

onMounted(mountCm)
onBeforeUnmount(destroyCm)

watch(hostRef, (el) => {
  if (el && !cm) mountCm()
})

defineExpose({ refresh, swapDoc, getEditor, destroyCm })
</script>

<template>
  <div ref="hostRef" class="ed-editor-host" />
</template>
