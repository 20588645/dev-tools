import { computed, ref, watch, type Ref } from 'vue'

import { getHealth } from '@/services/modules/settings-service'

export type IntroSidecarTone = 'ok' | 'warn' | 'danger' | ''

const FALLBACK_VERSION = '0.1.93'

export function useProjectIntro(visible: Ref<boolean>) {
  const version = ref('读取中')
  const sidecarLabel = ref('读取中')
  const sidecarTone = ref<IntroSidecarTone>('')

  const sidecarClass = computed(() => {
    if (sidecarTone.value === 'ok') return 'ok'
    if (sidecarTone.value === 'warn') return 'warn'
    if (sidecarTone.value === 'danger') return 'danger'
    return ''
  })

  async function refresh() {
    version.value = '读取中'
    sidecarLabel.value = '读取中'
    sidecarTone.value = ''
    try {
      const health = await getHealth()
      version.value = health.version || FALLBACK_VERSION
      const status = (health.status || '').toLowerCase()
      if (status === 'ok' || status === 'healthy' || status === 'up') {
        sidecarLabel.value = '正常'
        sidecarTone.value = 'ok'
      } else if (status) {
        sidecarLabel.value = health.status
        sidecarTone.value = 'warn'
      } else {
        sidecarLabel.value = '未知'
        sidecarTone.value = 'warn'
      }
    } catch {
      version.value = FALLBACK_VERSION
      sidecarLabel.value = '未连接'
      sidecarTone.value = 'danger'
    }
  }

  watch(() => visible.value, (open) => {
    if (open) void refresh()
  })

  return {
    version,
    sidecarLabel,
    sidecarClass,
    refresh,
  }
}
