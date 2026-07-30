/** 秒级时间戳格式化为「MM-DD HH:mm」，用于最近使用等次要信息 */
export function formatTwofaTime(seconds: number): string {
  if (!seconds) return '未使用'
  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return '未使用'
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).replace(/\//g, '-')
}

/**
 * 从 otpauth:// URI 解析账号，用于批量导入。
 * 形如 otpauth://totp/Issuer:account?secret=XXX&issuer=Issuer&period=30&digits=6
 */
export function parseOtpauthUri(uri: string) {
  const raw = String(uri || '').trim()
  if (!/^otpauth:\/\/totp\//i.test(raw)) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const secret = (url.searchParams.get('secret') || '').trim()
  if (!secret) return null
  const label = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
  const [labelIssuer, labelAccount] = label.includes(':') ? label.split(/:(.+)/) : ['', label]
  const issuer = (url.searchParams.get('issuer') || labelIssuer || '').trim()
  const accountName = (labelAccount || label).trim()
  const period = Number(url.searchParams.get('period'))
  const digits = Number(url.searchParams.get('digits'))
  const algorithm = (url.searchParams.get('algorithm') || '').toUpperCase()
  return {
    issuer: issuer || accountName,
    accountName: accountName || issuer,
    secret,
    period: Number.isFinite(period) && period > 0 ? period : 30,
    digits: Number.isFinite(digits) && digits > 0 ? digits : 6,
    algorithm: algorithm === 'SHA256' || algorithm === 'SHA512' ? algorithm as 'SHA256' | 'SHA512' : 'SHA1' as const,
  }
}

/**
 * 导入文本支持三种来源：otpauth URI 列表、JSON 数组、以及导出文件的 { accounts: [...] }。
 * 返回可直接提交给导入接口的条目。
 */
export function parseTwofaImportText(input: string) {
  const raw = String(input || '').trim()
  if (!raw) return []

  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      const list = Array.isArray(parsed) ? parsed : (parsed?.accounts ?? [])
      if (!Array.isArray(list)) return []
      return list
        .map((item) => {
          const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>
          const issuer = String(row.issuer ?? '').trim()
          const accountName = String(row.accountName ?? row.account ?? '').trim()
          const secret = String(row.secret ?? '').trim()
          if (!secret || (!issuer && !accountName)) return null
          return {
            issuer: issuer || accountName,
            accountName: accountName || issuer,
            secret,
            tag: String(row.tag ?? '').trim(),
            groupName: String(row.groupName ?? '').trim() || '其他',
            period: Number(row.period) > 0 ? Number(row.period) : 30,
            digits: Number(row.digits) > 0 ? Number(row.digits) : 6,
            favorite: Boolean(row.favorite),
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    } catch {
      return []
    }
  }

  return raw
    .split(/\r?\n/)
    .map((line) => parseOtpauthUri(line))
    .filter((item): item is NonNullable<typeof item> => item !== null)
}
