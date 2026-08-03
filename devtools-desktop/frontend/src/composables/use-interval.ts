import { onBeforeUnmount, onMounted, ref } from 'vue'

interface UseIntervalOptions {
  autoStart?: boolean
}

export function useInterval(
  callback: () => void | Promise<void>,
  delay: number | (() => number | null),
  options: UseIntervalOptions = {},
) {
  const running = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  const clear = () => {
    if (timer) globalThis.clearInterval(timer)
    timer = null
    running.value = false
  }

  const start = () => {
    clear()
    const duration = typeof delay === 'function' ? delay() : delay
    if (!duration || duration <= 0) return
    timer = globalThis.setInterval(() => void callback(), duration)
    running.value = true
  }

  onMounted(() => {
    if (options.autoStart ?? true) start()
  })
  onBeforeUnmount(clear)

  return { running, start, clear }
}
