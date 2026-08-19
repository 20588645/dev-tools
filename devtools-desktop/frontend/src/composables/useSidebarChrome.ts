import { onMounted, onUnmounted, ref, type Ref } from 'vue'

import { MENU_ORDER_CHANGED_EVENT } from '@/services/app-events'
import { readMenuOrder } from '@/services/modules/settings-service'
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from '@/services/sidebar-chrome'
import type { SortableMenuPage } from '@/router/route-meta'

/** 侧栏折叠状态与菜单序刷新。 */
export function useSidebarChrome(options: {
  persistCollapse?: boolean
} = {}) {
  const persistCollapse = options.persistCollapse !== false

  const collapsed = ref(
    persistCollapse ? readSidebarCollapsed() : false,
  ) as Ref<boolean>
  const menuOrderVersion = ref(0)

  function setCollapsed(value: boolean) {
    collapsed.value = value
    if (persistCollapse) writeSidebarCollapsed(value)
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
