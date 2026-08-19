<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppLayout from '@/components/layout/AppLayout.vue'
import AppShellServices from '@/components/shell/AppShellServices.vue'
import ProjectIntroDialog from '@/components/shell/ProjectIntroDialog.vue'
import { useSidebarChrome } from '@/composables/useSidebarChrome'
import { keepAliveNamesFromCatalog } from '@/router/route-meta'

defineOptions({ name: 'AppShell' })

const route = useRoute()
const router = useRouter()
const keepAliveInclude = keepAliveNamesFromCatalog()
const introOpen = ref(false)

const activePageId = computed(() => String(route.meta.pageId ?? 'home'))
const isHome = computed(() => activePageId.value === 'home')
const contentClass = computed(() => ({
  'home-active': isHome.value,
  'router-main': true,
}))

const { collapsed, setCollapsed } = useSidebarChrome({
  persistCollapse: true,
})

function onNavigate(_pageId: string, path: string) {
  void router.push(path)
}

function onIntro() {
  introOpen.value = true
}
</script>

<template>
  <AppLayout
    :active-page-id="activePageId"
    :collapsed="collapsed"
    :content-class="contentClass"
    @update:collapsed="setCollapsed"
    @navigate="onNavigate"
    @intro="onIntro"
  >
    <RouterView v-slot="{ Component, route: viewRoute }">
      <KeepAlive :include="keepAliveInclude">
        <component
          :is="Component"
          :key="String(viewRoute.meta.keepAliveName || viewRoute.name || viewRoute.path)"
          class="page"
          :data-page-id="String(viewRoute.meta.pageId || 'home')"
        />
      </KeepAlive>
    </RouterView>
  </AppLayout>
  <AppShellServices />
  <ProjectIntroDialog v-model="introOpen" />
</template>

<style>
/* 页头由 PageTop 承担、不参与滚动；正文在 PageBody 内独立滚动。 */
.page {
  display: flex;
  flex-direction: column;
  width: 100%;
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 0;
  animation: pageEnter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.main-content.router-main > .page {
  display: flex;
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.main-content.home-active.router-main > .page {
  flex: 1 1 auto;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
</style>
