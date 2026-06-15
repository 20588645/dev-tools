const { execFileSync } = require('child_process');

/**
 * 修复「GUI 启动的 sidecar 缺失用户 PATH」这一历史遗留问题。
 *
 * 背景：从程序坞/访达启动的桌面应用，其 sidecar 进程继承的是 macOS 精简 PATH
 * （/usr/bin:/bin:/usr/sbin:/sbin），不含用户 ~/.zshrc / ~/.bash_profile 里配置的
 * nvm / fnm / homebrew node 路径。于是「系统默认」Node 版本的项目执行 npm 时报
 * `npm: command not found`（退出码 127）。从终端启动应用则没有此问题（终端进程已加载用户 rc）。
 *
 * 解决：跑一次「交互式登录 shell」取其真实 $PATH（含用户的 node/npm），缓存复用。
 * 仅作为基础 PATH；调用方若指定了具体 nvm 版本，仍会把该版本 bin 目录 prepend 到最前以优先生效。
 */

let cached; // undefined=未解析；string=已解析（含空串表示解析失败）

function resolveLoginShellPath() {
  if (cached !== undefined) return cached;
  cached = '';
  if (process.platform === 'win32') {
    cached = process.env.PATH || '';
    return cached;
  }
  try {
    const shell = process.env.SHELL || '/bin/zsh';
    const MARK = '__DEVTOOLS_PATH__';
    // -i 交互 + -l 登录：加载用户 rc（zsh 的 .zprofile/.zshrc、bash 的 .bash_profile/.bashrc，
    // 内含 nvm/fnm/homebrew 初始化）。用唯一标记行隔离 rc 可能产生的 stdout 噪声；stderr 丢弃。
    const out = execFileSync(shell, ['-ilc', `printf '%s:%s\\n' '${MARK}' "$PATH"`], {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.split('\n').find(l => l.startsWith(MARK + ':'));
    if (line) cached = line.slice(MARK.length + 1).trim();
  } catch {
    // 无此 shell / 超时 / rc 报错：回退空串，由调用方用 process.env.PATH 兜底（不劣于现状）
    cached = '';
  }
  return cached;
}

/**
 * 把登录 shell 的 PATH 合并进给定 env：登录 PATH 在前（含用户 node/npm），去重后接原 PATH。
 * 仅在成功解析到登录 PATH 时改写 env.PATH，否则原样返回。
 * @param {NodeJS.ProcessEnv} env 待加工的环境变量对象（会返回新对象，不原地修改）
 */
function withLoginShellPath(env) {
  const loginPath = resolveLoginShellPath();
  if (!loginPath) return env;
  const base = (env && env.PATH) || process.env.PATH || '';
  const seen = new Set();
  const merged = [...loginPath.split(':'), ...base.split(':')]
    .filter(p => p && !seen.has(p) && (seen.add(p), true))
    .join(':');
  return { ...env, PATH: merged };
}

module.exports = { resolveLoginShellPath, withLoginShellPath };
