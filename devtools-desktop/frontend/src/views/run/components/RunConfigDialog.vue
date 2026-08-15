<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import FormField from '@/components/form/FormField.vue'
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
const title = computed(() => (isConfigMode.value ? '本地运行配置' : '运行本地项目'))
const favoriteCount = computed(() => favorites.value.length)
const selectedCount = computed(() => selected.value.length)

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
  <!-- below-overlays：内含 Select 下拉，对话框需退到 Naive 浮层之下才能点选 -->
  <BaseDialog
    :model-value="project !== null"
    :title="title"
    :subtitle="project ? `${project.displayName} · ${project.path}` : ''"
    width="min(720px, 94vw)"
    body-max-height="min(720px, 78vh)"
    below-overlays
    @update:model-value="!$event && emit('close')"
  >
    <template v-if="project">
      <!-- 启动模式：先给出本次要跑哪些模块，这是此刻最需要决定的事 -->
      <section v-if="!isConfigMode && isMulti" class="run-config__section">
        <div class="run-config__section-head">
          <h4 class="run-config__section-title">快捷运行模块</h4>
          <span v-if="favoriteModules.length > 0" class="run-config__meta">已选 {{ selectedCount }} 个</span>
        </div>
        <div v-if="favoriteModules.length > 0" class="run-config__picker" role="group" aria-label="快捷运行模块">
          <div class="run-config__picker-grid">
            <BaseSelectableItem
              v-for="name in favoriteModules"
              :key="name"
              :selected="selected.includes(name)"
              :pressed="selected.includes(name)"
              @click="toggleSelected(name)"
            >
              <span class="run-config__module" :title="name">{{ name }}</span>
            </BaseSelectableItem>
          </div>
        </div>
        <p v-else class="run-config__hint">
          先在「配置」里收藏常用模块，启动时会显示在这里。
        </p>
      </section>

      <section class="run-config__section">
        <h4 class="run-config__section-title">{{ isConfigMode ? '默认配置' : '运行配置' }}</h4>

        <BaseSelect
          v-model="nodeVersion"
          label="Node 版本"
          :options="nodeOptions"
          help-text="运行时会使用所选 Node 版本执行启动命令"
        />

        <!-- 收藏模块与首页模块只在配置模式可编辑 -->
        <template v-if="isConfigMode && isMulti">
          <FormField
            label="收藏模块"
            :hint="configurableModules.length > 0 ? '收藏后会出现在启动弹窗的快捷区' : undefined"
          >
            <div v-if="configurableModules.length > 0" class="run-config__picker">
              <div class="run-config__picker-head">
                <BaseInput
                  v-model="moduleQuery"
                  type="search"
                  variant="search"
                  placeholder="搜索模块…"
                  aria-label="搜索模块"
                />
                <span class="run-config__meta">已选 {{ favoriteCount }} 个</span>
              </div>
              <div class="run-config__picker-grid" role="group" aria-label="可收藏模块">
                <BaseSelectableItem
                  v-for="name in visibleModules"
                  :key="name"
                  :selected="favorites.includes(name)"
                  :pressed="favorites.includes(name)"
                  @click="toggleFavorite(name)"
                >
                  <span class="run-config__module" :title="name">{{ name }}</span>
                </BaseSelectableItem>
                <p v-if="visibleModules.length === 0" class="run-config__hint">没有匹配的模块</p>
              </div>
            </div>
            <!-- 即使无子模块也保留该区：给空态提示，避免「无模块可收藏、启动又必须选模块」的死结 -->
            <p v-else class="run-config__hint">
              未检测到可运行的子模块，请检查项目结构，或以单体方式直接运行。
            </p>
          </FormField>

          <FormField label="首页模块" hint="勾选后，启动弹窗会默认带上该模块">
            <div class="run-config__home">
              <BaseCheckbox v-model="includeHome" label="同步运行" />
              <BaseInput v-model="homeModule" placeholder="home" aria-label="首页模块名" />
            </div>
          </FormField>
        </template>

        <BaseInput v-model="command" label="启动命令" placeholder="npm run dev" />
        <div v-if="isConfigMode" class="run-config__row">
          <BaseInput
            v-model="port"
            label="服务端口"
            placeholder="自动推断（例如 8080）"
            help-text="填写后强制使用该端口，留空则由项目配置推断"
          />
          <BaseSelect v-model="groupName" label="分组" :options="groupOptions" />
        </div>
        <BaseInput
          v-else
          v-model="port"
          label="服务端口"
          placeholder="自动推断（例如 8080）"
          help-text="填写后强制使用该端口，留空则由项目配置推断"
        />
        <BaseInput
          v-if="isConfigMode && groupName === NEW_GROUP"
          v-model="newGroupName"
          label="新分组名称"
          placeholder="分组名称"
        />

        <div v-if="!isConfigMode" class="run-config__option">
          <BaseCheckbox
            v-model="autoRestart"
            label="异常退出时自动重启"
            description="最多重试 3 次"
          />
        </div>
      </section>

      <p v-if="error" class="run-config__error" role="alert">{{ error }}</p>
    </template>

    <template #footer>
      <BaseButton variant="secondary" @click="emit('close')">取消</BaseButton>
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
  gap: var(--space-4);
}

.run-config__section + .run-config__section {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-soft);
}

.run-config__section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}

.run-config__section-title {
  margin: 0;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.run-config__meta {
  color: var(--color-text-subtle);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

.run-config__picker {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.run-config__picker-head {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-3);
  padding: 12px 12px 0;
}

.run-config__picker-head > :first-child {
  flex: 1 1 auto;
  min-width: 0;
}

.run-config__picker-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
  gap: 8px;
  max-height: min(320px, 38vh);
  overflow-y: auto;
  padding: 12px 14px 14px;
  --base-selectable-min-height: 36px;
  --base-selectable-padding: 8px 10px;
  --base-selectable-radius: 10px;
  --base-selectable-border: var(--color-border);
  --base-selectable-background: var(--color-surface-subtle);
  --base-selectable-hover-transform: none;
  --base-selectable-selected-shadow: none;
  --base-selectable-selected-background: color-mix(in srgb, var(--color-action) 10%, var(--color-surface));
  --base-selectable-selected-border: color-mix(in srgb, var(--color-action) 36%, var(--color-border));
}

.run-config__module {
  display: block;
  overflow: hidden;
  min-width: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-normal);
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-config__home,
.run-config__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.run-config__home { align-items: center; }
.run-config__row { align-items: flex-start; }

.run-config__home > :last-child,
.run-config__row > * {
  flex: 1 1 160px;
  min-width: 0;
}

.run-config__option {
  padding: 10px 12px;
  border: 1px solid var(--color-border-soft);
  border-radius: 10px;
  background: var(--color-surface);
}

.run-config__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
}

.run-config__picker-grid .run-config__hint {
  grid-column: 1 / -1;
  padding: 4px 2px;
}

@media (max-width: 640px) {
  .run-config__picker-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.run-config__error {
  margin: var(--space-3) 0 0;
  color: var(--color-danger);
  font-size: var(--font-size-xs);
}
</style>
