// ESLint 守门配置 — 最小高信号规则集
// 定位：拦截真 bug 级问题（重复键/重复声明/不可达代码），不做风格警察。
// 前端是无模块系统的全局函数风格，跨文件引用无法静态分析，故不启用 no-undef / no-unused-vars。
export default [
  {
    ignores: [
      '**/node_modules/**',
      'src/js/vendor/**',
      'src/js/xterm*.js',
      'src/js/sortable.min.js',
      'src-tauri/**',
      'sidecar/data/**',
      'sidecar/data-test/**',
    ],
  },
  {
    // sidecar / scripts：CommonJS，文件自包含，可多查一项未使用变量
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
    // 前端：全局函数式，仅查 bug 级问题
    files: ['src/js/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'script' },
    rules: {
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-redeclare': 'error',
      'no-compare-neg-zero': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
];
