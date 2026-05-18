/**
 * 项目管理 API
 * 手动添加/删除项目，不再自动扫描全部
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const {
  analyzeProject,
  listAvailableProjects,
  detectNodeVersions,
  getCurrentNodeVersion,
  DEFAULT_SCAN_ROOT,
} = require('../services/scanner');

const DATA_FILE = path.join(__dirname, '../data/projects.json');

function readProjects() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeProjects(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// GET /api/projects — 获取已添加的项目列表
router.get('/', (req, res) => {
  res.json(readProjects());
});

// GET /api/projects/available — 列出可添加的项目（扫描根目录下的候选项）
router.get('/available', (req, res) => {
  const existing = readProjects().map(p => p.name);
  const available = listAvailableProjects()
    .filter(p => !existing.includes(p.name)); // 排除已添加的
  res.json(available);
});

// GET /api/projects/browse?dir= — 浏览子目录（支持手动选择嵌套项目）
router.get('/browse', (req, res) => {
  const targetDir = req.query.dir || DEFAULT_SCAN_ROOT;
  const resolved = path.resolve(targetDir);

  // 安全检查：必须在扫描根目录内
  if (!resolved.startsWith(DEFAULT_SCAN_ROOT)) {
    return res.status(403).json({ error: '不允许浏览此目录' });
  }

  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: '目录不存在' });
  }

  try {
    const existing = readProjects().map(p => p.path);
    const entries = fs.readdirSync(resolved, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
      .map(d => {
        const fullPath = path.join(resolved, d.name);
        const hasPackageJson = fs.existsSync(path.join(fullPath, 'package.json'));
        const hasSubDirs = hasPackageJson ? false : fs.readdirSync(fullPath, { withFileTypes: true })
          .some(sub => sub.isDirectory() && !sub.name.startsWith('.') && sub.name !== 'node_modules');
        return {
          name: d.name,
          path: fullPath,
          isProject: hasPackageJson,
          hasSubDirs,
          alreadyAdded: existing.includes(fullPath),
        };
      });
    res.json({ currentDir: resolved, root: DEFAULT_SCAN_ROOT, entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:name — 单个项目详情
router.get('/:name', (req, res) => {
  const projects = readProjects();
  const project = projects.find(p => p.name === req.params.name);
  if (!project) return res.status(404).json({ error: '项目不存在' });
  res.json(project);
});

// POST /api/projects — 手动添加项目（传入路径，自动分析）
router.post('/', (req, res) => {
  const { path: projectPath } = req.body;
  if (!projectPath) return res.status(400).json({ error: '项目路径必填' });

  if (!fs.existsSync(projectPath)) {
    return res.status(400).json({ error: `路径不存在: ${projectPath}` });
  }

  const projects = readProjects();
  const dirName = path.basename(projectPath);

  if (projects.find(p => p.name === dirName)) {
    return res.status(400).json({ error: `项目 ${dirName} 已存在` });
  }

  try {
    const project = analyzeProject(projectPath);
    projects.push(project);
    writeProjects(projects);
    res.json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/projects/batch — 批量添加多个项目
router.post('/batch', (req, res) => {
  const { paths } = req.body;
  if (!Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: '请提供项目路径数组' });
  }

  const projects = readProjects();
  const added = [];
  const errors = [];

  for (const projectPath of paths) {
    const dirName = path.basename(projectPath);
    if (projects.find(p => p.name === dirName)) {
      errors.push({ path: projectPath, error: '已存在' });
      continue;
    }
    try {
      const project = analyzeProject(projectPath);
      projects.push(project);
      added.push(project);
    } catch (err) {
      errors.push({ path: projectPath, error: err.message });
    }
  }

  writeProjects(projects);
  res.json({ added, errors });
});

// POST /api/projects/:name/refresh — 重新分析单个项目
router.post('/:name/refresh', (req, res) => {
  const projects = readProjects();
  const idx = projects.findIndex(p => p.name === req.params.name);
  if (idx === -1) return res.status(404).json({ error: '项目不存在' });

  try {
    const old = projects[idx];
    const refreshed = analyzeProject(old.path);

    // 保留用户已配置的字段
    refreshed.defaultServerId = old.defaultServerId;
    refreshed.remotePath = old.remotePath;
    refreshed.nodeVersion = old.nodeVersion || '';
    refreshed.runCommand = old.runCommand || refreshed.runCommand || '';
    refreshed.runPort = old.runPort || '';
    refreshed.runHomeModule = old.runHomeModule || refreshed.runHomeModule || 'home';

    // 保留已有模块的 uploadStrategy
    refreshed.modules = refreshed.modules.map(sm => {
      const em = (old.modules || []).find(m => m.name === sm.name);
      return em ? { ...sm, uploadStrategy: em.uploadStrategy } : sm;
    });

    projects[idx] = refreshed;
    writeProjects(projects);
    res.json(refreshed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/projects/:name — 更新项目配置
router.put('/:name', (req, res) => {
  const projects = readProjects();
  const idx = projects.findIndex(p => p.name === req.params.name);
  if (idx === -1) return res.status(404).json({ error: '项目不存在' });

  const { defaultServerId, defaultServerIds, remotePath, buildCommand, runCommand, runPort, runHomeModule, modules, nodeVersion, displayName } = req.body;
  if (defaultServerId !== undefined) projects[idx].defaultServerId = defaultServerId;
  if (defaultServerIds !== undefined) projects[idx].defaultServerIds = defaultServerIds;
  if (remotePath !== undefined) projects[idx].remotePath = remotePath;
  if (buildCommand !== undefined) projects[idx].buildCommand = buildCommand;
  if (runCommand !== undefined) projects[idx].runCommand = runCommand;
  if (runPort !== undefined) projects[idx].runPort = runPort;
  if (runHomeModule !== undefined) projects[idx].runHomeModule = runHomeModule || 'home';
  if (modules !== undefined) projects[idx].modules = modules;
  if (nodeVersion !== undefined) projects[idx].nodeVersion = nodeVersion;
  if (displayName !== undefined) projects[idx].displayName = displayName;

  writeProjects(projects);
  res.json(projects[idx]);
});

// DELETE /api/projects/:name — 删除项目
router.delete('/:name', (req, res) => {
  const projects = readProjects();
  const idx = projects.findIndex(p => p.name === req.params.name);
  if (idx === -1) return res.status(404).json({ error: '项目不存在' });
  projects.splice(idx, 1);
  writeProjects(projects);
  res.json({ success: true });
});

// GET /api/projects/node-versions/list — 获取可用的 Node.js 版本
router.get('/node-versions/list', (req, res) => {
  const versions = detectNodeVersions();
  const current = getCurrentNodeVersion();
  res.json({ current, versions });
});

// GET /api/projects/:name/git-log — 获取项目最近 git 提交记录
router.get('/:name/git-log', (req, res) => {
  const { execSync } = require('child_process');
  const projects = readProjects();
  const project = projects.find(p => p.name === req.params.name);
  if (!project) return res.status(404).json({ error: '项目不存在' });

  try {
    // 获取当前分支
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: project.path, encoding: 'utf8' }).trim();
    // 获取最近 5 条提交（排除 merge commit）
    const logOutput = execSync('git log -5 --no-merges --format="%H|%s|%an|%aI"', { cwd: project.path, encoding: 'utf8' }).trim();
    const commits = logOutput.split('\n').filter(Boolean).map(line => {
      const [hash, message, author, time] = line.split('|');
      return { hash: hash.substring(0, 7), message, author, time };
    });
    res.json({ branch, commits });
  } catch (e) {
    res.json({ branch: '—', commits: [], error: e.message });
  }
});

module.exports = router;
