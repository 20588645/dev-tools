import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'

import { lookupIp, type IpCheckResult } from '@/services/modules/ipcheck-service'

const IPV4_PATTERN = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/
const DOMAIN_PATTERN = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+\.?$/

function isIpv4(value: string) {
  return IPV4_PATTERN.test(value)
}

function isIpv6(value: string) {
  if (!value.includes(':') || !/^[0-9a-fA-F:.]+$/.test(value)) return false
  if ((value.match(/::/g) || []).length > 1) return false

  const [head = '', tail = ''] = value.split('::')
  const groups = [...(head ? head.split(':') : []), ...(tail ? tail.split(':') : [])]
  if (groups.some((group) => !group || (!/^[0-9a-fA-F]{1,4}$/.test(group) && !isIpv4(group)))) return false

  const groupCount = groups.reduce((count, group) => count + (isIpv4(group) ? 2 : 1), 0)
  return value.includes('::') ? groupCount < 8 : groupCount === 8
}

export function validateIpTarget(value: string) {
  const target = value.trim()
  if (!target) return '请输入 IPv4、IPv6 或域名'
  if (isIpv4(target) || isIpv6(target)) return ''
  if (/^[\d.]+$/.test(target)) return '请输入有效的 IPv4、IPv6 或域名'
  if (DOMAIN_PATTERN.test(target)) return ''
  return '请输入有效的 IPv4、IPv6 或域名'
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason || '查询失败，请稍后重试')
}

export function useIpCheck() {
  const query = ref('')
  const result = ref<IpCheckResult | null>(null)
  const loading = ref(false)
  const error = ref('')
  const validationError = ref('')
  const lastUpdatedAt = ref<Date | null>(null)
  const lastTarget = ref('')
  let controller: AbortController | null = null
  let requestVersion = 0
  let initialized = false

  const updatedLabel = computed(() => {
    if (!lastUpdatedAt.value) return ''
    return lastUpdatedAt.value.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  })

  const cancel = () => {
    controller?.abort()
    controller = null
    loading.value = false
  }

  const execute = async (target: string) => {
    const version = ++requestVersion
    controller?.abort()
    controller = new AbortController()
    loading.value = true
    error.value = ''
    validationError.value = ''
    lastTarget.value = target

    try {
      const value = await lookupIp(target, controller.signal)
      if (version !== requestVersion) return
      result.value = value
      lastUpdatedAt.value = new Date()
    } catch (reason) {
      if (version !== requestVersion || controller.signal.aborted) return
      error.value = errorMessage(reason)
    } finally {
      if (version === requestVersion) {
        loading.value = false
        controller = null
      }
    }
  }

  const queryTarget = async () => {
    const target = query.value.trim()
    const message = validateIpTarget(target)
    if (message) {
      validationError.value = message
      return
    }
    await execute(target)
  }

  const queryCurrent = async () => {
    query.value = ''
    validationError.value = ''
    await execute('')
  }

  const retry = () => execute(lastTarget.value)

  const clearQuery = () => {
    query.value = ''
    validationError.value = ''
  }

  const ensureInitialLookup = () => {
    if (initialized || result.value || loading.value || error.value) return
    initialized = true
    void queryCurrent()
  }

  onMounted(ensureInitialLookup)
  onActivated(ensureInitialLookup)
  onDeactivated(cancel)
  onBeforeUnmount(cancel)

  return {
    query,
    result,
    loading,
    error,
    validationError,
    updatedLabel,
    queryTarget,
    queryCurrent,
    retry,
    clearQuery,
  }
}
