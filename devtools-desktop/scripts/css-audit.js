/**
 * CSS 普查脚本（只读分析，不修改任何文件）
 * 范围：src/css 下全部业务样式文件（base、layout、components、pages 目录、overrides；排除 vendor 的 xterm.css）
 * 输出：重复定义清单（同文件同上下文同选择器）、疑似死代码清单、!important 分布、硬编码颜色统计
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../src');
const CSS_DIR = path.join(ROOT, 'css');
const VENDOR_CSS = new Set(['xterm.css']);

const cssFiles = [];
const walkCss = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) walkCss(full);
    else if (f.name.endsWith('.css') && !VENDOR_CSS.has(f.name)) cssFiles.push(full);
  }
};
walkCss(CSS_DIR);
cssFiles.sort();

// ---------- 1. 解析全部 CSS：提取规则（文件 + selector + 行号 + media 上下文） ----------
const rules = [];
let totalLines = 0, totalBytes = 0, importantCount = 0;
const hexFreq = new Map();
let hexTotal = 0;
const perFile = [];

for (const file of cssFiles) {
  const rel = path.relative(CSS_DIR, file);
  const raw = fs.readFileSync(file, 'utf8');
  totalLines += raw.split('\n').length;
  totalBytes += raw.length;
  const fileImportant = (raw.match(/!important/g) || []).length;
  importantCount += fileImportant;
  for (const h of raw.match(/#[0-9a-fA-F]{3,8}\b/g) || []) {
    hexFreq.set(h.toLowerCase(), (hexFreq.get(h.toLowerCase()) || 0) + 1);
    hexTotal++;
  }
  // 注释置空但保留换行，保证行号准确
  const css = raw.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  let buf = '', line = 1, depth = 0, inKeyframes = 0, count = 0;
  const mediaStack = [];
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '\n') line++;
    if (c === '{') {
      const sel = buf.replace(/\s+/g, ' ').trim();
      buf = '';
      depth++;
      if (/^@(media|supports)/.test(sel)) mediaStack.push({ sel, depth });
      else if (/^@keyframes/.test(sel)) { if (!inKeyframes) inKeyframes = depth; }
      else if (!inKeyframes && !sel.startsWith('@') && sel) {
        rules.push({ file: rel, selector: sel, line, media: mediaStack.map(m => m.sel).join(' ') });
        count++;
      }
    } else if (c === '}') {
      if (inKeyframes && depth === inKeyframes) inKeyframes = 0;
      if (mediaStack.length && depth === mediaStack[mediaStack.length - 1].depth) mediaStack.pop();
      depth--;
      buf = '';
    } else buf += c;
  }
  perFile.push({ file: rel, lines: raw.split('\n').length, rules: count, important: fileImportant });
}

// ---------- 2. 收集全源码 token（HTML + 全部 JS 含 vendor），含动态前缀 ----------
const legacyHtml = path.resolve(__dirname, '../frontend/index.html');
const sources = [legacyHtml];
const walkJs = (dir) => {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) walkJs(full);
    else if (f.name.endsWith('.js')) sources.push(full);
  }
};
walkJs(path.join(ROOT, 'js'));
const tokens = new Set();
const prefixes = new Set();
for (const f of sources) {
  const text = fs.readFileSync(f, 'utf8');
  for (const m of text.matchAll(/[a-zA-Z_][\w-]*/g)) tokens.add(m[0]);
  // 模板字符串动态类名前缀：class="xxx-${...}" 之类
  for (const m of text.matchAll(/([a-zA-Z][\w-]*-)\$\{/g)) prefixes.add(m[1]);
}
const isNameUsed = (name) => {
  if (tokens.has(name)) return true;
  for (const p of prefixes) if (name.startsWith(p)) return true;
  return false;
};

// ---------- 3. 重复定义（同文件 + 同 media 上下文 + 同 selector；跨文件同选择器是分层覆盖的合法形态） ----------
const byKey = new Map();
for (const r of rules) {
  const key = r.file + ' :: ' + (r.media ? r.media + ' || ' : '') + r.selector;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(r.line);
}
const dups = [...byKey.entries()].filter(([, lines]) => lines.length > 1)
  .sort((a, b) => b[1].length - a[1].length);

// ---------- 4. 疑似死代码：selector 引用了全源码不存在的 class/id ----------
const deadByName = new Map();
for (const r of rules) {
  const parts = r.selector.split(',').map(s => s.trim());
  const partDead = (part) => {
    const names = [];
    for (const m of part.matchAll(/[.#]([a-zA-Z_][\w-]*)/g)) names.push(m[1]);
    if (!names.length) return null; // 纯标签/属性选择器不判定
    for (const n of names) if (!isNameUsed(n)) return n;
    return null;
  };
  const deadNames = parts.map(partDead);
  if (deadNames.every(d => d !== null)) {
    const n = deadNames[0];
    if (!deadByName.has(n)) deadByName.set(n, []);
    deadByName.get(n).push({ file: r.file, line: r.line, selector: r.selector });
  }
}
const dead = [...deadByName.entries()].sort((a, b) => b[1].length - a[1].length);

// ---------- 5. 输出报告 ----------
const topHex = [...hexFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
const out = [];
out.push('# CSS 普查报告（src/css 全量）\n');
out.push(`- 文件：${cssFiles.length} 个 / 共 ${totalLines} 行 / ${(totalBytes / 1024).toFixed(0)} KB`);
out.push(`- 规则总数：${rules.length}（不含 keyframes 内部帧）`);
out.push(`- 重复定义：${dups.length} 组（同文件同上下文同选择器定义多次）`);
out.push(`- 疑似死代码：${dead.length} 个无引用 class/id，波及 ${[...deadByName.values()].reduce((a, v) => a + v.length, 0)} 条规则`);
out.push(`- !important：${importantCount} 处`);
out.push(`- 硬编码 hex 颜色：${hexTotal} 处（${hexFreq.size} 种不同值）\n`);

out.push('## 〇、分文件概览\n');
for (const p of perFile) out.push(`- \`${p.file}\`：${p.lines} 行 / ${p.rules} 条规则 / !important ${p.important}`);

out.push('\n## 一、重复定义清单（按重复次数降序）\n');
for (const [key, lines] of dups) {
  out.push(`- [${lines.length} 次] \`${key.slice(0, 110)}\` → 行 ${lines.join(', ')}`);
}

out.push('\n## 二、疑似死代码清单（class/id 在 HTML+JS 全源码零引用）\n');
for (const [name, list] of dead) {
  out.push(`- \`.${name}\`（${list.length} 条规则）`);
  for (const x of list.slice(0, 3)) out.push(`    - ${x.file}:L${x.line}: \`${x.selector.slice(0, 90)}\``);
}

out.push('\n## 三、硬编码颜色 Top 15\n');
for (const [hex, count] of topHex) out.push(`- \`${hex}\` × ${count}`);

fs.writeFileSync('/tmp/css-audit-report.md', out.join('\n'));
console.log(out.slice(0, 8 + perFile.length).join('\n'));
console.log(`\n完整报告: /tmp/css-audit-report.md (${out.length} 行)`);
console.log(`重复定义组数: ${dups.length} | 疑似死代码 class 数: ${dead.length}`);
