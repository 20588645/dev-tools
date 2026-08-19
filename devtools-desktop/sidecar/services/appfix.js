/**
 * 修复「已损坏，无法打开」：只清扩展属性（含 com.apple.quarantine）。
 * 不关 SIP，不改 Gatekeeper「任何来源」。
 */
const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const BLOCKED_PREFIXES = [
  '/System',
  '/usr',
  '/bin',
  '/sbin',
  '/etc',
  '/private/etc',
  '/private/var/db',
  '/private/var/root',
  '/private/var/protected',
  '/Library/Apple',
  '/dev',
  '/cores',
]

function httpError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function defaultDeps() {
  return { execFile, fs, os, path, platform: process.platform, timeout: 120_000 }
}

function expandHome(input, deps) {
  if (!input) return input
  if (input === '~') return deps.os.homedir()
  if (input.startsWith('~/')) return deps.path.join(deps.os.homedir(), input.slice(2))
  return input
}

function isBlockedPath(resolved) {
  const normalized = resolved.replace(/\/+$/, '')
  return BLOCKED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))
}

function parseXattrList(stdout) {
  const names = []
  for (const line of String(stdout || '').split('\n')) {
    const match = line.match(/^([^:]+):/)
    if (match) names.push(match[1].trim())
  }
  return [...new Set(names)]
}

function resolveAppBundle(inputPath, deps = defaultDeps()) {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    throw httpError('请选择或输入 .app 路径')
  }
  if (inputPath.includes('\0') || inputPath.length > 4096) {
    throw httpError('路径无效')
  }

  const expanded = expandHome(inputPath.trim(), deps)
  let resolved
  try {
    resolved = deps.fs.realpathSync(deps.path.resolve(expanded)).replace(/\/+$/, '')
  } catch (error) {
    if (error && error.code === 'ENOENT') throw httpError('找不到这个应用', 404)
    if (error && error.code === 'EACCES') throw httpError('没有权限读取这个路径', 403)
    throw httpError(error instanceof Error ? error.message : '无法解析这个路径')
  }

  if (!/\.app$/i.test(resolved)) {
    throw httpError('请选择以 .app 结尾的应用包')
  }
  if (isBlockedPath(resolved)) {
    throw httpError('系统目录不能修复')
  }

  let stat
  try {
    stat = deps.fs.statSync(resolved)
  } catch (error) {
    if (error && error.code === 'EACCES') throw httpError('没有权限读取这个路径', 403)
    throw httpError('无法读取该路径')
  }
  if (!stat.isDirectory()) {
    throw httpError('这不是有效的应用包')
  }

  const plist = deps.path.join(resolved, 'Contents', 'Info.plist')
  let plistStat
  try {
    plistStat = deps.fs.statSync(plist)
  } catch {
    throw httpError('应用包不完整（缺少 Info.plist）')
  }
  if (!plistStat.isFile()) {
    throw httpError('应用包不完整（缺少 Info.plist）')
  }

  return resolved
}

function runXattr(args, deps) {
  const timeout = deps.timeout ?? 120_000
  return new Promise((resolve, reject) => {
    deps.execFile('xattr', args, { timeout, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
  })
}

function mapXattrError(error) {
  if (error && error.code === 'ENOENT') return '当前系统找不到 xattr 命令'
  if (error && (error.code === 'ETIMEDOUT' || error.killed)) return '清除扩展属性超时，请稍后重试'
  const detail = String((error && (error.stderr || error.message)) || '')
  if (/Permission denied|not permitted|EPERM/i.test(detail)) return '没有权限修改这个应用'
  return '清除扩展属性失败'
}

async function listRootAttributes(resolved, deps) {
  try {
    const { stdout } = await runXattr(['-l', resolved], deps)
    return parseXattrList(stdout)
  } catch (error) {
    if (error && Number(error.code) === 1) return parseXattrList(error.stdout)
    throw httpError(mapXattrError(error), 500)
  }
}

function summarizeBundle(resolved, attributes) {
  return {
    path: resolved,
    name: path.basename(resolved).replace(/\.app$/i, ''),
    attributes,
    hasQuarantine: attributes.includes('com.apple.quarantine'),
  }
}

async function inspectApp(inputPath, deps = defaultDeps()) {
  const resolved = resolveAppBundle(inputPath, deps)
  const attributes = await listRootAttributes(resolved, deps)
  return summarizeBundle(resolved, attributes)
}

async function repairApp(inputPath, deps = defaultDeps()) {
  const platform = deps.platform ?? process.platform
  if (platform !== 'darwin') {
    throw httpError('此功能仅支持 macOS')
  }

  const before = await inspectApp(inputPath, deps)
  try {
    await runXattr(['-cr', before.path], deps)
  } catch (error) {
    throw httpError(mapXattrError(error), 500)
  }
  const after = await inspectApp(before.path, deps)
  const cleared = before.attributes.filter((name) => !after.attributes.includes(name))
  return {
    ...after,
    cleared,
    remaining: after.attributes,
    hadQuarantine: before.hasQuarantine,
  }
}

function applicationsDir(deps) {
  return deps.applicationsDir || '/Applications'
}

function stripSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function isSystemVolume(mountPoint, deps) {
  const mount = stripSlash(mountPoint)
  if (!mount || mount === '/') return true
  try {
    return deps.fs.realpathSync(mount) === deps.fs.realpathSync('/')
  } catch {
    return /Macintosh HD$/i.test(mount)
  }
}

function isPathOnMount(appPath, mountPoint, deps = defaultDeps()) {
  const app = stripSlash(appPath)
  const mount = stripSlash(mountPoint)
  if (!app || !mount) return false
  if (app === mount || app.startsWith(`${mount}/`)) return true
  try {
    const realApp = stripSlash(deps.fs.realpathSync(app))
    const realMount = stripSlash(deps.fs.realpathSync(mount))
    return realApp === realMount || realApp.startsWith(`${realMount}/`)
  } catch {
    return false
  }
}

function appNameFromPath(appPath) {
  return path.basename(stripSlash(appPath)).replace(/\.app$/i, '')
}

function applicationsDestination(appPath, deps = defaultDeps()) {
  return deps.path.join(applicationsDir(deps), `${appNameFromPath(appPath)}.app`)
}

function runExecFile(command, args, deps, options = {}) {
  return new Promise((resolve, reject) => {
    const child = deps.execFile(command, args, {
      timeout: options.timeout ?? 15_000,
      maxBuffer: options.maxBuffer ?? 2 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })
    })
    if (options.stdin != null && child && child.stdin) {
      child.stdin.end(Buffer.from(String(options.stdin)))
    }
  })
}

