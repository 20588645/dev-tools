import { defineStore } from 'pinia'

import {
  createCommand,
  deleteCommand,
  getSudoStatus,
  listCommands,
  setSudoPassword,
  type CommandRecord,
} from '@/services/modules/commands-service'
import { useNotificationStore } from '@/stores/notification'

export type TerminalConnectionStatus = 'connected' | 'disconnected' | 'idle'

export interface TerminalTabMeta {
  id: string
  name: string
}

function notify() {
  return useNotificationStore()
}

/**
 * 终端页 UI 状态（命令、标签元数据、全屏/搜索）。
 * 活的 xterm / PTY 句柄在 `terminal-runtime-service`，切页 KeepAlive 停用时不销毁。
 */
export const useTerminalStore = defineStore('terminal', {
  state: () => ({
    commands: [] as CommandRecord[],
    commandsLoading: false,
    sudoConfigured: false,
    sudoPasswordDraft: '',
    tabs: [] as TerminalTabMeta[],
    activeTabId: null as string | null,
    connectionStatus: 'idle' as TerminalConnectionStatus,
    fullscreen: false,
    searchOpen: false,
    searchQuery: '',
    searchCountLabel: '0/0',
    /** 命令卡片参数草稿：cmdId → value */
    paramDrafts: {} as Record<string, string>,
    /** cold restore / 首次进页是否已请求过 sessions */
    sessionsBooted: false,
    /** 正在一键重启的命令 id，避免连点。 */
    restartingCommandIds: [] as string[],
    /** 本次 Sidecar 会话里真正执行过、且 PTY 尚未退出的命令。 */
    runningByCommandId: {} as Record<string, string>,
  }),

  getters: {
    activeTab(state): TerminalTabMeta | null {
      return state.tabs.find((t) => t.id === state.activeTabId) ?? null
    },
    canCloseTab(state): boolean {
      return state.tabs.length > 1
    },
    runningCommandIds(state): string[] {
      return Object.keys(state.runningByCommandId)
    },
  },

  actions: {
    setRunningByCommandId(value: Record<string, string>) {
      this.runningByCommandId = value
    },

    setTabs(tabs: TerminalTabMeta[], activeTabId: string | null) {
      this.tabs = tabs
      this.activeTabId = activeTabId
    },

    setActiveTabId(id: string | null) {
      this.activeTabId = id
    },

    setConnectionStatus(status: TerminalConnectionStatus) {
      this.connectionStatus = status
    },

    setSearchCountLabel(label: string) {
      this.searchCountLabel = label
    },

    setParamDraft(cmdId: string, value: string) {
      this.paramDrafts = { ...this.paramDrafts, [cmdId]: value }
    },

    ensureParamDraft(cmd: CommandRecord) {
      if (this.paramDrafts[cmd.id] != null) return
      this.paramDrafts = {
        ...this.paramDrafts,
        [cmd.id]: cmd.paramDefault || '',
      }
    },

    beginRestart(id: string) {
      if (this.restartingCommandIds.includes(id)) return
      this.restartingCommandIds = [...this.restartingCommandIds, id]
    },

    endRestart(id: string) {
      this.restartingCommandIds = this.restartingCommandIds.filter(item => item !== id)
    },

    setFullscreen(value: boolean) {
      this.fullscreen = value
      if (!value) {
        this.searchOpen = false
        this.searchQuery = ''
        this.searchCountLabel = '0/0'
      }
    },

    setSearchOpen(value: boolean) {
      this.searchOpen = value
      if (!value) {
        this.searchQuery = ''
        this.searchCountLabel = '0/0'
      }
    },

    async loadCommands() {
      this.commandsLoading = true
      try {
        this.commands = await listCommands()
        for (const cmd of this.commands) {
          if (cmd.hasParam) this.ensureParamDraft(cmd)
        }
      } catch {
        this.commands = []
      } finally {
        this.commandsLoading = false
      }
      await this.loadSudoStatus()
    },

    async loadSudoStatus() {
      try {
        const status = await getSudoStatus()
        this.sudoConfigured = status.configured
      } catch {
        /* ignore */
      }
    },

    async saveSudoPassword() {
      const password = this.sudoPasswordDraft
      try {
        const status = await setSudoPassword(password)
        this.sudoPasswordDraft = ''
        this.sudoConfigured = status.configured
        notify().push(password ? 'sudo 密码已保存' : 'sudo 密码已清除', 'success')
      } catch (err) {
        notify().push(`保存失败：${err instanceof Error ? err.message : '未知错误'}`, 'error')
      }
    },

    async addCommand(input: {
      name: string
      command: string
      icon: string
    }) {
      const hasParam = input.command.includes('${')
      let paramName = ''
      let paramPlaceholder = ''
      if (hasParam) {
        const match = input.command.match(/\$\{(\w+)\}/)
        paramName = match?.[1] || 'param'
        paramPlaceholder = paramName
      }
      try {
        const cmd = await createCommand({
          name: input.name,
          command: input.command,
          icon: input.icon || '⚡',
          hasParam,
          paramName,
          paramPlaceholder,
        })
        this.commands = [...this.commands, cmd]
        if (cmd.hasParam) this.ensureParamDraft(cmd)
        notify().push('命令已添加', 'success')
        return true
      } catch (err) {
        notify().push(`添加失败：${err instanceof Error ? err.message : '未知错误'}`, 'error')
        return false
      }
    },

    async removeCommand(id: string) {
      try {
        await deleteCommand(id)
        this.commands = this.commands.filter((c) => c.id !== id)
        const next = { ...this.paramDrafts }
        delete next[id]
        this.paramDrafts = next
      } catch (err) {
        notify().push(`删除失败：${err instanceof Error ? err.message : '未知错误'}`, 'error')
      }
    },
  },
})
