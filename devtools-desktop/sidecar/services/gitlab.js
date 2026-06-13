/**
 * GitLab API 封装
 * 从 git_report_app.py 的 fetch_commits() 迁移
 */
const https = require('https');
const http = require('http');

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/**
 * 从仓库 URL 解析出 API 基础地址和项目路径
 */
function projectFromRepoUrl(repoUrl) {
  const parsed = new URL(repoUrl);
  const base = `${parsed.protocol}//${parsed.host}`;
  let path = parsed.pathname.replace(/^\//, '').replace(/\.git$/, '');
  return { base, project: path };
}

/**
 * 发起 HTTP 请求（支持 http 和 https）
 */
function httpGet(requestUrl, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(requestUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'PRIVATE-TOKEN': token,
      },
      timeout: 20000,
      // 忽略自签名证书（内网 GitLab 常见）
      rejectUnauthorized: false,
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`GitLab HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve({
            data: JSON.parse(body),
            headers: res.headers,
          });
        } catch {
          reject(new Error('JSON 解析失败'));
        }
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
    req.on('error', (e) => reject(e));
    req.end();
  });
}

/**
 * 获取仓库的 commit 记录
 * @param {string} repo - 仓库 HTTP 克隆地址
 * @param {string} branch - 分支名（可选）
 * @param {string} token - GitLab Private Token
 * @param {string} author - 作者过滤（邮箱或用户名）
 * @param {string} since - 开始日期 YYYY-MM-DD
 * @param {string} until - 结束日期 YYYY-MM-DD
 * @returns {Promise<{logs: Array, error: string|null}>}
 */
async function fetchCommits(repo, branch, token, author, since, until) {
  const { base, project } = projectFromRepoUrl(repo);
  const encodedProject = encodeURIComponent(project);

  const logs = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      since: `${since}T00:00:00+08:00`,
      until: `${until}T23:59:59+08:00`,
      per_page: '100',
      page: String(page),
    });

    if (branch) params.set('ref_name', branch);
    if (author && author.includes('@')) params.set('author', author);

    const requestUrl = `${base}/api/v4/projects/${encodedProject}/repository/commits?${params.toString()}`;

    try {
      const { data, headers } = await httpGet(requestUrl, token);

      for (const c of data) {
        const subject = c.title || (c.message || '').split('\n')[0];
        const cAuthor = c.author_name || '';

        // 跳过 merge commit
        if (subject.toLowerCase().includes('merge')) continue;

        // 按用户名过滤（非邮箱情况）
        if (author && !author.includes('@') && cAuthor !== author) continue;

        logs.push({
          date: (c.created_at || '').slice(0, 10),
          author: cAuthor,
          subject,
          hash: (c.id || '').slice(0, 7),
        });
      }

      const nextPage = headers['x-next-page'];
      if (!nextPage) break;
      page = parseInt(nextPage);
    } catch (e) {
      return { logs: [], error: e.message };
    }
  }

  // 按日期排序
  logs.sort((a, b) => a.date.localeCompare(b.date) || a.author.localeCompare(b.author) || a.subject.localeCompare(b.subject));
  return { logs, error: null };
}

/**
 * 生成 Markdown 周报
 */
function renderMarkdown(results, author, since, until) {
  const lines = ['# Git 仓库周报', '', `- 时间范围：${since} 至 ${until}`, `- 作者：${author || '全部'}`, ''];
  const total = results.reduce((sum, r) => sum + r.logs.length, 0);
  lines.push('## 汇总', '', `共 ${results.length} 个仓库，${total} 条提交。`, '');

  for (const item of results) {
    const bl = item.branch ? ` [${item.branch}]` : '';
    lines.push(`## ${item.project}${bl}`, '');

    if (item.error) {
      lines.push(`> 获取失败：${item.error}`, '');
      continue;
    }
    if (item.logs.length === 0) {
      lines.push('无提交记录', '');
      continue;
    }

    lines.push('| 日期 | 星期 | 作者 | 提交内容 |', '| --- | --- | --- | --- |');

    // 按日期+作者分组
    const grouped = {};
    for (const log of item.logs) {
      const key = `${log.date}|${log.author}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(log.subject);
    }

    for (const [key, subs] of Object.entries(grouped)) {
      const [d, a] = key.split('|');
      const date = new Date(d);
      const wd = WEEKDAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
      const s = subs.map(x => `- ${x}`).join('<br>');
      lines.push(`| ${d} | ${wd} | ${a} | ${s} |`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

module.exports = { fetchCommits, renderMarkdown, projectFromRepoUrl };