async function defaultReadDiskImages(deps) {
  const { stdout } = await runExecFile('hdiutil', ['info', '-plist'], deps)
  const converted = await runExecFile('plutil', ['-convert', 'json', '-o', '-', '-'], deps, {
    stdin: stdout,
  })
  return JSON.parse(converted.stdout || '{}')
}

function imagesFromInfo(payload) {
  const images = []
  const raw = payload && Array.isArray(payload.images) ? payload.images : []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const imagePath = String(entry['image-path'] || '').trim()
    const entities = Array.isArray(entry['system-entities']) ? entry['system-entities'] : []
    const mounts = []
    for (const entity of entities) {
      if (!entity || typeof entity !== 'object') continue
      const mountPoint = stripSlash(entity['mount-point'])
      const devEntry = String(entity['dev-entry'] || '').trim()
      if (!mountPoint) continue
      mounts.push({ mountPoint, devEntry })
    }
    if (!mounts.length) continue
    images.push({
      imagePath,
      imageName: path.basename(imagePath) || path.basename(mounts[0].mountPoint),
      volumeName: path.basename(mounts[0].mountPoint),
      mounts,
    })
  }
  return images
}

function listAppsOnVolume(mountPoint, deps) {
  const apps = []
  let names
  try {
    names = deps.fs.readdirSync(mountPoint)
  } catch {
    return apps
  }
  for (const name of names) {
    if (!/\.app$/i.test(String(name))) continue
    const full = deps.path.join(mountPoint, name)
    try {
      const resolved = resolveAppBundle(full, deps)
      apps.push({
        path: resolved,
        name: appNameFromPath(resolved),
      })
    } catch {
      /* 镜像根目录里不完整的包忽略 */
    }
  }
  return apps
}

function collectInstallImages(payload, deps = defaultDeps()) {
  return imagesFromInfo(payload)
    .filter((image) => image.mounts.every((mount) => (
      !isBlockedPath(mount.mountPoint) && !isSystemVolume(mount.mountPoint, deps)
    )))
    .map((image) => {
      const seen = new Set()
      const apps = []
      for (const mount of image.mounts) {
        for (const app of listAppsOnVolume(mount.mountPoint, deps)) {
          if (seen.has(app.path)) continue
          seen.add(app.path)
          apps.push({ ...app, mountPoint: mount.mountPoint })
        }
      }
      return { ...image, apps }
    })
    .filter((image) => image.apps.length > 0)
}

function findRelatedImage(appPath, images, deps = defaultDeps()) {
  const resolved = stripSlash(appPath)
  if (!resolved || !Array.isArray(images)) return null
  for (const image of images) {
    if (image.mounts.some((mount) => isPathOnMount(resolved, mount.mountPoint, deps))) {
      return { image, onImage: true }
    }
  }
  const name = appNameFromPath(resolved).toLowerCase()
  if (!name) return null
  for (const image of images) {
    if ((image.apps || []).some((app) => String(app.name).toLowerCase() === name)) {
      return { image, onImage: false }
    }
  }
  return null
}

async function listInstallImages(deps = defaultDeps()) {
  if ((deps.platform ?? process.platform) !== 'darwin') return []
  const read = deps.readDiskImages || defaultReadDiskImages
  try {
    const payload = await read(deps)
    return collectInstallImages(payload, deps)
  } catch {
    return []
  }
}

function mapCopyError(error) {
  const detail = String((error && (error.stderr || error.message)) || '')
  if (/Permission denied|not permitted|EPERM|EACCES/i.test(detail)) return '没有权限写入应用程序文件夹'
  if (error && (error.code === 'ETIMEDOUT' || error.killed)) return '拷贝应用超时，请稍后重试'
  return '拷贝到应用程序失败'
}

