<script setup lang="ts">
import { computed } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseSelectableItem from '@/components/base/BaseSelectableItem.vue'
import BaseDialog from '@/components/feedback/BaseDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import BaseCheckbox from '@/components/form/BaseCheckbox.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import BaseSelect from '@/components/form/BaseSelect.vue'
import FormField from '@/components/form/FormField.vue'
import FilterChip from '@/components/navigation/FilterChip.vue'
import type { DeployServer, GitLogEntry } from '@/services/modules/deploy-service'
import type { Project } from '@/services/modules/project-service'

import { formatGitCommitAgo } from '../deploy-format'
import type {
  ConnBadge,
  ModuleFilter,
  QuickTestSummary,
} from '../composables/useBuildDeploy'

defineOptions({ name: 'BuildDeployDialog' })

const props = defineProps<{
  project: Project | null
  mode: 'build' | 'deploy'
  title: string
  subtitle: string
  isMulti: boolean
  selectedModules: string[]
  favorites: string[]
  moduleFilter: ModuleFilter
  moduleQuery: string
  moduleSections: { favorites: string[]; others: string[] }
  nodeVersion: string
  nodeVersions: string[]
  currentNodeVersion: string
  servers: DeployServer[]
  serverIds: string[]
  remotePath: string
  pathOptions: string[]
  gitBranch: string
  gitCommits: GitLogEntry[]
  connBadges: Record<string, ConnBadge>
  testSummary: QuickTestSummary
  testing: boolean
  submitting: boolean
  error: string
  /** 构建成功后交接到网关 FileZilla，不选服务器。 */
  handoff?: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: []
  'update:moduleFilter': [value: ModuleFilter]
  'update:moduleQuery': [value: string]
  'update:nodeVersion': [value: string]
  'update:remotePath': [value: string]
  'toggle-module': [name: string]
  'toggle-favorite': [name: string]
  'toggle-all': [check: boolean]
  'toggle-server': [id: string, checked: boolean]
  'quick-test': []
  browse: []
}>()

const nodeOptions = computed(() => [
  {
    value: '',
    label: props.currentNodeVersion
      ? `系统默认 (${props.currentNodeVersion})`
      : '系统默认',
  },
  ...props.nodeVersions.map(version => ({ value: version, label: version })),
])

const pathSelectOptions = computed(() =>
  props.pathOptions.map((path, index) => ({
    value: path,
    label: index === 0 ? `${path} (默认)` : path,
  })),
)

const primaryLabel = computed(() => {
  if (props.handoff) return '构建并交接'
  return props.mode === 'build' ? '开始构建' : '构建并部署'
})

const quickTestLabel = computed(() => {
  if (props.testSummary === 'testing') return '测试中…'
  if (props.testSummary === 'all-ok') return '全部连通'
  if (props.testSummary === 'partial-fail') return '部分失败'
  return '测试连接'
})

function badgeText(badge: ConnBadge | undefined): string {
  if (!badge || badge.status === 'idle') return ''
  if (badge.status === 'testing') return '…'
  if (badge.status === 'ok') return `${badge.duration}ms`
  return '失败'
}

function isFavorite(name: string): boolean {
  return props.favorites.includes(name)
}

function isSelected(name: string): boolean {
  return props.selectedModules.includes(name)
}

type ModuleTile =
  | { type: 'module', key: string, name: string }
  | { type: 'divider', key: string }

/** 常用在前，其余用分隔条隔开；「常用」筛选只展示收藏。 */
const moduleTiles = computed<ModuleTile[]>(() => {
  if (props.moduleFilter === 'fav') {
    return props.moduleSections.favorites.map(name => ({ type: 'module', key: name, name }))
  }
  const favTiles = props.moduleSections.favorites.map(name => ({
    type: 'module' as const,
    key: `fav-${name}`,
    name,
  }))
  const otherTiles = props.moduleSections.others.map(name => ({
    type: 'module' as const,
    key: name,
    name,
  }))
  if (favTiles.length > 0 && otherTiles.length > 0) {
    return [...favTiles, { type: 'divider', key: 'divider' }, ...otherTiles]
  }
  return [...favTiles, ...otherTiles]
})
</script>

