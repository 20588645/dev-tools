import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'

import * as twofaService from '@/services/modules/twofa-service'
import type {
  TwofaAccount,
  TwofaAccountInput,
  TwofaStats,
} from '@/services/modules/twofa-service'
import { useNotificationStore } from '@/stores/notification'

interface UseTwofaOptions {
  service?: typeof twofaService
  now?: () => number
  clipboard?: Pick<Clipboard, 'writeText'>
}

const emptyStats = (): TwofaStats => ({ total: 0, favorites: 0, groups: {} })

/** 六位码按 3-3 分组、八位按 4-4，便于人眼抄写 */
export function formatTwofaCode(code: string): string {
  const raw = String(code || '')
  if (raw.length === 6) return `${raw.slice(0, 3)} ${raw.slice(3)}`
  if (raw.length === 8) return `${raw.slice(0, 4)} ${raw.slice(4)}`
  return raw
}

/** 基于 expiresAt 本地推进，避免每秒打接口；缺失时回退到 remainingSeconds */
export function twofaRemainingSeconds(account: TwofaAccount, nowMs: number): number {
  const period = account.period || 30
  if (!account.expiresAt) return Math.max(0, Math.min(period, account.remainingSeconds))
  const remaining = Math.ceil((account.expiresAt - nowMs) / 1000)
  return Math.max(0, Math.min(period, remaining))
}

export function twofaAvatarText(account: TwofaAccount): string {
  const source = account.issuer || account.accountName || '2'
  return source.trim().charAt(0).toUpperCase()
}

