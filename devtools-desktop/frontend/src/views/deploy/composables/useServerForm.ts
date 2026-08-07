import { computed, ref } from 'vue'

import {
  buildServerPayload,
  createServer,
  updateServer,
  type DeployServer,
  type ServerInput,
} from '@/services/modules/deploy-service'

/** 发布目录统一补齐首尾斜杠，与旧实现一致。 */
export function normalizeDeployPath(raw: string): string {
  let path = raw.trim()
  if (!path) return ''
  if (!path.startsWith('/')) path = `/${path}`
  if (!path.endsWith('/')) path = `${path}/`
  return path
}

export interface ServerFormState {
  name: string
  host: string
  port: string
  username: string
  defaultRemotePath: string
  password: string
}

const emptyState = (): ServerFormState => ({
  name: '',
  host: '',
  port: '22',
  username: 'root',
  defaultRemotePath: '/',
  password: '',
})

export function useServerForm() {
  const open = ref(false)
  const editingId = ref('')
  const state = ref<ServerFormState>(emptyState())
  const deployPaths = ref<string[]>([])
  const pathDraft = ref('')
  const duplicateHint = ref(false)
  const saving = ref(false)

  const title = computed(() => editingId.value ? '编辑服务器' : '添加服务器')
  const canSave = computed(() => Boolean(state.value.name.trim() && state.value.host.trim()))

  function openCreate() {
    editingId.value = ''
    state.value = emptyState()
    deployPaths.value = []
    pathDraft.value = ''
    duplicateHint.value = false
    open.value = true
  }

  function openEdit(server: DeployServer) {
    editingId.value = server.id
    state.value = {
      name: server.name,
      host: server.host,
      port: String(server.port),
      username: server.username,
      defaultRemotePath: server.defaultRemotePath || '/',
      // 编辑态密码留空表示不修改；掩码值绝不回填，否则会被当成真实密码提交
      password: '',
    }
    deployPaths.value = [...server.deployPaths]
    pathDraft.value = ''
    duplicateHint.value = false
    open.value = true
  }

  function patchState(patch: Partial<ServerFormState>) {
    state.value = { ...state.value, ...patch }
  }

  function addPath() {
    const path = normalizeDeployPath(pathDraft.value)
    if (!path) return
    if (deployPaths.value.includes(path)) {
      pathDraft.value = ''
      duplicateHint.value = true
      // 提示只在输入框上停留一会儿，与旧实现的 1.2s placeholder 一致
      window.setTimeout(() => { duplicateHint.value = false }, 1200)
      return
    }
    duplicateHint.value = false
    deployPaths.value = [...deployPaths.value, path]
    pathDraft.value = ''
  }

  /** 输入框为空时 Backspace 弹出最后一个 tag（旧实现的隐含交互）。 */
  function popPathOnBackspace() {
    if (pathDraft.value || deployPaths.value.length === 0) return
    deployPaths.value = deployPaths.value.slice(0, -1)
  }

  function removePath(index: number) {
    deployPaths.value = deployPaths.value.filter((_, i) => i !== index)
  }

  function editPath(index: number, raw: string) {
    const path = normalizeDeployPath(raw)
    if (!path) return
    deployPaths.value = deployPaths.value.map((item, i) => (i === index ? path : item))
  }

  function buildPayload(): ServerInput {
    const input: ServerInput = {
      name: state.value.name.trim(),
      host: state.value.host.trim(),
      port: Number(state.value.port) || 22,
      // 认证方式只有密码一种实现，表单不再给伪下拉（见 decision 第 7 节 D7）
      authType: 'password',
      username: state.value.username.trim() || 'root',
      defaultRemotePath: state.value.defaultRemotePath.trim() || '/',
      deployPaths: deployPaths.value,
    }
    return buildServerPayload(input, state.value.password)
  }

  async function submit(): Promise<void> {
    saving.value = true
    try {
      const payload = buildPayload()
      if (editingId.value) await updateServer(editingId.value, payload)
      else await createServer(payload)
      open.value = false
    } finally {
      saving.value = false
    }
  }

  return {
    open,
    editingId,
    state,
    deployPaths,
    pathDraft,
    duplicateHint,
    saving,
    title,
    canSave,
    openCreate,
    openEdit,
    patchState,
    buildPayload,
    addPath,
    popPathOnBackspace,
    removePath,
    editPath,
    submit,
  }
}
