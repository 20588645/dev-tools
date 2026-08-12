import { onMounted, onUnmounted, ref, type Ref } from 'vue'

import { MENU_ORDER_CHANGED_EVENT } from '@/legacy/legacy-bridge'
import { readMenuOrder } from '@/services/modules/settings-service'
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from '@/services/sidebar-chrome'
import type { SortableMenuPage } from '@/router/route-meta'

/**
 * P8-4：侧栏 chrome 状态（折叠 + 菜单序 tick）。
 * 预览默认不 syncBody，避免碰生产侧栏。
 */
export function useSidebarChrome(options: {
  syncBody?: boolean
  persistCollapse?: boolean
} = {}) {
  const syncBody = options.syncBody === true
  const persistCollapse = options.persistCollapse !== false

  const collapsed = ref(
    persistCollapse ? readSidebarCollapsed() : false,
  ) as Ref<boolean>
  const menuOrderVersion = ref(0)

  function setCollapsed(value: boolean) {
    collapsed.value = value
    if (persistCollapse) writeSidebarCollapsed(value, sessionStorage, { syncBody })
  }

  function toggleCollapsed() {
    setCollapsed(!collapsed.value)
  }

  function bumpMenuOrder() {
    menuOrderVersion.value += 1
  }

  function currentMenuOrder(): SortableMenuPage[] {
    void menuOrderVersion.value
    return readMenuOrder()
  }

  onMounted(() => {
    window.addEventListener(MENU_ORDER_CHANGED_EVENT, bumpMenuOrder)
  })

  onUnmounted(() => {
    window.removeEventListener(MENU_ORDER_CHANGED_EVENT, bumpMenuOrder)
  })

  return {
    collapsed,
    menuOrderVersion,
    setCollapsed,
    toggleCollapsed,
    currentMenuOrder,
  }
}
