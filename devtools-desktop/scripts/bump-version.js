#!/usr/bin/env node
/**
 * 自动递增 patch 版本号并同步到所有配置文件
 * 用法: node scripts/bump-version.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// 读取主 package.json 的版本
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const newVersion = `${major}.${minor}.${patch + 1}`;

console.log(`版本号: ${pkg.version} → ${newVersion}`);

// 1. 更新 package.json
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// 2. 更新 tauri.conf.json
const tauriConfPath = path.join(ROOT, 'src-tauri/tauri.conf.json');
const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = newVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');

// 3. 更新 src/js/app.js 中的 APP_VERSION
const appJsPath = path.join(ROOT, 'src/js/app.js');
let appJs = fs.readFileSync(appJsPath, 'utf8');
appJs = appJs.replace(/const APP_VERSION = '[^']+';/, `const APP_VERSION = '${newVersion}';`);
fs.writeFileSync(appJsPath, appJs, 'utf8');

// 4. 更新 Cargo.toml
const cargoPath = path.join(ROOT, 'src-tauri/Cargo.toml');
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version = "[^"]+"/m, `version = "${newVersion}"`);
fs.writeFileSync(cargoPath, cargo, 'utf8');

console.log(`✅ 已更新: package.json, tauri.conf.json, app.js, Cargo.toml`);
