import { ref, type Ref } from 'vue'

export interface AsyncState<T> {
  data: Ref<T | null>
  loading: Ref<boolean>
  error: Ref<Error | null>
  execute: () => Promise<T>
  retry: () => Promise<T>
}

export function useAsyncState<T>(loader: () => Promise<T>): AsyncState<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<Error | null>(null)

  const execute = async () => {
    loading.value = true
    error.value = null
    try {
      const result = await loader()
      data.value = result
      return result
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause))
      throw error.value
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, execute, retry: execute }
}
