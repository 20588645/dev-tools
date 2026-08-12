import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

// ESLint 守门配置：旧代码保留高信号 bug 规则，新 Vue/TypeScript 代码使用官方推荐规则。
const vueFiles = ['frontend/src/**/*.vue'];
const typescriptFiles = ['frontend/src/**/*.ts', 'tests/**/*.ts', '*.config.ts'];

export default [
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'src-tauri/**',
      'sidecar/data/**',
      'sidecar/data-test/**',
    ],
  },
  {
    // sidecar / 旧 scripts：CommonJS，文件自包含，可多查一项未使用变量
    files: ['sidecar/**/*.js', 'scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs' },
    rules: {
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-redeclare': 'error',
      'no-compare-neg-zero': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      'no-dupe-keys': 'error',
      'no-unreachable': 'error',
      'no-redeclare': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },
  ...pluginVue.configs['flat/essential'].map(config => ({
    ...config,
    files: vueFiles,
  })),
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: typescriptFiles,
  })),
  {
    files: vueFiles,
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 2023,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: typescriptFiles,
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['frontend/src/views/**/*.vue', 'frontend/src/views/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: 'naive-ui',
            message: '业务页面只能使用项目 Base 组件或适配层，禁止直接导入 Naive UI。',
          },
          {
            name: 'element-plus',
            message: '业务页面只能使用项目 Base 组件或适配层，禁止直接导入第三方 UI 库。',
          },
        ],
      }],
    },
  },
];
