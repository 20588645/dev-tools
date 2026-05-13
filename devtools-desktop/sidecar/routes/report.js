/**
 * Git 周报 API
 * 从 git_report_app.py 迁移
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { fetchCommits, renderMarkdown, projectFromRepoUrl } = require('../services/gitlab');

const CONFIG_FILE = path.join(__dirname, '../data/report-config.json');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return { token: '', author: '', outputDir: '', repos: [] }; }
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

// GET /api/report/config — 读取周报配置
router.get('/config', (req, res) => {
  const cfg = readConfig();
  res.json({
    token: cfg.token || '',
    author: cfg.author || '',
    outputDir: cfg.outputDir || '',
    repos: cfg.repos || [],
  });
});

// POST /api/report/config — 保存周报配置
router.post('/config', (req, res) => {
  const { token, author, outputDir, repos } = req.body;
  const cfg = {
    token: token || '',
    author: author || '',
    outputDir: outputDir || '',
    repos: repos || [],
  };
  writeConfig(cfg);
  res.json({ ok: true });
});

// POST /api/report/generate — 生成周报（全部仓库）
router.post('/generate', async (req, res) => {
  const { token, author, since, until, repos } = req.body;

  if (!token) return res.status(400).json({ error: 'GitLab Token 不能为空' });
  if (!repos || repos.length === 0) return res.status(400).json({ error: '仓库列表不能为空' });

  const results = [];

  for (const item of repos) {
    const repo = (item.repo || '').trim();
    const branch = (item.branch || '').trim();
    const group = (item.group || '').trim();
    if (!repo) continue;

    const { project } = projectFromRepoUrl(repo);
    const { logs, error } = await fetchCommits(repo, branch, token, author, since, until);

    results.push({
      project,
      repo,
      branch,
      group,
      logs,
      error,
    });
  }

  // 生成 Markdown
  const markdown = renderMarkdown(results, author, since, until);

  res.json({ results, markdown });
});

// POST /api/report/generate-single — 单仓库生成（增量加载）
router.post('/generate-single', async (req, res) => {
  const { token, author, since, until, repo, branch, group } = req.body;

  if (!token) return res.status(400).json({ error: 'Token 不能为空' });
  if (!repo) return res.status(400).json({ error: '仓库地址不能为空' });

  const { project } = projectFromRepoUrl(repo);
  const { logs, error } = await fetchCommits(repo, branch || '', token, author, since, until);

  res.json({
    project,
    repo,
    branch,
    group,
    logs,
    error,
  });
});

module.exports = router;
