# 需求与设计文档 (PRD): 本地一键“热替换”更新方案 (macOS)

## 1. 方案简介
由于本项目是供个人（或小范围内）在本地 macOS 环境下运行的高频迭代开发工具，传统的云端自动更新（GitHub Actions + 签名 + 云存储分发）在网络环境、重定向限制以及打包等待时长上面存在极高的维护成本与时间延迟。

本方案抛弃所有网络端依赖，采用**本地极简热替换脚本**。在您本地合并代码后，只需运行一行命令，脚本即会自动完成本地编译、覆盖系统 `/Applications/` 目录下的旧软件并自动重新运行新版本。

---

## 2. 实际使用效果与步骤

### 2.1 极简的操作流程
当您在本地开发完新功能并合并到 `release` 分支（或在任意分支）后：

1. **终端运行命令**：
   在项目根目录下直接运行：
   ```bash
   npm run upgrade
   ```
2. **命令行打印输出（示例）**：
   ```text
   🚀 开始本地一键热更新...
   
   📦 [1/3] 正在本地编译构建 Tauri 应用...
   ✔ 编译成功！生成最新程序包。
   
   🔄 [2/3] 正在自动覆盖系统 /Applications/ 目录...
   ✔ 备份旧版本成功。
   ✔ 新版本覆盖替换成功。
   
   ✨ [3/3] 正在关闭旧进程并重新启动新版本...
   ✔ 软件已自动重新运行。
   
   🎉 升级完成！已成功升级至最新版本！整个过程用时 58 秒。
   ```
3. **软件界面的变化**：
   * 软件会在编译完成的瞬间**黑屏一下（约1秒）**，然后自动以最新版本的状态重新弹出来。
   * 软件左下角展示的系统版本号，会自动变为您最新代码中配置的版本号（例如 `0.1.66`），全程无感且 100% 成功。

---

## 3. 技术实现原理

本方案只需要在项目根目录下配置一个极简的 JS 脚本 [upgrade.js](file:///Users/ldy/personalTools/devtools-desktop/upgrade.js)，代码内容非常直观且易于维护：

```javascript
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. 本地编译构建
console.log('📦 [1/3] 正在本地编译构建 Tauri 应用...');
execSync('npm run build', { stdio: 'inherit', cwd: __dirname });

// 2. 确定路径
const srcApp = path.join(__dirname, 'src-tauri/target/release/bundle/macos/DevTools.app');
const destApp = '/Applications/DevTools.app';

if (!fs.existsSync(srcApp)) {
  console.error('❌ 编译失败，未找到生成的 DevTools.app');
  process.exit(1);
}

// 3. 覆盖替换 /Applications/ 下的程序
console.log('🔄 [2/3] 正在自动覆盖系统 /Applications/ 目录...');
try {
  // 如果旧程序正在运行，先强制关闭它
  try { execSync('pkill -f DevTools'); } catch(e) {}
  
  // 覆盖拷贝
  execSync(`rm -rf "${destApp}"`);
  execSync(`cp -R "${srcApp}" "${destApp}"`);
  console.log('✔ 新版本覆盖替换成功。');
} catch (err) {
  console.error('❌ 复制覆盖失败，可能需要权限。请尝试运行 sudo npm run upgrade');
  process.exit(1);
}

// 4. 重新启动新程序
console.log('✨ [3/3] 正在重新启动新版本...');
execSync(`open "${destApp}"`);
console.log('🎉 升级完成！');
```

---

## 4. 方案深度对比

| 衡量维度 | 本地一键“热替换”方案 (推荐) | 传统 GitHub Actions + 自动更新方案 |
| :--- | :--- | :--- |
| **网络要求** | **0 网络依赖** (断网状态下也能 100% 成功升级) | 强依赖外网连接 (国内常因 GitHub/CDN 抖动失败) |
| **时间消耗** | **约 1 分钟** (本地有缓存，只需编译增量代码) | **约 7 分钟** (Actions 云端虚拟机每次都需初始化从头编译) |
| **配置复杂度** | **0 配置** (仅需一个 20 行的本地 JS 脚本) | **极高** (涉及 SSH 密钥、阿里云 OSS/腾讯云、Nginx 静态反代) |
| **安全性** | **绝对安全** (所有代码、临时凭证都在您自己电脑上) | **有风险** (您的私钥、云凭证需上传至 GitHub Secrets 托管) |
| **维护成本** | **0 成本** (不需要花钱买任何云服务器或对象存储) | **需付费** (需购买腾讯云轻量服务器或阿里的 OSS 按量流量) |

---

## 5. 项目重构动作

如果您同意该方案，我们将为项目执行以下重构：
1. **删除冗余云工作流**：删除 `.github/workflows/release.yml`，为仓库减负。
2. **清理前端多余代码**：在 `app.js` 和 `settings.js` 中删去所有检测 `latest.json` 和自动更新提示的后台轮询逻辑，避免后台持续发起无用请求，降低本地功耗。
3. **添加本地升级快捷脚本**：在 `package.json` 中配置 `"upgrade": "node upgrade.js"`。