<template>
  <!-- below-overlays：内含 Select 下拉，对话框需退到 Naive 浮层之下才能点选 -->
  <BaseDialog
    :model-value="project !== null"
    :title="title"
    :subtitle="subtitle"
    below-overlays
    @update:model-value="!$event && emit('close')"
  >
    <div v-if="project" class="build-deploy">
      <!-- 单体：说明即可，无需模块网格 -->
      <EmptyState
        v-if="!isMulti"
        compact
        :title="handoff
          ? '该项目为单体项目，将整体构建后交接到 FileZilla'
          : (mode === 'build' ? '该项目为单体项目，将整体构建' : '该项目为单体项目，将整体构建并发布')"
      />

      <template v-else>
        <div class="build-deploy__picker">
          <div class="build-deploy__picker-head">
            <BaseInput
              :model-value="moduleQuery"
              type="search"
              variant="search"
              class="build-deploy__search"
              aria-label="搜索模块"
              placeholder="搜索模块…"
              @update:model-value="emit('update:moduleQuery', $event)"
            />
            <div class="build-deploy__filters" role="group" aria-label="模块筛选">
              <FilterChip
                label="全部"
                :selected="moduleFilter === 'all'"
                @update:selected="emit('update:moduleFilter', 'all')"
              />
              <FilterChip
                label="常用"
                :selected="moduleFilter === 'fav'"
                @update:selected="emit('update:moduleFilter', 'fav')"
              />
            </div>
            <div class="build-deploy__bulk">
              <BaseButton variant="ghost" size="sm" @click="emit('toggle-all', true)">全选</BaseButton>
              <BaseButton variant="ghost" size="sm" @click="emit('toggle-all', false)">全不选</BaseButton>
              <span class="build-deploy__count">已选 {{ selectedModules.length }} 个</span>
            </div>
          </div>

          <EmptyState
            v-if="moduleFilter === 'fav' && moduleSections.favorites.length === 0"
            compact
            class="build-deploy__picker-empty"
            title="暂无常用模块"
            description="点击模块右侧星标添加"
          />
          <div v-else class="build-deploy__picker-grid" role="group" aria-label="构建模块">
            <template v-for="tile in moduleTiles" :key="tile.key">
              <div v-if="tile.type === 'divider'" class="build-deploy__divider" role="separator">
                <span>其他模块</span>
              </div>
              <BaseSelectableItem
                v-else-if="tile.type === 'module'"
                :selected="isSelected(tile.name)"
                :pressed="isSelected(tile.name)"
                @click="emit('toggle-module', tile.name)"
              >
                <span class="build-deploy__module">
                  <span class="build-deploy__module-name" :title="tile.name">{{ tile.name }}</span>
                  <BaseIconButton
                    class="build-deploy__star"
                    :class="{ 'is-on': isFavorite(tile.name) }"
                    :label="isFavorite(tile.name) ? '取消常用' : '设为常用'"
                    size="sm"
                    @click.stop="emit('toggle-favorite', tile.name)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      :fill="isFavorite(tile.name) ? 'currentColor' : 'none'"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </BaseIconButton>
                </span>
              </BaseSelectableItem>
            </template>
          </div>
        </div>
      </template>

      <div class="build-deploy__config">
        <p v-if="handoff" class="build-deploy__handoff-note">
          构建成功后会打开交接弹窗，显示本地产物路径和已配置的远程路径，并用系统 Chrome 打开网关、尽快登录。SFTP 请在 Chrome 里手动点。
        </p>
        <BaseSelect
          :model-value="nodeVersion"
          label="Node 版本"
          :options="nodeOptions"
          help-text="构建时会使用所选 Node 版本执行构建命令"
          @update:model-value="emit('update:nodeVersion', $event)"
        />

        <template v-if="mode === 'deploy'">
          <FormField label="目标服务器" hint="可多选；发布目录选项取自首台勾选服务器">
            <EmptyState
              v-if="servers.length === 0"
              compact
              title="暂无服务器"
              description="请先到「服务器管理」添加"
            />
            <div v-else class="build-deploy__servers">
              <label
                v-for="server in servers"
                :key="server.id"
                class="build-deploy__server"
                :class="{ 'is-checked': serverIds.includes(server.id) }"
              >
                <BaseCheckbox
                  :model-value="serverIds.includes(server.id)"
                  :label="`${server.name} (${server.host})`"
                  @update:model-value="emit('toggle-server', server.id, $event)"
                />
                <span
                  v-if="connBadges[server.id] && connBadges[server.id].status !== 'idle'"
                  class="build-deploy__badge"
                  :class="`build-deploy__badge--${connBadges[server.id].status}`"
                  :title="connBadges[server.id].error || undefined"
                >
                  {{ badgeText(connBadges[server.id]) }}
                </span>
              </label>
            </div>
          </FormField>

          <FormField label="发布目录">
            <div class="build-deploy__path-row">
              <BaseSelect
                :model-value="remotePath"
                :options="pathSelectOptions"
                aria-label="发布目录"
                @update:model-value="emit('update:remotePath', $event)"
              />
              <BaseButton variant="secondary" @click="emit('browse')">浏览</BaseButton>
            </div>
          </FormField>
        </template>
      </div>

      <section class="build-deploy__git" aria-label="最近提交">
        <div class="build-deploy__git-header">
          <span>最近提交</span>
          <span v-if="gitBranch" class="build-deploy__branch">{{ gitBranch }}</span>
        </div>
        <ul v-if="gitCommits.length > 0" class="build-deploy__git-list">
          <li v-for="commit in gitCommits" :key="commit.hash" class="build-deploy__git-item">
            <span class="build-deploy__git-time">{{ formatGitCommitAgo(commit.timestamp) }}</span>
            <span class="build-deploy__git-hash">{{ commit.hash }}</span>
            <span class="build-deploy__git-msg" :title="commit.message">{{ commit.message }}</span>
          </li>
        </ul>
        <p v-else class="build-deploy__hint">暂无最近提交</p>
      </section>

      <p v-if="error" class="build-deploy__error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <BaseButton
        v-if="mode === 'deploy'"
        class="build-deploy__quick-test"
        variant="secondary"
        :loading="testing"
        :disabled="submitting"
        @click="emit('quick-test')"
      >
        {{ quickTestLabel }}
      </BaseButton>
      <span v-else class="build-deploy__footer-spacer" />
      <BaseButton variant="secondary" :disabled="submitting" @click="emit('close')">取消</BaseButton>
      <BaseButton
        variant="primary"
        :loading="submitting"
        :disabled="testing"
        @click="emit('submit')"
      >
        {{ primaryLabel }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>

<style scoped>
.build-deploy {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.build-deploy__picker {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
}

.build-deploy__picker-head {
  display: flex;
  flex-wrap: wrap;
  flex: none;
  align-items: center;
  gap: var(--space-2);
  padding: 12px 12px 0;
}

.build-deploy__search {
  flex: 1 1 160px;
  min-width: 140px;
}

.build-deploy__filters,
.build-deploy__bulk {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  align-items: center;
}

.build-deploy__count {
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

.build-deploy__picker-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-content: start;
  gap: 8px;
  max-height: min(280px, 34vh);
  overflow-y: auto;
  padding: 12px 14px 14px;
  --base-selectable-min-height: 36px;
  --base-selectable-padding: 8px 8px 8px 10px;
  --base-selectable-radius: 10px;
  --base-selectable-border: var(--color-border);
  --base-selectable-background: var(--color-surface-subtle);
  --base-selectable-hover-transform: none;
  --base-selectable-selected-shadow: none;
  --base-selectable-selected-background: color-mix(in srgb, var(--color-action) 10%, var(--color-surface));
  --base-selectable-selected-border: color-mix(in srgb, var(--color-action) 36%, var(--color-border));
}

.build-deploy__module {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 2px;
  align-items: center;
  width: 100%;
  min-width: 0;
}

.build-deploy__module-name {
  overflow: hidden;
  min-width: 0;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-normal);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.build-deploy__star.is-on {
  color: var(--color-action);
}

.build-deploy__hint {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
}

.build-deploy__picker-empty {
  padding: 16px 14px 18px;
}

.build-deploy__git .build-deploy__hint {
  min-height: 72px;
}

@media (max-width: 640px) {
  .build-deploy__picker-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.build-deploy__divider {
  display: flex;
  grid-column: 1 / -1;
  gap: var(--space-2);
  align-items: center;
  padding: var(--space-1) 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}

.build-deploy__divider::before,
.build-deploy__divider::after {
  flex: 1;
  border-top: 1px solid var(--color-border);
  content: '';
}

.build-deploy__config {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.build-deploy__handoff-note {
  margin: 0;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.55;
}

.build-deploy__servers {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.build-deploy__server {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  cursor: pointer;
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.build-deploy__server.is-checked {
  background: color-mix(in srgb, var(--color-action) 8%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-action) 40%, var(--color-border));
}

.build-deploy__badge {
  flex: none;
  padding: 2px 8px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  border-radius: var(--radius-pill);
  white-space: nowrap;
}

.build-deploy__badge--testing {
  color: var(--color-text-muted);
  background: var(--color-surface-raised);
}

.build-deploy__badge--ok {
  color: var(--color-success);
  background: color-mix(in srgb, var(--color-success) 14%, transparent);
}

.build-deploy__badge--fail {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 14%, transparent);
}

.build-deploy__path-row {
  display: flex;
  gap: var(--space-2);
  align-items: flex-end;
}

.build-deploy__path-row > :first-child {
  flex: 1;
  min-width: 0;
}

.build-deploy__git {
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}

.build-deploy__git-header {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  margin-bottom: var(--space-2);
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
}

.build-deploy__branch {
  padding: 2px 8px;
  color: var(--color-action);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  background: color-mix(in srgb, var(--color-action) 12%, transparent);
  border-radius: var(--radius-pill);
}

.build-deploy__git-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-height: 72px;
  max-height: 88px;
  overflow-y: auto;
  margin: 0;
  padding: 0;
  list-style: none;
}

.build-deploy__git-item {
  display: flex;
  gap: var(--space-2);
  align-items: baseline;
  font-size: var(--font-size-xs);
}

.build-deploy__git-time {
  flex: none;
  min-width: 50px;
  color: var(--color-text-muted);
}

.build-deploy__git-hash {
  flex: none;
  color: var(--color-action);
  font-family: var(--font-family-mono);
}

.build-deploy__git-msg {
  overflow: hidden;
  color: var(--color-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.build-deploy__error {
  margin: 0;
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.build-deploy__footer-spacer,
.build-deploy__quick-test {
  margin-right: auto;
}
</style>
