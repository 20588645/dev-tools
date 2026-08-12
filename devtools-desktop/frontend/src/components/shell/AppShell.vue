<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppLayout from '@/components/layout/AppLayout.vue'
import ProjectIntroDialog from '@/components/shell/ProjectIntroDialog.vue'
import { useSidebarChrome } from '@/composables/useSidebarChrome'
import AppShellServices from '@/legacy/AppShellServices.vue'
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
  syncBody: false,
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
          :id="`page-${String(viewRoute.meta.pageId || 'home')}`"
          :key="String(viewRoute.meta.keepAliveName || viewRoute.name || viewRoute.path)"
          class="page active"
        />
      </KeepAlive>
    </RouterView>
  </AppLayout>
  <AppShellServices />
  <ProjectIntroDialog v-model="introOpen" />
</template>

<style>
.main-content.router-main > .page.active {
  display: flex !important;
  width: 100%;
  min-width: 0;
  flex: 1 1 auto;
  min-height: 0;
}

.main-content.home-active.router-main > .page.active {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
}
</style>
