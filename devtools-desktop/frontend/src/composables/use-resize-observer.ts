import { onBeforeUnmount, onMounted, ref, type MaybeRefOrGetter, toValue } from 'vue'

export function useResizeObserver(target: MaybeRefOrGetter<Element | null>, callback: ResizeObserverCallback) {
  const supported = ref(typeof ResizeObserver !== 'undefined')
  let observer: ResizeObserver | null = null

  onMounted(() => {
    const element = toValue(target)
    if (!element || !supported.value) return
    observer = new ResizeObserver(callback)
    observer.observe(element)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { supported }
}
