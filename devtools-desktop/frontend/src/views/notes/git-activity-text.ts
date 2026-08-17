export function gitActivityInsertLine(subject: string) {
  const trimmed = String(subject ?? '').trim()
  const description = trimmed.replace(/^[a-z][\w-]*(?:\([^)]*\))?!?:\s+/i, '').trim()
  return description || trimmed
}

export function gitActivityAlreadyInserted(
  content: string,
  item: { hash: string; subject: string },
) {
  const line = gitActivityInsertLine(item.subject)
  if (!line) return false
  if (content.includes(`（${item.hash}）`) || content.includes(`(${item.hash})`)) return true
  return content.split(/\r?\n/).some((row) => row.trim() === line)
}
