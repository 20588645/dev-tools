import {
  EXPERIMENTAL_SETTING_CHANGED_EVENT,
  type ExperimentalSettingChangedDetail,
} from '@/legacy/legacy-bridge'
import { showAppToast } from '@/services/app-toast'
import { readExperimentalPreferences } from '@/services/modules/settings-service'

const LIVE2D_SCRIPT_ID = 'live2d-widget-script'
const LIVE2D_SCRIPT_SRC = 'https://fastly.jsdelivr.net/npm/live2d-widgets@1.0.0/dist/autoload.js'
const LIVE2D_RESTORE_DELAY = 1_500

const PARTICLE_COLORS = [
  'rgba(167, 139, 250, 0.9)',
  'rgba(129, 140, 248, 0.9)',
  'rgba(96, 165, 250, 0.85)',
  'rgba(52, 211, 153, 0.85)',
  'rgba(251, 191, 36, 0.85)',
  'rgba(244, 114, 182, 0.9)',
  'rgba(248, 113, 113, 0.85)',
]
const PARTICLE_COUNT = 7

function handleClickParticle(event: MouseEvent) {
  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const particle = document.createElement('div')
    const angle = (Math.PI * 2 * index) / PARTICLE_COUNT + (Math.random() - 0.5) * 0.8
    const distance = 30 + Math.random() * 40
    const size = 4 + Math.random() * 4
    particle.className = 'click-particle'
    particle.style.left = `${event.clientX}px`
    particle.style.top = `${event.clientY}px`
    particle.style.width = `${size}px`
    particle.style.height = `${size}px`
    particle.style.backgroundColor = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]
    particle.style.setProperty('--tx', `${Math.cos(angle) * distance}px`)
    particle.style.setProperty('--ty', `${Math.sin(angle) * distance}px`)
    document.body.appendChild(particle)
    particle.addEventListener('animationend', () => particle.remove())
  }
}

function setLive2dEnabled(enabled: boolean) {
  const waifu = document.getElementById('waifu')
  if (!enabled) {
    if (waifu) waifu.style.display = 'none'
    return
  }
  if (waifu) {
    waifu.style.display = ''
    return
  }
  if (document.getElementById(LIVE2D_SCRIPT_ID)) return
  const script = document.createElement('script')
  script.id = LIVE2D_SCRIPT_ID
  script.src = LIVE2D_SCRIPT_SRC
  script.onerror = () => {
    console.warn('Live2D 看板娘加载失败，请检查网络连接')
    showAppToast('看板娘加载失败', '请检查网络连接', { tone: 'warning' })
  }
  document.body.appendChild(script)
}

/**
 * 实验功能副作用（Live2D 看板娘 / 点击粒子）。P9-4 自 `app.js` 迁入。
 *
 * 持久化归设置页（`writeExperimentalPreference`），本服务只负责：
 * 启动时按存量偏好恢复效果，以及响应设置页的开关事件。
 */
export function createExperimentalEffectsService() {
  let started = false
  let clickEffectActive = false
  let live2dRestoreTimer: ReturnType<typeof setTimeout> | null = null

  function setClickEffectEnabled(enabled: boolean) {
    if (enabled === clickEffectActive) return
    clickEffectActive = enabled
    if (enabled) document.addEventListener('click', handleClickParticle, true)
    else document.removeEventListener('click', handleClickParticle, true)
  }

  function onSettingChanged(event: Event) {
    const detail = (event as CustomEvent<ExperimentalSettingChangedDetail>).detail
    if (!detail) return
    if (detail.key === 'live2d') setLive2dEnabled(Boolean(detail.enabled))
    if (detail.key === 'click-effect') setClickEffectEnabled(Boolean(detail.enabled))
  }

  function start() {
    if (started) return
    started = true
    const prefs = readExperimentalPreferences()
    if (prefs.live2dEnabled) {
      // 延迟恢复：看板娘是纯装饰，让业务首屏先完成
      live2dRestoreTimer = setTimeout(() => {
        live2dRestoreTimer = null
        setLive2dEnabled(true)
      }, LIVE2D_RESTORE_DELAY)
    }
    if (prefs.clickEffectEnabled) setClickEffectEnabled(true)
    window.addEventListener(EXPERIMENTAL_SETTING_CHANGED_EVENT, onSettingChanged)
  }

  function stop() {
    if (!started) return
    started = false
    if (live2dRestoreTimer) {
      clearTimeout(live2dRestoreTimer)
      live2dRestoreTimer = null
    }
    setClickEffectEnabled(false)
    window.removeEventListener(EXPERIMENTAL_SETTING_CHANGED_EVENT, onSettingChanged)
  }

  return { start, stop }
}
