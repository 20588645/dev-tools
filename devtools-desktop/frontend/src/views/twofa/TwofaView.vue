<script setup lang="ts">
import { computed, ref } from 'vue'

import BaseButton from '@/components/base/BaseButton.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import BaseDisclosure from '@/components/disclosure/BaseDisclosure.vue'
import ConfirmDialog from '@/components/feedback/ConfirmDialog.vue'
import EmptyState from '@/components/feedback/EmptyState.vue'
import ErrorState from '@/components/feedback/ErrorState.vue'
import LoadingState from '@/components/feedback/LoadingState.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'
import FilterChip from '@/components/navigation/FilterChip.vue'
import type { TwofaAccount, TwofaAccountInput } from '@/services/modules/twofa-service'

import TwofaAccountDialog from './components/TwofaAccountDialog.vue'
import TwofaAccountRow from './components/TwofaAccountRow.vue'
import TwofaImportDialog from './components/TwofaImportDialog.vue'
import TwofaPinnedCards from './components/TwofaPinnedCards.vue'
import TwofaQuickDialog from './components/TwofaQuickDialog.vue'
import { useTwofa } from './composables/useTwofa'
import './twofa.css'

defineOptions({ name: 'TwofaView' })


const {
  query,
  activeGroup,
  expandedId,
  copiedId,
  loading,
  refreshing,
  error,
  stats,
  groupOptions,
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
} = useTwofa()

const accountDialogOpen = ref(false)
const importDialogOpen = ref(false)
const quickDialogOpen = ref(false)
const editing = ref<TwofaAccount | null>(null)
const collapsedGroups = ref<string[]>([])
const confirmRemoveOpen = ref(false)
const pendingRemove = ref<TwofaAccount | null>(null)

const removeMessage = computed(() => (
  pendingRemove.value
    ? `「${pendingRemove.value.issuer} · ${pendingRemove.value.accountName}」的密钥会被永久删除，删除后无法再生成该账号的验证码。`
    : ''
))

const groupNames = computed(() => groupOptions.value.filter((item) => item.value).map((item) => item.value))
const hasAccounts = computed(() => stats.value.total > 0)
const hasVisibleResult = computed(() => groupedAccounts.value.length > 0)

function openAdd() {
  editing.value = null
  accountDialogOpen.value = true
}

function openEdit(account: TwofaAccount) {
  editing.value = account
  accountDialogOpen.value = true
}

async function onSubmitAccount(input: TwofaAccountInput, id: string) {
  if (await saveAccount(input, id)) accountDialogOpen.value = false
}

async function onImport(items: TwofaAccountInput[]) {
  if (await importAccounts(items)) importDialogOpen.value = false
}

/** 快捷查询里如果想留存这个密钥，直接转成正式账号 */
async function onSaveFromQuick(input: TwofaAccountInput) {
  if (await saveAccount(input)) quickDialogOpen.value = false
}

// 不能用原生 confirm：Tauri WebView 会禁用它，点击后没有任何反应
function askRemove(account: TwofaAccount) {
  pendingRemove.value = account
  confirmRemoveOpen.value = true
}

async function onConfirmRemove() {
  const account = pendingRemove.value
  if (!account) return
  if (await removeAccount(account)) {
    confirmRemoveOpen.value = false
    pendingRemove.value = null
  }
}

function selectGroup(name: string, selected: boolean) {
  if (selected) setGroup(name)
}

function setGroupExpanded(name: string, expanded: boolean) {
  collapsedGroups.value = expanded
    ? collapsedGroups.value.filter((item) => item !== name)
    : [...new Set([...collapsedGroups.value, name])]
}
</script>

