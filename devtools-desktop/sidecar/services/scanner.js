/**
 * 项目分析 + Node 版本检测
 * 支持对单个项目路径进行分析，识别项目类型和模块列表
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { globSync } = require('glob');

const DEFAULT_SCAN_ROOT = '/Users/ldy/project';

/**
 * 分析单个项目路径，返回项目配置
 * @param {string} projectPath - 项目绝对路径
 * @returns {Object|null} 项目配置对象，路径无效时返回 null
 */
function analyzeProject(projectPath) {
  const pkgPath = path.join(projectPath, 'package.json');

  if (!fs.existsSync(pkgPath)) {
    throw new Error(`项目路径下不存在 package.json: ${projectPath}`);
  }

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const dirName = path.basename(projectPath);

    const project = {
      name: dirName,
      path: projectPath,
      type: 'single',
      tool: detectBuildTool(projectPath, pkg),
      buildCommand: detectBuildCommand(pkg),
      runCommand: detectRunCommand(pkg),
      runPort: '',
      runHomeModule: 'home',
      distDir: 'dist',
      modules: [],
      excludeModules: [],
      defaultServerId: null,
      remotePath: '',
      nodeVersion: '', // 空字符串表示使用当前系统默认版本
    };

    // 探测多模块: src/*/main.js
    const mainFiles = globSync('src/*/main.js', { cwd: projectPath });
    if (mainFiles.length > 1) {
      project.type = 'multi-module';
      const allModules = mainFiles.map(f => path.basename(path.dirname(f)));
      const excludes = readExcludeModules(projectPath);
      project.excludeModules = excludes;

      project.modules = allModules
        .filter(m => !excludes.includes(m))
        .sort()
        .map(name => ({
          name,
          uploadStrategy: name === 'home' ? 'root' : 'folder'
        }));
    }

    return project;
  } catch (err) {
    if (err.message.includes('package.json')) throw err;
    throw new Error(`分析项目失败: ${err.message}`);
  }
}

/**
 * 列出扫描根目录下所有可选的项目目录（用于"添加项目"时的候选列表）
 * 只返回包含 package.json 的目录名
 */
function listAvailableProjects(scanRoot = DEFAULT_SCAN_ROOT) {
  if (!fs.existsSync(scanRoot)) return [];

  return fs.readdirSync(scanRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
    .filter(d => fs.existsSync(path.join(scanRoot, d.name, 'package.json')))
    .map(d => ({
      name: d.name,
      path: path.join(scanRoot, d.name)
    }));
}

/**
 * 检测本机通过 nvm 安装的所有 Node.js 版本
 * @returns {string[]} 版本号列表，如 ['v22.21.1', 'v20.19.2', ...]
 */
function detectNodeVersions() {
  const nvmDir = path.join(os.homedir(), '.nvm/versions/node');
  if (!fs.existsSync(nvmDir)) return [];

  return fs.readdirSync(nvmDir)
    .filter(d => d.startsWith('v'))
    .sort((a, b) => {
      // 按版本号降序排列（最新的在前）
      const parse = v => v.slice(1).split('.').map(Number);
      const [aMaj, aMin, aPat] = parse(a);
      const [bMaj, bMin, bPat] = parse(b);
      return bMaj - aMaj || bMin - aMin || bPat - aPat;
    });
}

/**
 * 获取当前系统 Node 版本
 */
function getCurrentNodeVersion() {
  return process.version;
}

// ========== 内部辅助函数 ==========

function detectBuildTool(projectPath, pkg) {
  const checkFile = (name) => fs.existsSync(path.join(projectPath, name));

  if (checkFile('vite.config.js') || checkFile('vite.config.ts')) return 'Vite';
  if (checkFile('vue.config.js')) return 'Vue CLI';
  if (checkFile('webpack.config.js') || checkFile('build/webpack.base.conf.js')) return 'Webpack';

  const devDeps = pkg.devDependencies || {};
  if (devDeps.vite) return 'Vite';
  if (devDeps['@vue/cli-service']) return 'Vue CLI';
  if (devDeps.webpack) return 'Webpack';

  return 'Unknown';
}

function detectBuildCommand(pkg) {
  const scripts = pkg.scripts || {};
  if (scripts['build:prod']) return 'npm run build:prod';
  if (scripts.build) return 'npm run build';
  return 'npm run build';
}

function detectRunCommand(pkg) {
  const scripts = pkg.scripts || {};
  if (scripts.dev) return 'npm run dev';
  if (scripts.serve) return 'npm run serve';
  if (scripts.start) return 'npm start';
  if (scripts.local) return 'npm run local';
  return 'npm run dev';
}

/**
 * 读取 config/index.js 中的 exludeModules 列表
 * 注意：原项目中拼写为 exludeModules（少了一个 c），两种拼写都兼容
 */
function readExcludeModules(projectPath) {
  const configPath = path.join(projectPath, 'config/index.js');
  if (!fs.existsSync(configPath)) return [];

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    const match = content.match(/exl?udeModules\s*:\s*\[([\s\S]*?)\]/);
    if (!match) return [];
    const items = match[1].match(/'([^']+)'|"([^"]+)"/g);
    if (!items) return [];
    return items.map(s => s.replace(/['"]/g, ''));
  } catch (err) {
    console.error(`[Scanner] 读取 excludeModules 失败 (${projectPath}):`, err.message);
    return [];
  }
}

module.exports = {
  analyzeProject,
  listAvailableProjects,
  detectNodeVersions,
  getCurrentNodeVersion,
  DEFAULT_SCAN_ROOT,
};
