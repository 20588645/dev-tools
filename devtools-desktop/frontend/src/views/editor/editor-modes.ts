/** 扩展名 → CodeMirror mode / 语言展示名（对齐 legacy editor.js） */

export const ED_MODE_MAP: Record<string, string> = {
  js: 'text/javascript', mjs: 'text/javascript', cjs: 'text/javascript', jsx: 'text/jsx',
  ts: 'text/typescript', tsx: 'text/typescript',
  json: 'application/json',
  html: 'htmlmixed', htm: 'htmlmixed',
  vue: 'text/x-vue',
  css: 'text/css', scss: 'text/x-scss', less: 'text/x-less',
  xml: 'application/xml', svg: 'application/xml', plist: 'application/xml',
  py: 'text/x-python',
  md: 'text/x-markdown', markdown: 'text/x-markdown',
  sh: 'text/x-sh', bash: 'text/x-sh', zsh: 'text/x-sh',
  yml: 'text/x-yaml', yaml: 'text/x-yaml',
  sql: 'text/x-sql',
  go: 'text/x-go',
  rs: 'text/x-rustsrc',
  php: 'application/x-httpd-php',
  c: 'text/x-csrc', h: 'text/x-csrc',
  cpp: 'text/x-c++src', cc: 'text/x-c++src', hpp: 'text/x-c++src',
  java: 'text/x-java',
}

export const ED_LANG_LABEL: Record<string, string> = {
  'text/javascript': 'JavaScript', 'text/jsx': 'JSX', 'text/typescript': 'TypeScript',
  'application/json': 'JSON', htmlmixed: 'HTML', 'text/x-vue': 'Vue',
  'text/css': 'CSS', 'text/x-scss': 'SCSS', 'text/x-less': 'Less',
  'application/xml': 'XML', 'text/x-python': 'Python', 'text/x-markdown': 'Markdown',
  'text/x-sh': 'Shell', 'text/x-yaml': 'YAML', 'text/x-sql': 'SQL',
  'text/x-go': 'Go', 'text/x-rustsrc': 'Rust', 'application/x-httpd-php': 'PHP',
  'text/x-csrc': 'C', 'text/x-c++src': 'C++', 'text/x-java': 'Java',
}

export function edModeForExt(ext: string | undefined | null): string | null {
  return ED_MODE_MAP[(ext || '').toLowerCase()] || null
}

export function edLangLabelForExt(ext: string | undefined | null): string {
  const mode = edModeForExt(ext)
  return (mode && ED_LANG_LABEL[mode]) || '纯文本'
}

export function edThemeName(): string {
  return document.body.getAttribute('data-theme') === 'light' ? 'default' : 'material-darker'
}

export const ED_TABS_LS_KEY = 'devtools-editor-tabs'