export function useTwofa(options: UseTwofaOptions = {}) {
  const service = options.service ?? twofaService
  const now = options.now ?? (() => Date.now())
  const notifications = useNotificationStore()

  const accounts = ref<TwofaAccount[]>([])
  const stats = ref<TwofaStats>(emptyStats())
  const query = ref('')
  const activeGroup = ref('')
  const expandedId = ref('')
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref('')
  const lastSyncAt = ref(0)
  /** 每秒自增，驱动倒计时重算而不重建列表 */
  const tick = ref(0)
  const copiedId = ref('')

  let mounted = false
  let loadVersion = 0
  let loadController: AbortController | null = null
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let copiedTimer: ReturnType<typeof setTimeout> | null = null

  const groupOptions = computed(() => {
    const groups = Object.entries(stats.value.groups)
      .filter(([, count]) => count > 0)
      .map(([name, count]) => ({ label: name, value: name, count }))
    return [{ label: '全部', value: '', count: stats.value.total }, ...groups]
  })

  const filtered = computed(() => {
    const keyword = query.value.trim().toLowerCase()
    return accounts.value.filter((account) => {
      if (activeGroup.value && account.groupName !== activeGroup.value) return false
      if (!keyword) return true
      return [account.issuer, account.accountName, account.tag, account.groupName]
        .some((field) => field.toLowerCase().includes(keyword))
    })
  })

  /** 收藏置顶为「常用」，只在未筛选时展示，避免与筛选结果冲突 */
  const pinned = computed(() => (
    query.value.trim() || activeGroup.value
      ? []
      : accounts.value.filter((account) => account.favorite)
  ))

  const groupedAccounts = computed(() => {
    const map = new Map<string, TwofaAccount[]>()
    filtered.value.forEach((account) => {
      const list = map.get(account.groupName) ?? []
      list.push(account)
      map.set(account.groupName, list)
    })
    return [...map.entries()]
      .map(([name, list]) => ({
        name,
        accounts: [...list].sort((a, b) => (a.sortOrder - b.sortOrder) || a.issuer.localeCompare(b.issuer, 'zh-CN')),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  })

  const summaryLabel = computed(() => (
    `${stats.value.total} 个账号 · ${groupOptions.value.length - 1} 组 · ${stats.value.favorites} 个收藏`
  ))

  const status = computed(() => {
    if (loading.value || refreshing.value) return { label: '正在同步', status: 'checking' as const }
    if (error.value) return { label: '读取失败', status: 'offline' as const }
    if (!lastSyncAt.value) return { label: '等待同步', status: 'idle' as const }
    return {
      label: `已同步 ${stats.value.total} 个 · ${new Date(lastSyncAt.value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
      status: 'online' as const,
    }
  })

  function remainingOf(account: TwofaAccount) {
    void tick.value
    return twofaRemainingSeconds(account, now())
  }

  async function load(silent = false) {
    const version = ++loadVersion
    loadController?.abort()
    const controller = new AbortController()
    loadController = controller
    if (silent) refreshing.value = true
    else loading.value = true
    error.value = ''
    try {
      const page = await service.getTwofaAccounts(controller.signal)
      if (version !== loadVersion) return
      accounts.value = page.accounts
      stats.value = page.stats
      lastSyncAt.value = now()
    } catch (reason) {
      if (controller.signal.aborted) return
      error.value = reason instanceof Error ? reason.message : '2FA 账号读取失败'
      if (silent) notifications.push(error.value, 'error')
    } finally {
      if (version === loadVersion) {
        loading.value = false
        refreshing.value = false
      }
    }
  }

  function stopTimers() {
    if (pollTimer) globalThis.clearInterval(pollTimer)
    if (tickTimer) globalThis.clearInterval(tickTimer)
    pollTimer = null
    tickTimer = null
  }

  function startTimers() {
    stopTimers()
    // 验证码由后端按本机时间计算，轮询保证周期翻转后拿到新码
    pollTimer = globalThis.setInterval(() => void load(true), 5_000)
    tickTimer = globalThis.setInterval(() => { tick.value += 1 }, 1_000)
  }

  function toggleExpanded(id: string) {
    expandedId.value = expandedId.value === id ? '' : id
  }

  function setGroup(group: string) {
    activeGroup.value = group
    expandedId.value = ''
  }

  async function copyCode(account: TwofaAccount) {
    const clipboard = options.clipboard ?? globalThis.navigator?.clipboard
    try {
      if (!clipboard?.writeText) throw new Error('当前环境不支持剪贴板')
      await clipboard.writeText(account.currentCode)
      copiedId.value = account.id
      if (copiedTimer) globalThis.clearTimeout(copiedTimer)
      copiedTimer = globalThis.setTimeout(() => { copiedId.value = '' }, 1_500)
      notifications.push(`已复制 ${account.issuer} 的验证码`, 'success')
      await service.touchTwofaAccount(account.id).catch(() => {})
      await load(true)
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : '复制失败', 'error')
    }
  }

  async function toggleFavorite(account: TwofaAccount) {
    try {
      await service.updateTwofaAccount(account.id, {
        issuer: account.issuer,
        accountName: account.accountName,
        tag: account.tag,
        groupName: account.groupName,
        algorithm: account.algorithm,
        period: account.period,
        digits: account.digits,
        favorite: !account.favorite,
      })
      await load(true)
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : '收藏状态更新失败', 'error')
    }
  }

  async function saveAccount(input: TwofaAccountInput, id = '') {
    if (!input.issuer.trim() || !input.accountName.trim()) {
      notifications.push('发行方与账号名不能为空', 'warning')
      return false
    }
    if (!id && !input.secret?.trim()) {
      notifications.push('新增账号必须填写密钥', 'warning')
      return false
    }
    try {
      if (id) await service.updateTwofaAccount(id, input)
      else await service.createTwofaAccount(input)
      notifications.push(id ? '账号已更新' : '账号已添加', 'success')
      await load(true)
      return true
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : '账号保存失败', 'error')
      return false
    }
  }

  async function removeAccount(account: TwofaAccount) {
    try {
      await service.deleteTwofaAccount(account.id)
      if (expandedId.value === account.id) expandedId.value = ''
      notifications.push(`已删除 ${account.issuer}`, 'success')
      await load(true)
      return true
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : '账号删除失败', 'error')
      return false
    }
  }

  async function importAccounts(items: TwofaAccountInput[]) {
    try {
      const result = await service.importTwofaAccounts(items)
      notifications.push(`导入完成：新增 ${result.created}，更新 ${result.updated}`, 'success')
      await load(true)
      return true
    } catch (reason) {
      notifications.push(reason instanceof Error ? reason.message : '导入失败', 'error')
      return false
    }
  }

  onMounted(() => {
    mounted = true
    void load()
    startTimers()
  })
  onActivated(() => {
    if (mounted) {
      startTimers()
      void load(true)
    }
  })
  onDeactivated(stopTimers)
  onBeforeUnmount(() => {
    mounted = false
    stopTimers()
    if (copiedTimer) globalThis.clearTimeout(copiedTimer)
    loadController?.abort()
  })

  return {
    accounts,
    stats,
    query,
    activeGroup,
    expandedId,
    copiedId,
    loading,
    refreshing,
    error,
    tick,
    groupOptions,
    filtered,
    pinned,
    groupedAccounts,
    summaryLabel,
    status,
    remainingOf,
    load,
    setGroup,
    toggleExpanded,
    copyCode,
    toggleFavorite,
    saveAccount,
    removeAccount,
    importAccounts,
  }
}
