<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import FormField from '@/components/form/FormField.vue'
import FilterChip from '@/components/navigation/FilterChip.vue'
import type { Project, RunConfigPatch } from '@/services/modules/project-service'

defineOptions({ name: 'RunConfigDialog' })

/** `start` 启动前确认配置并选模块；`config` 只保存默认配置。 */
export type RunConfigMode = 'start' | 'config'

export interface RunConfigSubmit {
  patch: RunConfigPatch
  /** 本次要启动的模块；config 模式为 null（不启动）。 */
  launchModules: string[] | null
  autoRestart: boolean
}

const props = defineProps<{
  project: Project | null
  mode: RunConfigMode
  nodeVersions: string[]
  currentNodeVersion: string
  groupNames: string[]
  /** 收藏模块（含按需带上的首页模块），用于启动模式的快捷勾选。 */
  favoriteModules: string[]
  submitting: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [value: RunConfigSubmit]
}>()

const NEW_GROUP = '__newgroup__'

const command = ref('')
const port = ref('')
const nodeVersion = ref('')
const groupName = ref('')
const newGroupName = ref('')
const includeHome = ref(true)
const homeModule = ref('home')
const autoRestart = ref(false)
/** 配置模式：勾选要收藏的模块。 */
const favorites = ref<string[]>([])
/** 启动模式：勾选本次要跑的模块。 */
const selected = ref<string[]>([])
const moduleQuery = ref('')
const error = ref('')

const isMulti = computed(() => props.project?.type === 'multi-module')
const isConfigMode = computed(() => props.mode === 'config')

/** 配置模式的可收藏模块：排除首页模块（它由「同步运行」单独控制）。 */
const configurableModules = computed(() => {
  if (!props.project) return []
  const home = homeModule.value.trim().toLowerCase() || 'home'
  return props.project.modules
    .map(m => m.name)
    .filter(name => name.toLowerCase() !== home)
})

const visibleModules = computed(() => {
  const keyword = moduleQuery.value.trim().toLowerCase()
  return keyword
    ? configurableModules.value.filter(name => name.toLowerCase().includes(keyword))
    : configurableModules.value
})

const nodeOptions = computed(() => [
  { value: '', label: `系统默认${props.currentNodeVersion ? ` (${props.currentNodeVersion})` : ''}` },
  ...props.nodeVersions.map(version => ({ value: version, label: version })),
])

const groupOptions = computed(() => [
  { value: '', label: '未分组' },
  ...props.groupNames.map(name => ({ value: name, label: name })),
  { value: NEW_GROUP, label: '+ 新建分组…' },
])

/** 启动模式且多模块时未勾选任何模块 → 禁用提交，事前引导而非点了才报错。 */
const submitDisabled = computed(() => (
  props.submitting || (props.mode === 'start' && isMulti.value && selected.value.length === 0)
))

const submitLabel = computed(() => (isConfigMode.value ? '保存配置' : '▶ 启动运行'))
const title = computed(() => (isConfigMode.value ? '本地运行配置' : '▶ 运行本地项目'))

watch(() => [props.project, props.mode] as const, () => {
  const project = props.project
  error.value = ''
  moduleQuery.value = ''
  newGroupName.value = ''
  if (!project) return
  command.value = project.runCommand || (project.tool === 'Vue CLI' ? 'npm run serve' : 'npm run dev')
  port.value = project.runPort
  nodeVersion.value = project.nodeVersion
  groupName.value = project.groupName
  includeHome.value = project.runIncludeHome
  homeModule.value = project.runHomeModule || 'home'
  autoRestart.value = false
  favorites.value = [...project.favoriteRunModules]
  // 启动模式默认勾上首页模块（若在收藏里），其余交给用户选
  const home = (project.runHomeModule || 'home').trim()
  selected.value = project.runIncludeHome && props.favoriteModules.some(n => n.toLowerCase() === home.toLowerCase())
    ? [home]
    : []
}, { immediate: true })

/** 模板里 ref 会被自动解包，因此按用途分成两个具名函数而不是传 ref。 */
function toggleFavorite(name: string) {
  favorites.value = favorites.value.includes(name)
    ? favorites.value.filter(item => item !== name)
    : [...favorites.value, name]
}

function toggleSelected(name: string) {
  selected.value = selected.value.includes(name)
    ? selected.value.filter(item => item !== name)
    : [...selected.value, name]
}

