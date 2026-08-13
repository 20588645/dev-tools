import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend/src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['frontend/src/**/*.test.ts', 'sidecar/**/*.test.mjs'],
    clearMocks: true,
    // 路由测试首次 push 会触发视图组件链的动态 import；全量并行跑时
    // 冷转换偶发超过默认 5s 造成假失败，放宽到 15s（不影响通过用例的速度）。
    testTimeout: 15_000,
  },
})