function mapDetachError(error) {
  const detail = String((error && (error.stderr || error.message)) || '')
  if (/busy|resource busy/i.test(detail)) return '镜像正在使用，请先退出里面的应用再推出'
  if (error && (error.code === 'ETIMEDOUT' || error.killed)) return '推出安装镜像超时，请稍后重试'
  return '推出安装镜像失败'
}

async function requireDiskImage(mountPoint, deps) {
  const mount = stripSlash(mountPoint)
  if (!mount) throw httpError('请选择要推出的安装镜像')
  if (isBlockedPath(mount) || isSystemVolume(mount, deps)) {
    throw httpError('系统卷不能推出')
  }
  const read = deps.readDiskImages || defaultReadDiskImages
  let payload
  try {
    payload = await read(deps)
  } catch {
    throw httpError('无法读取已挂载的磁盘映像')
  }
  const image = imagesFromInfo(payload).find((item) => (
    item.mounts.some((entry) => entry.mountPoint === mount)
  ))
  if (!image) throw httpError('这不是已挂载的安装镜像，不会推出')
  if (image.mounts.some((entry) => isBlockedPath(entry.mountPoint) || isSystemVolume(entry.mountPoint, deps))) {
    throw httpError('系统卷不能推出')
  }
  return image
}

async function detachImage(image, deps) {
  const target = image.mounts[0].mountPoint
  try {
    await runExecFile('hdiutil', ['detach', target], deps, { timeout: 30_000 })
  } catch (error) {
    throw httpError(mapDetachError(error), 409)
  }
}

async function ejectDiskImage(mountPoint, deps = defaultDeps()) {
  const platform = deps.platform ?? process.platform
  if (platform !== 'darwin') throw httpError('此功能仅支持 macOS')
  const image = await requireDiskImage(mountPoint, deps)
  await detachImage(image, deps)
  return {
    ejected: true,
    volumeName: image.volumeName,
    imagePath: image.imagePath,
    mountPoint: image.mounts[0].mountPoint,
  }
}

async function copyAppToApplications(inputPath, deps = defaultDeps()) {
  const platform = deps.platform ?? process.platform
  if (platform !== 'darwin') throw httpError('此功能仅支持 macOS')
  const resolved = resolveAppBundle(inputPath, deps)
  const dest = applicationsDestination(resolved, deps)
  if (stripSlash(resolved) === stripSlash(dest)) {
    return { path: dest, copied: false, skipped: true }
  }
  if (deps.fs.existsSync(dest)) {
    try {
      if (deps.fs.realpathSync(dest) === deps.fs.realpathSync(resolved)) {
        return { path: dest, copied: false, skipped: true }
      }
    } catch { /* 目标存在但读不到时按同名冲突处理 */ }
    throw httpError('应用程序文件夹里已有同名应用，请先处理后再拷贝')
  }
  try {
    await runExecFile('ditto', [resolved, dest], deps, { timeout: 120_000 })
  } catch (error) {
    throw httpError(mapCopyError(error), 500)
  }
  return { path: dest, copied: true, skipped: false }
}

async function settleInstall(inputPath, deps = defaultDeps()) {
  const platform = deps.platform ?? process.platform
  if (platform !== 'darwin') throw httpError('此功能仅支持 macOS')

  const resolved = resolveAppBundle(inputPath, deps)
  const images = await listInstallImages(deps)
  const related = findRelatedImage(resolved, images)
  if (!related) throw httpError('没有找到对应的安装镜像', 404)

  let workingPath = resolved
  let copied = false
  let copySkipped = false
  let repair = null

  if (related.onImage) {
    try {
      const copy = await copyAppToApplications(resolved, deps)
      workingPath = copy.path
      copied = copy.copied
      copySkipped = copy.skipped
    } catch (error) {
      if (error instanceof Error && error.message.includes('已有同名应用')) {
        copySkipped = true
      } else {
        throw error
      }
    }
    if (copied) repair = await repairApp(workingPath, deps)
  }

  let ejected = false
  let ejectError = ''
  try {
    await detachImage(related.image, deps)
    ejected = true
  } catch (error) {
    ejectError = error instanceof Error ? error.message : '推出安装镜像失败'
    if (!copied) throw httpError(ejectError, error && error.status ? error.status : 409)
  }

  return {
    path: workingPath,
    name: appNameFromPath(workingPath),
    copied,
    copySkipped,
    ejected,
    ejectError,
    volumeName: related.image.volumeName,
    imagePath: related.image.imagePath,
    mountPoint: related.image.mounts[0].mountPoint,
    onImage: related.onImage,
    repair,
  }
}

module.exports = {
  parseXattrList,
  resolveAppBundle,
  inspectApp,
  repairApp,
  imagesFromInfo,
  collectInstallImages,
  findRelatedImage,
  applicationsDestination,
  listInstallImages,
  copyAppToApplications,
  ejectDiskImage,
  settleInstall,
}