function onSubmit() {
  if (!props.project) return
  const trimmedCommand = command.value.trim()
  if (!trimmedCommand) {
    error.value = '请输入启动命令'
    return
  }
  // 端口校验：空 = 交给后端推断；非空必须是 1–65535 整数，非法值会破坏端口推断与占用检测
  const trimmedPort = port.value.trim()
  if (trimmedPort && !/^\d+$/.test(trimmedPort)) {
    error.value = '服务端口只能填数字（留空则自动推断）'
    return
  }
  if (trimmedPort && (Number(trimmedPort) < 1 || Number(trimmedPort) > 65_535)) {
    error.value = '服务端口需在 1–65535 之间'
    return
  }
  const resolvedGroup = groupName.value === NEW_GROUP ? newGroupName.value.trim() : groupName.value
  if (groupName.value === NEW_GROUP && !resolvedGroup) {
    error.value = '请输入新分组名称'
    return
  }
  error.value = ''

  emit('submit', {
    patch: {
      runCommand: trimmedCommand,
      runPort: trimmedPort,
      runHomeModule: homeModule.value.trim() || 'home',
      runIncludeHome: includeHome.value,
      // 启动模式不编辑收藏，沿用原值，避免被隐藏字段覆盖
      favoriteRunModules: isConfigMode.value ? favorites.value : props.project.favoriteRunModules,
      nodeVersion: nodeVersion.value,
      // 分组仅配置模式可编辑
      groupName: isConfigMode.value ? resolvedGroup : props.project.groupName,
    },
    launchModules: isConfigMode.value ? null : (isMulti.value ? selected.value : []),
    autoRestart: autoRestart.value,
  })
}
</script>

<template>
  <BaseDialog
    :model-value="project !== null"
    :title="title"
    :subtitle="project ? `${project.displayName} · ${project.path}` : ''"
    width="min(620px, 94vw)"
    body-max-height="min(560px, 70vh)"
    @update:model-value="!$event && emit('close')"
  >
    <template v-if="project">
      <!-- 启动模式：先给出本次要跑哪些模块，这是此刻最需要决定的事 -->
      <section v-if="!isConfigMode && isMulti" class="run-config__section">
        <h4 class="run-config__section-title">快捷运行模块</h4>
        <div v-if="favoriteModules.length > 0" class="run-config__chips">
          <FilterChip
            v-for="name in favoriteModules"
            :key="name"
            :label="name"
            :selected="selected.includes(name)"
            @update:selected="toggleSelected(name)"
          />
        </div>
        <p v-else class="run-config__hint">
          先在「配置」里收藏常用模块，启动时会显示在这里。
        </p>
      </section>

      <section class="run-config__section">
        <h4 class="run-config__section-title">{{ isConfigMode ? '默认配置' : '运行配置' }}</h4>

        <BaseSelect v-model="nodeVersion" label="Node 版本" :options="nodeOptions" />

        <!-- 收藏模块与首页模块只在配置模式可编辑 -->
        <template v-if="isConfigMode && isMulti">
          <FormField label="收藏模块" hint="收藏后会出现在启动弹窗的快捷区">
            <BaseInput v-model="moduleQuery" type="search" placeholder="搜索模块..." aria-label="搜索模块" />
            <div v-if="configurableModules.length > 0" class="run-config__picker">
              <BaseCheckbox
                v-for="name in visibleModules"
                :key="name"
                :label="name"
                :model-value="favorites.includes(name)"
                @update:model-value="toggleFavorite(name)"
              />
              <p v-if="visibleModules.length === 0" class="run-config__hint">没有匹配的模块</p>
            </div>
            <!-- 即使无子模块也保留该区：给空态提示，避免「无模块可收藏、启动又必须选模块」的死结 -->
            <p v-else class="run-config__hint">
              未检测到可运行的子模块，请检查项目结构，或以单体方式直接运行。
            </p>
          </FormField>

          <FormField label="首页模块">
            <div class="run-config__inline">
              <BaseCheckbox v-model="includeHome" label="同步运行" />
              <BaseInput v-model="homeModule" placeholder="home" aria-label="首页模块名" />
            </div>
          </FormField>
        </template>

        <BaseInput v-model="command" label="启动命令" placeholder="npm run dev" />
        <BaseInput
          v-model="port"
          label="服务端口"
          placeholder="自动推断 (例如 8080)"
          help-text="填写后将强制使用该端口，留空则由项目配置推断"
        />

        <BaseSelect v-if="isConfigMode" v-model="groupName" label="分组" :options="groupOptions" />
        <BaseInput
          v-if="isConfigMode && groupName === NEW_GROUP"
          v-model="newGroupName"
          label="新分组名称"
          placeholder="分组名称"
        />

        <BaseCheckbox
          v-if="!isConfigMode"
          v-model="autoRestart"
          label="异常退出时自动重启"
          description="最多重试 3 次"
        />
      </section>

      <p v-if="error" class="run-config__error" role="alert">{{ error }}</p>
      <p class="run-config__hint">运行时会使用所选 Node 版本执行启动命令。</p>
    </template>

    <template #footer>
      <BaseButton variant="ghost" @click="emit('close')">取消</BaseButton>
      <BaseButton
        variant="primary"
        :disabled="submitDisabled"
        :loading="submitting"
        :title="submitDisabled && !submitting ? '请先勾选要运行的模块' : undefined"
        @click="onSubmit"
      >
        {{ submitLabel }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.run-config__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.run-config__section-title {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.run-config__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.run-config__picker {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  max-height: 180px;
  margin-top: var(--space-2);
  overflow-y: auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-subtle);
}

.run-config__inline {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}

.run-config__inline > :last-child { flex: 1 1 140px; min-width: 0; }

.run-config__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
}

.run-config__error {
  margin: 0 0 var(--space-2);
  color: var(--color-danger);
  font-size: var(--font-size-xs);
}
</style>
