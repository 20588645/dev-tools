import { onBeforeUnmount, onMounted } from 'vue'

export function useEventListener<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions,
) {
  onMounted(() => target.addEventListener(type, listener as EventListener, options))
  onBeforeUnmount(() => target.removeEventListener(type, listener as EventListener, options))
}
