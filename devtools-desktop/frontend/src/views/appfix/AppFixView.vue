<script setup lang="ts">
import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseCard from '@/components/base/BaseCard.vue'
import StatusIndicator from '@/components/base/StatusIndicator.vue'
import BaseInput from '@/components/form/BaseInput.vue'
import PageFrame from '@/components/layout/PageFrame.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PageToolbar from '@/components/layout/PageToolbar.vue'
import PageTop from '@/components/layout/PageTop.vue'

import { useAppFix } from './composables/useAppFix'
import './appfix.css'

defineOptions({ name: 'AppFixView' })

const useCases = [
  '刚下载的第三方应用提示「已损坏，无法打开」',
  '从浏览器或网盘保存后，双击被系统拦住',
  '装完后桌面上还挂着安装镜像',
]

const willDo = [
  '确认路径是完整的 .app 应用包',
  '清除隔离属性，必要时拷到「应用程序」',
  '只推出磁盘映像（DMG），不碰外置硬盘',
]

const willNot = [
  '不会关闭系统完整性保护（SIP）',
  '不会打开「任何来源」',
  '不会改签名，也不会删除 .dmg 安装包',
]

const steps = [
  '拖入、选取或粘贴路径',
  '校验应用包是否完整',
  '清除隔离后，再打开一次',
  '需要的话推出安装镜像',
]

const {
  path,
  dragging,
  loading,
  settling,
  busy,
  error,
  validationError,
  result,
  images,
  related,
  status,
  summary,
  repair,
  settle,
  eject,
  pickApp,
  handleHtmlDrop,
  setDragging,
} = useAppFix()
</script>

<template>
  <PageFrame class="app-fix-view">
    <template #top>
      <PageTop>
        <PageHeader title="修复损坏" description="清除隔离属性，并可推出还挂着的安装镜像">
          <template #actions>
            <StatusIndicator :label="status.label" :status="status.status" />
          </template>
        </PageHeader>
        <PageToolbar>
          <form class="app-fix-toolbar" @submit.prevent="repair()">
            <BaseInput
              class="app-fix-toolbar__input"
              :model-value="path"
              variant="search"
              ariaLabel="应用路径"
              placeholder="/Applications/示例.app"
              :error="validationError"
              :disabled="busy"
              @update:model-value="path = $event"
            />
            <BaseButton variant="secondary" :disabled="busy" @click="pickApp">选取应用</BaseButton>
            <BaseButton type="submit" :loading="loading" :disabled="settling">开始修复</BaseButton>
          </form>
        </PageToolbar>
      </PageTop>
    </template>

    <div
      class="app-fix-board"
      :class="{ 'is-dragging': dragging }"
      @dragenter.prevent="setDragging(true)"
      @dragover.prevent="setDragging(true)"
      @dragleave.prevent="setDragging(false)"
      @drop.prevent="handleHtmlDrop($event)"
    >
      <BaseCard class="app-fix-drop" fill-height content-layout="fill">
        <div class="app-fix-drop__body">
          <span class="app-fix-drop__mark" aria-hidden="true">⌘</span>
          <strong>把 .app 拖到这里</strong>
          <p>也可点「选取应用」，或把 Finder 里的完整路径粘贴到上方。</p>
        </div>
      </BaseCard>

      <BaseCard
        class="app-fix-panel"
        :class="{ 'app-fix-result': Boolean(result) && !error, 'app-fix-result--error': Boolean(error) }"
        fill-height
        content-layout="fill"
        :role="error ? 'alert' : result ? 'status' : undefined"
      >
        <header class="app-fix-panel__head">
          <h2>{{ error ? '未能修复' : result ? '修复结果' : '这次会怎么处理' }}</h2>
          <BaseBadge :tone="error ? 'danger' : result ? 'success' : images.length ? 'warning' : 'info'">
            {{ error ? '失败' : result ? '已处理' : images.length ? `${images.length} 个镜像` : '4 步' }}
          </BaseBadge>
        </header>

        <div v-if="error" class="app-fix-panel__body">
          <p>{{ error }}</p>
          <BaseButton variant="secondary" size="sm" :disabled="busy" @click="repair()">重试</BaseButton>
        </div>

        <div v-else-if="result" class="app-fix-panel__body">
          <strong>{{ summary }}</strong>
          <p>{{ result.name }}</p>
          <p class="app-fix-panel__path">{{ result.path }}</p>
          <p v-if="result.cleared.length">已清除：{{ result.cleared.join('、') }}</p>
          <p v-else>根目录当前没有扩展属性。</p>
          <p class="app-fix-panel__next">
            {{ related?.onImage
              ? '应用还在安装镜像里。拷到「应用程序」后再推出镜像。'
              : related
                ? `安装镜像「${related.image.volumeName || related.image.apps[0]?.name || '安装镜像'}」还挂着，可以推出。`
                : '下一步：回到 Finder 再打开一次这个应用。' }}
          </p>
          <div v-if="related" class="app-fix-panel__actions">
            <BaseButton size="sm" :loading="settling" @click="settle()">
              {{ related.onImage ? '拷到应用程序并推出' : '推出安装镜像' }}
            </BaseButton>
          </div>
        </div>

        <ol v-else class="app-fix-steps">
          <li v-for="(step, index) in steps" :key="step">
            <span>{{ index + 1 }}</span>
            {{ step }}
          </li>
        </ol>
        <div v-if="!error && !result && images.length" class="app-fix-images">
          <h3>已挂载的安装镜像</h3>
          <ul>
            <li v-for="image in images" :key="image.mounts[0]?.mountPoint || image.imagePath">
              <div>
                <strong>{{ image.volumeName || image.imageName }}</strong>
                <p>{{ image.apps.map((app) => app.name).join('、') || '安装镜像' }}</p>
              </div>
              <BaseButton
                variant="secondary"
                size="sm"
                :loading="settling"
                @click="eject(image.mounts[0]?.mountPoint || '')"
              >
                推出
              </BaseButton>
            </li>
          </ul>
        </div>
      </BaseCard>

      <BaseCard class="app-fix-panel" fill-height content-layout="fill">
        <header class="app-fix-panel__head">
          <h2>适用场景</h2>
          <BaseBadge>何时用</BaseBadge>
        </header>
        <ul class="app-fix-list">
          <li v-for="item in useCases" :key="item">{{ item }}</li>
        </ul>
      </BaseCard>

      <BaseCard class="app-fix-panel" fill-height content-layout="fill">
        <header class="app-fix-panel__head">
          <h2>实际会做</h2>
          <BaseBadge tone="info">范围</BaseBadge>
        </header>
        <ul class="app-fix-list">
          <li v-for="item in willDo" :key="item">{{ item }}</li>
        </ul>
      </BaseCard>

      <BaseCard class="app-fix-panel" fill-height content-layout="fill">
        <header class="app-fix-panel__head">
          <h2>明确不做</h2>
          <BaseBadge tone="warning">边界</BaseBadge>
        </header>
        <ul class="app-fix-list">
          <li v-for="item in willNot" :key="item">{{ item }}</li>
        </ul>
      </BaseCard>
    </div>
  </PageFrame>
</template>
