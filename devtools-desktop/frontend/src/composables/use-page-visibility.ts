import { onBeforeUnmount, onMounted, ref } from 'vue'

export function usePageVisibility() {
  const visible = ref(typeof document === 'undefined' || document.visibilityState === 'visible')

  const update = () => {
    visible.value = document.visibilityState === 'visible'
  }

  onMounted(() => document.addEventListener('visibilitychange', update))
  onBeforeUnmount(() => document.removeEventListener('visibilitychange', update))

  return { visible }
}
