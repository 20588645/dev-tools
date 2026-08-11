<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

import { getTerminalRuntime } from '@/services/terminal-runtime-service'

/**
 * xterm 宿主容器：仅提供 DOM 挂载点。
 * 活实例由 terminal-runtime-service 持有；本组件卸载/KeepAlive 停用时不 dispose。
 */
const hostRef = ref<HTMLElement | null>(null)

onMounted(() => {
  getTerminalRuntime()?.setHost(hostRef.value)
})

onBeforeUnmount(() => {
  // 不 dispose；仅在宿主被真正拆掉时解除引用（runtime.stop 负责销毁）
  const runtime = getTerminalRuntime()
  if (runtime) runtime.setHost(null)
})

defineExpose({
  el: hostRef,
  rebind() {
    getTerminalRuntime()?.setHost(hostRef.value)
  },
})
</script>

<template>
  <div ref="hostRef" class="term-xterm-host" data-terminal-host />
</template>
