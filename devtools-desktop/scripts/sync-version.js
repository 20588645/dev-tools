const fs = require('fs');
const path = require('path');

// 统一以项目根目录下的 package.json 为版本号唯一源
const rootPackagePath = path.resolve(__dirname, '../package.json');
const tauriConfigPath = path.resolve(__dirname, '../src-tauri/tauri.conf.json');
const sidecarPackagePath = path.resolve(__dirname, '../sidecar/package.json');
const cargoTomlPath = path.resolve(__dirname, '../src-tauri/Cargo.toml');

try {
  console.log('[SyncVersion] 开始自动同步版本号...');

  // 1. 读取根 package.json 版本号
  if (!fs.existsSync(rootPackagePath)) {
    throw new Error(`找不到根 package.json 文件: ${rootPackagePath}`);
  }
  const rootPkg = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
  const version = rootPkg.version;
  if (!version) {
    throw new Error('根 package.json 中不存在有效的 version 字段');
  }
  console.log(`[SyncVersion] 获取到最新版本号: ${version}`);

  // 2. 同步 src-tauri/tauri.conf.json
  if (fs.existsSync(tauriConfigPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
    if (tauriConf.version !== version) {
      tauriConf.version = version;
      fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConf, null, 2), 'utf8');
      console.log(`✔ 已同步 tauri.conf.json 版本至 ${version}`);
    } else {
      console.log('○ tauri.conf.json 版本已一致，无需修改');
    }
  } else {
    console.warn(`⚠ 找不到 tauri.conf.json 文件: ${tauriConfigPath}`);
  }

  // 3. 同步 sidecar/package.json
  if (fs.existsSync(sidecarPackagePath)) {
    const sidecarPkg = JSON.parse(fs.readFileSync(sidecarPackagePath, 'utf8'));
    if (sidecarPkg.version !== version) {
      sidecarPkg.version = version;
      fs.writeFileSync(sidecarPackagePath, JSON.stringify(sidecarPkg, null, 2), 'utf8');
      console.log(`✔ 已同步 sidecar/package.json 版本至 ${version}`);
    } else {
      console.log('○ sidecar/package.json 版本已一致，无需修改');
    }
  } else {
    console.warn(`⚠ 找不到 sidecar/package.json 文件: ${sidecarPackagePath}`);
  }

  // 4. 同步 src-tauri/Cargo.toml
  if (fs.existsSync(cargoTomlPath)) {
    let cargoContent = fs.readFileSync(cargoTomlPath, 'utf8');
    const versionRegex = /^version\s*=\s*"[^"]*"/m;
    if (versionRegex.test(cargoContent)) {
      const updatedCargo = cargoContent.replace(versionRegex, `version = "${version}"`);
      if (updatedCargo !== cargoContent) {
        fs.writeFileSync(cargoTomlPath, updatedCargo, 'utf8');
        console.log(`✔ 已同步 Cargo.toml 版本至 ${version}`);
      } else {
        console.log('○ Cargo.toml 版本已一致，无需修改');
      }
    } else {
      console.warn('⚠ 在 Cargo.toml 中未找到 version 属性');
    }
  } else {
    console.warn(`⚠ 找不到 Cargo.toml 文件: ${cargoTomlPath}`);
  }

  // 5. 同步根目录 README.md（版本徽章 + DMG 示例文件名）
  // P9-4：`src/js/app.js` 已删除，不再同步 APP_VERSION。
  const readmePath = path.resolve(__dirname, '../../README.md');
  if (fs.existsSync(readmePath)) {
    let readme = fs.readFileSync(readmePath, 'utf8');
    const before = readme;
    // 版本徽章：.../badge/version-<X>-green
    readme = readme.replace(/(badge\/version-)[0-9][^-\s)]*(-green)/g, `$1${version}$2`);
    // 构建产物示例文件名：DevTools_<X>_aarch64.dmg
    readme = readme.replace(/(DevTools_)[0-9][0-9.]*(_aarch64\.dmg)/g, `$1${version}$2`);
    if (readme !== before) {
      fs.writeFileSync(readmePath, readme, 'utf8');
      console.log(`✔ 已同步 README.md 版本至 ${version}`);
    } else {
      console.log('○ README.md 版本已一致，无需修改');
    }
  } else {
    console.warn(`⚠ 找不到 README.md 文件: ${readmePath}`);
  }

  console.log('[SyncVersion] 版本号同步完成！');
} catch (e) {
  console.error('[SyncVersion] ❌ 版本号同步失败:', e.message);
  process.exit(1);
}
