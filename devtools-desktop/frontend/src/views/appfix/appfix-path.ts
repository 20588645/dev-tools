export function normalizeDroppedPath(raw: string) {
  const value = raw.trim()
  if (!value) return ''
  if (value.startsWith('file:')) {
    try {
      return decodeURIComponent(new URL(value).pathname).replace(/\/+$/, '')
    } catch {
      return value.replace(/^file:\/\/(localhost)?/i, '').replace(/\/+$/, '')
    }
  }
  return value.replace(/\/+$/, '')
}

export function looksLikeAppPath(value: string) {
  return /\.app$/i.test(normalizeDroppedPath(value))
}

/** 拖入包内文件时，回溯到最近的 .app 包路径 */
export function enclosingAppPath(value: string) {
  const normalized = normalizeDroppedPath(value)
  const match = normalized.match(/^(.*\.app)(?:\/|$)/i)
  return match?.[1] ?? normalized
}

export function extractDroppedAppPath(paths: string[]) {
  for (const item of paths) {
    const candidate = enclosingAppPath(item)
    if (looksLikeAppPath(candidate)) return candidate
  }
  return paths[0] ? enclosingAppPath(paths[0]) : ''
}

export function relatedInstallImage<T extends {
  mounts: Array<{ mountPoint: string }>
  apps: Array<{ name: string }>
  volumeName?: string
}>(appPath: string, images: T[]): { image: T; onImage: boolean } | null {
  const resolved = normalizeDroppedPath(appPath)
  if (!resolved) return null
  for (const image of images) {
    if (image.mounts.some((mount) => {
      const mountPoint = mount.mountPoint.replace(/\/+$/, '')
      return Boolean(mountPoint) && (resolved === mountPoint || resolved.startsWith(`${mountPoint}/`))
    })) return { image, onImage: true as const }
  }
  const name = resolved.replace(/\.app$/i, '').split('/').filter(Boolean).at(-1)?.toLowerCase() || ''
  if (!name) return null
  for (const image of images) {
    if (image.apps.some((app) => app.name.toLowerCase() === name)) {
      return { image, onImage: false as const }
    }
  }
  return null
}

export function pathsFromDataTransfer(dataTransfer: DataTransfer | null | undefined) {
  if (!dataTransfer) return []
  const paths: string[] = []
  for (const file of Array.from(dataTransfer.files)) {
    const nativePath = (file as File & { path?: string }).path
    if (typeof nativePath === 'string' && nativePath.trim()) paths.push(nativePath)
  }
  const listed = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain')
  for (const line of listed.split('\n')) {
    const item = line.trim()
    if (item && !item.startsWith('#')) paths.push(item)
  }
  return paths
}
