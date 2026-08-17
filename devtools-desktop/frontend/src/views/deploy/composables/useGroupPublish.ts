import { computed, ref } from 'vue'

import { ApiError } from '@/services/api-client'
import type { DeployFinishedDetail } from '@/services/deploy-realtime-service'
import * as groupPublishService from '@/services/modules/group-publish-service'
import {
  assertGatewayProfileReady,
  emptyGroupPublishProfile,
  isGatewayPublish,
  remotePathForProject,
  type GroupPublishProfile,
  type PublishMode,
} from '@/services/modules/group-publish-service'
import type { Project } from '@/services/modules/project-service'

export type GatewayHandoffStatus = 'idle' | 'connecting' | 'success' | 'error'

export interface GroupPublishDraftDevice {
  projectName: string
  displayName: string
  remotePath: string
}

export interface GroupPublishDraft {
  groupName: string
  publishMode: PublishMode
  gatewayUrl: string
  gatewayUsername: string
  gatewayPassword: string
  passwordMasked: string
  devices: GroupPublishDraftDevice[]
}

export type HandoffCopiedPath = '' | 'dist' | 'remote'

export interface GatewayHandoffState {
  groupName: string
  projectName: string
  displayName: string
  distPath: string
  remotePath: string
  status: GatewayHandoffStatus
  message: string
}

interface UseGroupPublishOptions {
  service?: typeof groupPublishService
  clipboard?: Pick<Clipboard, 'writeText'>
}

function draftFrom(profile: GroupPublishProfile, projects: Project[]): GroupPublishDraft {
  const byName = new Map(profile.devices.map(item => [item.projectName, item.remotePath]))
  return {
    groupName: profile.groupName,
    publishMode: profile.publishMode,
    gatewayUrl: profile.gatewayUrl,
    gatewayUsername: profile.gatewayUsername,
    gatewayPassword: '',
    passwordMasked: profile.passwordMasked,
    devices: projects.map(project => ({
      projectName: project.name,
      displayName: project.displayName || project.name,
      remotePath: byName.get(project.name) || '',
    })),
  }
}

