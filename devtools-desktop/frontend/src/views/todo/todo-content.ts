export interface TodoChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface TodoContent {
  description: string
  checklist: TodoChecklistItem[]
}

const CHECKLIST_LINE = /^-\s*\[([ xX])\]\s*(.*)$/
const CHECKLIST_MARKER = '[checklist]'

function createChecklistId(index: number) {
  return `check-${index}`
}

export function parseTodoContent(content: string): TodoContent {
  if (!content) return { description: '', checklist: [] }

  const lines = String(content).replace(/\r\n?/g, '\n').split('\n')
  const markerIndex = lines.findIndex((line) => line.trim() === CHECKLIST_MARKER)
  const descriptionLines: string[] = []
  const checklistLines: string[] = []

  if (markerIndex >= 0) {
    descriptionLines.push(...lines.slice(0, markerIndex))
    checklistLines.push(...lines.slice(markerIndex + 1))
  } else {
    lines.forEach((line) => {
      if (CHECKLIST_LINE.test(line)) checklistLines.push(line)
      else descriptionLines.push(line)
    })
  }

  const checklist = checklistLines.flatMap((line, index) => {
    const match = line.match(CHECKLIST_LINE)
    if (!match) return []
    return [{
      id: createChecklistId(index),
      done: match[1].toLowerCase() === 'x',
      text: match[2].trim(),
    }]
  })

  return {
    description: descriptionLines.join('\n').trim(),
    checklist,
  }
}

export function serializeTodoContent(description: string, checklist: TodoChecklistItem[]): string {
  const descriptionPart = String(description ?? '').trim()
  const checklistPart = checklist
    .map((item) => ({
      done: Boolean(item.done),
      text: String(item.text ?? '').trim(),
    }))
    .filter((item) => item.text)
    .map((item) => `- [${item.done ? 'x' : ' '}] ${item.text}`)
    .join('\n')

  if (descriptionPart && checklistPart) return `${descriptionPart}\n${CHECKLIST_MARKER}\n${checklistPart}`
  if (checklistPart) return `${CHECKLIST_MARKER}\n${checklistPart}`
  return descriptionPart
}

export function todoNotificationBody(title: string, content: string) {
  const parsed = parseTodoContent(content)
  return parsed.description ? `${title}\n${parsed.description}` : title
}
