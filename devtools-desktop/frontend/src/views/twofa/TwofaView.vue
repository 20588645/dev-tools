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
import BaseSegmented, { type SegmentOption } from '@/components/navigation/BaseSegmented.vue'
import type { TwofaAccount, TwofaAccountInput } from '@/services/modules/twofa-service'

import TwofaAccountDialog from './components/TwofaAccountDialog.vue'
import TwofaCodeCard from './components/TwofaCodeCard.vue'
import TwofaImportDialog from './components/TwofaImportDialog.vue'
import TwofaQuickDialog from './components/TwofaQuickDialog.vue'
import { useTwofa } from './composables/useTwofa'
import './twofa.css'

defineOptions({ name: 'TwofaView' })

const {
  query,
  activeGroup,
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
const pinnedExpanded = ref(true)
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

/** 原型 toolbar 分段器：全部 N / 分组 N（值用 __all 占位，BaseSegmented 不接受空串） */
const groupSegments = computed<SegmentOption[]>(() => groupOptions.value.map((option) => ({
  label: `${option.label} ${option.count}`,
  value: option.value || '__all',
})))

function onGroupSegment(value: string) {
  setGroup(value === '__all' ? '' : value)
}

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

/** 编辑弹窗里点「删除账号」：先收起弹窗再走确认 */
function askRemoveFromDialog() {
  if (!editing.value) return
  accountDialogOpen.value = false
  askRemove(editing.value)
}

async function onConfirmRemove() {
  const account = pendingRemove.value
  if (!account) return
  if (await removeAccount(account)) {
    confirmRemoveOpen.value = false
    pendingRemove.value = null
  }
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
        <PageHeader title="双因验证" description="TOTP 验证码 · 本机生成 · 点击验证码复制">
          <template #icon><span class="twofa-view__title-mark">⛨</span></template>
          <template #actions>
            <StatusIndicator :label="status.label" :status="status.status" />
            <BaseButton variant="secondary" @click="quickDialogOpen = true">快捷查询</BaseButton>
            <BaseButton variant="secondary" @click="importDialogOpen = true">批量导入</BaseButton>
            <BaseButton @click="openAdd">＋ 添加账号</BaseButton>
          </template>
        </PageHeader>
        <PageToolbar>
          <div class="twofa-toolbar">
            <BaseInput
              v-model="query"
              type="search"
              variant="search"
              class="twofa-toolbar__search"
              aria-label="搜索账号"
              placeholder="搜索账号 / 发行方…"
            />
            <BaseSegmented
              :model-value="activeGroup || '__all'"
              :options="groupSegments"
              aria-label="分组筛选"
              @update:model-value="onGroupSegment($event as string)"
            />
            <span class="twofa-toolbar__grow" aria-hidden="true" />
            <BaseButton variant="ghost" size="sm" :loading="refreshing" @click="load(true)">刷新</BaseButton>
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
        <!-- 置顶与分组共用 run/deploy 同款 panel 分区容器，三页观感一致 -->
        <BaseDisclosure
          v-if="pinned.length"
          v-model="pinnedExpanded"
          class="twofa-pinned"
          variant="panel"
          header-padding="10px 0 5px"
          header-min-height="34px"
          content-gap="0"
          content-padding="6px 18px 16px"
        >
          <template #header>
            <span class="twofa-group__label">
              <b>📌 置顶</b>
              <span class="twofa-group__count">{{ pinned.length }}</span>
            </span>
          </template>
          <div class="twofa-grid">
            <TwofaCodeCard
              v-for="account in pinned"
              :key="`pinned-${account.id}`"
              class="twofa-pinned__card"
              :account="account"
              :remaining="remainingOf(account)"
              :copied="copiedId === account.id"
              @copy="copyCode(account)"
              @edit="openEdit(account)"
              @favorite="toggleFavorite(account)"
            />
          </div>
        </BaseDisclosure>

        <EmptyState v-if="!hasVisibleResult" compact title="没有匹配的账号" />

        <BaseDisclosure
          v-for="group in groupedAccounts"
          :key="group.name"
          :model-value="!collapsedGroups.includes(group.name)"
          class="twofa-group"
          variant="panel"
          header-padding="10px 0 5px"
          header-min-height="34px"
          content-gap="0"
          content-padding="6px 18px 16px"
          @update:model-value="setGroupExpanded(group.name, $event)"
        >
          <template #header>
            <span class="twofa-group__label">
              <b>{{ group.name }}</b>
              <span class="twofa-group__count">{{ group.accounts.length }}</span>
            </span>
          </template>
          <div class="twofa-grid">
            <TwofaCodeCard
              v-for="account in group.accounts"
              :key="account.id"
              :account="account"
              :remaining="remainingOf(account)"
              :copied="copiedId === account.id"
              @copy="copyCode(account)"
              @edit="openEdit(account)"
              @favorite="toggleFavorite(account)"
            />
          </div>
        </BaseDisclosure>

        <p class="twofa-footnote">{{ summaryLabel }} · 密钥仅本地加密保存 · 验证码由当前本机时间生成</p>
      </div>
    </div>

    <TwofaAccountDialog
      v-model="accountDialogOpen"
      :account="editing"
      :groups="groupNames"
      @submit="onSubmitAccount"
      @remove="askRemoveFromDialog"
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
