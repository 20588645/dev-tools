import { createApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

import App from './App.vue'
import { installUiLibrary } from './plugins/ui-library'
import { createAppRouter } from './router'
import { setAppRouter } from './router/navigate'
import { startRealtime } from './services/realtime'
import './styles/base.css'
import './styles/effects.css'
import './styles/tokens/index.css'

const pinia = createPinia()
setActivePinia(pinia)
// 共享 WS 单例须在应用壳挂载前就绪：常驻服务 onMounted 即注册处理器
startRealtime()

const router = createAppRouter()
setAppRouter(router)

const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(installUiLibrary)
app.mount('#app')
