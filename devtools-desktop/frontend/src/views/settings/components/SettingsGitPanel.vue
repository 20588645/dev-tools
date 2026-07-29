<script setup lang="ts">
import BaseButton from '@/components/base/BaseButton.vue'
import BaseIconButton from '@/components/base/BaseIconButton.vue'
import BaseInput from '@/components/form/BaseInput.vue'

import type { SettingsController } from '../composables/useSettings'

const props = defineProps<{ controller: SettingsController }>()
const { gitDraft, gitDirty, gitSaveState } = props.controller
</script>

<template>
  <section class="settings-category-panel" aria-labelledby="settingsGitTitle">
    <div class="settings-panel-heading">
      <div><h2 id="settingsGitTitle">Git 活动</h2><p>供工时内容查询提交记录使用</p></div>
      <span>{{ gitDraft.repos.length }} REPOSITORIES</span>
    </div>

    <article class="settings-card settings-git-card" data-setting-id="git-config" tabindex="-1">
      <div class="settings-git-fields">
        <BaseInput
          v-model="gitDraft.token"
          type="password"
          label="GitLab Private Token"
          autocomplete="new-password"
          help-text="保存在本地 SQLite，本阶段不宣称加密存储"
        />
        <BaseInput
          v-model="gitDraft.author"
          label="默认作者"
          placeholder="例如 Ledy"
          help-text="用于过滤提交记录"
        />
      </div>
      <header class="settings-card__heading">
        <h3>仓库列表</h3>
        <BaseButton size="sm" variant="ghost" @click="controller.addRepository">＋ 添加仓库</BaseButton>
      </header>
      <div class="settings-repository-table">
        <div v-if="!gitDraft.repos.length" class="settings-repository-empty">暂无仓库，点击“添加仓库”开始配置</div>
        <div v-for="(repo, index) in gitDraft.repos" :key="index" class="settings-repository-row">
          <BaseInput
            :model-value="repo.repo"
            type="url"
            :aria-label="`仓库 ${index + 1} 地址`"
            placeholder="https://gitlab.example.com/group/project.git"
            @update:model-value="controller.updateRepository(index, 'repo', $event)"
          />
          <BaseInput
            :model-value="repo.branch"
            :aria-label="`仓库 ${index + 1} 分支`"
            placeholder="分支"
            @update:model-value="controller.updateRepository(index, 'branch', $event)"
          />
          <BaseInput
            :model-value="repo.group"
            :aria-label="`仓库 ${index + 1} 分组`"
            placeholder="分组"
            @update:model-value="controller.updateRepository(index, 'group', $event)"
          />
          <BaseIconButton
            class="settings-subtle-danger-action"
            :label="`删除仓库 ${index + 1}`"
            variant="ghost"
            size="sm"
            @click="controller.removeRepository(index)"
          >×</BaseIconButton>
        </div>
      </div>
      <footer class="settings-form-footer">
        <span class="settings-save-state" :class="{ 'is-dirty': gitDirty, 'is-error': gitSaveState === 'error' }">
          <i />{{ gitSaveState === 'working' ? '正在保存' : gitSaveState === 'error' ? '保存失败' : gitDirty ? '有未保存修改' : '配置已保存' }}
        </span>
        <BaseButton size="sm" :loading="gitSaveState === 'working'" :disabled="!gitDirty" @click="controller.saveGitConfig">保存配置</BaseButton>
      </footer>
    </article>
  </section>
</template>
