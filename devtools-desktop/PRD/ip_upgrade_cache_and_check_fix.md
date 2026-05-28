# 自动更新时序与缓存防御 PRD

## 1. 问题背景
在客户端自动更新流程完成后，应用会自动编译并重新启动。由于自动检测更新接口 `/api/upgrade/check` 是在应用启动 5 秒后异步发起的，可能会因为：
- 本地 Sidecar 在重启过程中的短暂网络或状态延迟，导致首次检测结果滞后。
- 页面加载期间的状态残留。
- 轮询机制在 2 小时后才更新下一次状态。
这使得已经升级到最新版本的客户端，其左下角依然可能残留显示“发现新版本”的紫色气泡。
经过排查，当前运行的 Sidecar 后端对于 `/api/upgrade/check` 接口已经正确返回了 `{"hasUpdate":false}`。此时只需对前端进行一次防错设计，即可完美解决此残留气泡。

## 2. 改进方案
在前端 [app.js](file:///Users/ldy/personalTools/devtools-desktop/src/js/app.js) 中，为 [.sidebar-update-badge](file:///Users/ldy/personalTools/devtools-desktop/src/css/style.css#L12675) 气泡的点击事件处理函数 [triggerSidebarUpgrade](file:///Users/ldy/personalTools/devtools-desktop/src/js/app.js#L1053) 引入**实时双重检测机制**：
- 当用户点击“发现新版本”气泡时，在展示确认弹窗前，先向后端发起一次实时的 `/api/upgrade/check` 请求。
- 如果请求返回 `hasUpdate: false`，说明本地已完成升级。此时直接弹出 Toast 提示“✨ 您当前已是最新版本！”，并立即将更新提示气泡隐藏，防止残留。
- 如果请求确实返回有更新，则使用最新的 Commit 日志数据刷新确认弹窗内容，继续正常升级流程。

## 3. 详细设计与代码变更
### 变更文件：[app.js](file:///Users/ldy/personalTools/devtools-desktop/src/js/app.js)

将 `triggerSidebarUpgrade` 修改为：
```javascript
async function triggerSidebarUpgrade() {
  // 增加实时检测防线，防止因缓存或轮询滞后导致气泡残留
  try {
    const data = await API.get('/api/upgrade/check');
    if (!data.hasUpdate) {
      showToast('✨ 您当前已是最新版本！', '无需重复更新');
      showGlobalUpgradeIndicator(false);
      return;
    }
    globalUpdateCommits = data.commits || [];
  } catch (e) {
    console.warn('[UpgradeCheck] 实时更新检查失败:', e.message);
  }

  const commitsText = globalUpdateCommits.length > 0
    ? `最新提交：\n${globalUpdateCommits.slice(0, 3).join('\n')}${globalUpdateCommits.length > 3 ? '\n...' : ''}`
    : '包含性能优化及体验更新';

  const ok = await showConfirm(`检测到有新版本，是否立即更新？\n\n${commitsText}\n\n更新将拉取代码，重新打包并自动重启软件。`, {
    confirmText: '立即更新',
    cancelText: '稍后提醒',
    icon: '🚀'
  });

  if (!ok) return;

  if (typeof startUpgrade === 'function') {
    startUpgrade(true);
  }
}
```

## 4. 验证计划
1. 在更新气泡残留时，点击气泡，观察是否弹出 Toast “✨ 您当前已是最新版本！” 并且更新气泡立刻隐藏。
2. 检查后台进程中，Sidecar API 是否正常返回且无异常日志。