<template>
  <PageFrame class="twofa-view" variant="immersive" data-test="twofa-view">
    <template #top>
      <PageTop>
        <PageHeader title="双因验证" description="密钥本地加密保存，验证码由本机时间生成">
          <template #icon><span class="twofa-view__title-mark">⛨</span></template>
          <template #actions>
            <StatusIndicator :label="status.label" :status="status.status" />
            <BaseButton variant="secondary" @click="quickDialogOpen = true">快捷查询</BaseButton>
            <BaseButton variant="secondary" @click="importDialogOpen = true">批量导入</BaseButton>
            <BaseButton @click="openAdd">添加账号</BaseButton>
          </template>
        </PageHeader>
        <PageToolbar>
          <div class="twofa-toolbar">
            <div class="twofa-toolbar__filters">
              <BaseInput
                v-model="query"
                type="search"
                variant="search"
                class="twofa-toolbar__search"
                aria-label="搜索账号"
                placeholder="搜索发行方或账号"
              />
              <div class="twofa-chips" role="group" aria-label="分组筛选">
                <FilterChip
                  v-for="option in groupOptions"
                  :key="option.value || 'all'"
                  :label="option.label"
                  :count="option.count"
                  :selected="activeGroup === option.value"
                  :aria-label="`筛选${option.label}，${option.count} 个账号`"
                  @update:selected="selectGroup(option.value, $event)"
                />
              </div>
            </div>
            <div class="twofa-toolbar__actions">
              <BaseButton variant="ghost" size="sm" :loading="refreshing" @click="load(true)">刷新</BaseButton>
            </div>
          </div>
        </PageToolbar>
      </PageTop>
    </template>

    <div class="twofa-view__scroll">
      <LoadingState v-if="loading && !hasAccounts" label="正在读取 2FA 账号…" />
      <ErrorState
        v-else-if="error && !hasAccounts"
        title="2FA 账号读取失败"
        :description="error"
        @retry="load()"
      />
      <EmptyState
        v-else-if="!hasAccounts"
        title="还没有任何账号"
        description="先添加一个账号，或导入已有的 otpauth / JSON 数据"
      >
        <template #actions>
          <BaseButton @click="openAdd">添加账号</BaseButton>
        </template>
      </EmptyState>

      <div v-else class="twofa-board">
        <TwofaPinnedCards :accounts="pinned" :remaining-of="remainingOf" @copy="copyCode" />

        <section aria-label="全部账号">
          <div class="twofa-section-heading">
            <h2>全部账号</h2>
            <span>{{ summaryLabel }}</span>
          </div>

          <EmptyState v-if="!hasVisibleResult" compact title="没有匹配的账号" />

          <div v-else class="twofa-groups">
            <BaseDisclosure
              v-for="group in groupedAccounts"
              :key="group.name"
              :model-value="!collapsedGroups.includes(group.name)"
              class="twofa-group"
              variant="plain"
              header-padding="7px 2px"
              content-gap="0"
              content-padding="0"
              @update:model-value="setGroupExpanded(group.name, $event)"
            >
              <template #header>
                <span class="twofa-group__label">
                  <b>{{ group.name }}</b>
                  <span>{{ group.accounts.length }}</span>
                </span>
              </template>
              <div class="twofa-group__rows">
                <TwofaAccountRow
                  v-for="account in group.accounts"
                  :key="account.id"
                  :account="account"
                  :remaining="remainingOf(account)"
                  :expanded="expandedId === account.id"
                  :copied="copiedId === account.id"
                  @toggle="toggleExpanded(account.id)"
                  @copy="copyCode(account)"
                  @edit="openEdit(account)"
                  @favorite="toggleFavorite(account)"
                  @remove="askRemove(account)"
                />
              </div>
            </BaseDisclosure>
          </div>
        </section>

        <p class="twofa-footnote">密钥仅本地加密保存 · 验证码由当前本机时间生成</p>
      </div>
    </div>

    <TwofaAccountDialog
      v-model="accountDialogOpen"
      :account="editing"
      :groups="groupNames"
      @submit="onSubmitAccount"
    />
    <TwofaImportDialog v-model="importDialogOpen" @submit="onImport" />
    <TwofaQuickDialog v-model="quickDialogOpen" @save="onSaveFromQuick" />
    <ConfirmDialog
      v-model="confirmRemoveOpen"
      title="删除这个 2FA 账号？"
      :message="removeMessage"
      confirm-text="删除账号"
      tone="danger"
      @confirm="onConfirmRemove"
    />
  </PageFrame>
</template>