export function useGroupPublish(options: UseGroupPublishOptions = {}) {
  const service = options.service ?? groupPublishService

  const profiles = ref<Record<string, GroupPublishProfile>>({})
  const draft = ref<GroupPublishDraft | null>(null)
  const saving = ref(false)
  const configError = ref('')
  const armed = ref<{ groupName: string, projectName: string } | null>(null)
  const handoff = ref<GatewayHandoffState | null>(null)
  const copied = ref<HandoffCopiedPath>('')

  const configOpen = computed(() => draft.value !== null)
  const handoffOpen = computed(() => handoff.value !== null)

  function profileOf(groupName: string): GroupPublishProfile {
    return profiles.value[groupName] ?? emptyGroupPublishProfile(groupName)
  }

  function isGatewayGroup(groupName: string): boolean {
    return isGatewayPublish(profileOf(groupName))
  }

  function remotePathOf(groupName: string, projectName: string): string {
    return remotePathForProject(profileOf(groupName), projectName)
  }

  async function load() {
    try {
      profiles.value = await service.getGroupPublishProfiles()
    } catch {
      profiles.value = {}
    }
  }

  async function openConfig(groupName: string, projects: Project[]) {
    configError.value = ''
    const fresh = await service.getGroupPublishProfile(groupName).catch(() => profileOf(groupName))
    profiles.value = { ...profiles.value, [groupName]: fresh }
    draft.value = draftFrom(fresh, projects)
  }

  function closeConfig() {
    if (saving.value) return
    draft.value = null
    configError.value = ''
  }

  function patchDraft(patch: Partial<GroupPublishDraft>) {
    if (!draft.value) return
    draft.value = { ...draft.value, ...patch }
  }

  function setRemotePath(projectName: string, remotePath: string) {
    if (!draft.value) return
    draft.value = {
      ...draft.value,
      devices: draft.value.devices.map(item => (
        item.projectName === projectName ? { ...item, remotePath } : item
      )),
    }
  }

  async function saveConfig() {
    const current = draft.value
    if (!current || saving.value) return false
    if (current.publishMode === 'gateway-filezilla') {
      if (!current.gatewayUrl) {
        configError.value = '请先填写网关登录地址'
        return false
      }
      if (!/^https?:\/\//i.test(current.gatewayUrl.trim())) {
        configError.value = '网关地址必须是 http 或 https 链接'
        return false
      }
      if (!current.gatewayUsername.trim()) {
        configError.value = '请先填写网关用户名'
        return false
      }
      if (!current.gatewayPassword && !current.passwordMasked) {
        configError.value = '请填写网关密码'
        return false
      }
    }
    saving.value = true
    configError.value = ''
    try {
      const saved = await service.saveGroupPublishProfile(current.groupName, {
        publishMode: current.publishMode,
        gatewayUrl: current.gatewayUrl,
        gatewayUsername: current.gatewayUsername,
        gatewayPassword: current.gatewayPassword,
        devices: current.devices.map(item => ({
          projectName: item.projectName,
          remotePath: item.remotePath,
        })),
      })
      profiles.value = { ...profiles.value, [saved.groupName]: saved }
      draft.value = null
      return true
    } catch (cause) {
      configError.value = cause instanceof Error ? cause.message : '保存失败'
      return false
    } finally {
      saving.value = false
    }
  }

  async function rename(from: string, to: string) {
    const saved = await service.renameGroupPublishProfile(from, to)
    const next = { ...profiles.value }
    delete next[from]
    next[to] = saved.groupName ? saved : emptyGroupPublishProfile(to)
    profiles.value = next
  }

  function readinessError(groupName: string, projectName: string): string {
    return assertGatewayProfileReady(profileOf(groupName), projectName)
  }

  function armAfterBuild(groupName: string, projectName: string) {
    armed.value = { groupName, projectName }
  }

  function clearArmed() {
    armed.value = null
  }

  async function beginHandoff(groupName: string, project: Project) {
    handoff.value = {
      groupName,
      projectName: project.name,
      displayName: project.displayName || project.name,
      distPath: '',
      remotePath: remotePathOf(groupName, project.name) || project.remotePath || '',
      status: 'connecting',
      message: '正在打开网关并登录…',
    }
    copied.value = ''
    await connect()
  }

  async function handleBuildFinished(detail: DeployFinishedDetail, project: Project | undefined) {
    const pending = armed.value
    if (!pending) return
    if (detail.projectName !== pending.projectName) return
    if (detail.type !== 'build-only') return
    armed.value = null
    if (!detail.success || !project) return
    await beginHandoff(pending.groupName, project)
  }

  async function connect() {
    const current = handoff.value
    if (!current) return
    current.status = 'connecting'
    current.message = '正在打开网关并登录…'
    try {
      const result = await service.connectGroupGateway(current.groupName, current.projectName)
      current.distPath = result.distPath || current.distPath
      current.remotePath = result.remotePath || current.remotePath
      current.status = result.ok ? 'success' : 'error'
      current.message = result.message || (result.ok
        ? '网关已打开。请在 Chrome 里点 SFTP 调起 FileZilla，并把产物拖到远程路径。'
        : '网关代登失败')
    } catch (cause) {
      current.distPath = service.distPathFromConnectError(cause) || current.distPath
      current.remotePath = service.remotePathFromConnectError(cause) || current.remotePath
      current.status = 'error'
      current.message = cause instanceof ApiError || cause instanceof Error
        ? cause.message
        : '网关代登失败'
    }
  }

  async function copyHandoffPath(kind: Exclude<HandoffCopiedPath, ''>) {
    const path = kind === 'remote' ? handoff.value?.remotePath : handoff.value?.distPath
    if (!path) return false
    const clipboard = options.clipboard ?? globalThis.navigator?.clipboard
    if (!clipboard?.writeText) return false
    try {
      await clipboard.writeText(path)
      copied.value = kind
      return true
    } catch {
      return false
    }
  }

  function closeHandoff() {
    handoff.value = null
    copied.value = ''
  }

  return {
    profiles,
    draft,
    saving,
    configError,
    configOpen,
    handoff,
    handoffOpen,
    copied,
    load,
    profileOf,
    isGatewayGroup,
    remotePathOf,
    openConfig,
    closeConfig,
    patchDraft,
    setRemotePath,
    saveConfig,
    rename,
    readinessError,
    armAfterBuild,
    clearArmed,
    beginHandoff,
    handleBuildFinished,
    connect,
    copyHandoffPath,
    closeHandoff,
  }
}
