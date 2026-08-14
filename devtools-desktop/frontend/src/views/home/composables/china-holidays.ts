/**
 * 全体公民放假与调休：只收录国务院办公厅已公布的年度安排。
 * 未公布年份不编造调休，由月历回退到法定节日当天。
 *
 * 2024 国办发明电〔2023〕7号；2025 国办发明电〔2024〕12号；2026 国办发明电〔2025〕7号。
 */

export type HolidayKind = 'off' | 'shift'

export interface HolidayMark {
  name: string
  kind: HolidayKind
  /** 格子上的短名；调休日不写名，只标「班」 */
  label: string | null
}

const OFFICIAL_YEARS = new Set([2024, 2025, 2026])

const marks = new Map<string, HolidayMark>()

const pad = (value: number) => String(value).padStart(2, '0')

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseKey(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function eachKeys(from: string, to: string) {
  const keys: string[] = []
  const end = parseKey(to).getTime()
  for (let cursor = parseKey(from); cursor.getTime() <= end; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)) {
    keys.push(toDateKey(cursor))
  }
  return keys
}

function addOff(from: string, to: string, name: string, labels: Record<string, string> = {}) {
  for (const key of eachKeys(from, to)) {
    marks.set(key, { name, kind: 'off', label: labels[key] ?? null })
  }
}

function addShift(key: string, name: string) {
  marks.set(key, { name, kind: 'shift', label: null })
}

addOff('2023-12-30', '2024-01-01', '元旦', { '2024-01-01': '元旦' })
addOff('2024-02-10', '2024-02-17', '春节', { '2024-02-10': '春节' })
addShift('2024-02-04', '春节')
addShift('2024-02-18', '春节')
addOff('2024-04-04', '2024-04-06', '清明', { '2024-04-04': '清明' })
addShift('2024-04-07', '清明')
addOff('2024-05-01', '2024-05-05', '劳动节', { '2024-05-01': '劳动' })
addShift('2024-04-28', '劳动节')
addShift('2024-05-11', '劳动节')
addOff('2024-06-08', '2024-06-10', '端午', { '2024-06-10': '端午' })
addOff('2024-09-15', '2024-09-17', '中秋', { '2024-09-15': '中秋' })
addShift('2024-09-14', '中秋')
addOff('2024-10-01', '2024-10-07', '国庆', { '2024-10-01': '国庆' })
addShift('2024-09-29', '国庆')
addShift('2024-10-12', '国庆')

addOff('2025-01-01', '2025-01-01', '元旦', { '2025-01-01': '元旦' })
addOff('2025-01-28', '2025-02-04', '春节', { '2025-01-28': '除夕', '2025-01-29': '春节' })
addShift('2025-01-26', '春节')
addShift('2025-02-08', '春节')
addOff('2025-04-04', '2025-04-06', '清明', { '2025-04-04': '清明' })
addOff('2025-05-01', '2025-05-05', '劳动节', { '2025-05-01': '劳动' })
addShift('2025-04-27', '劳动节')
addOff('2025-05-31', '2025-06-02', '端午', { '2025-05-31': '端午' })
addOff('2025-10-01', '2025-10-08', '国庆', { '2025-10-01': '国庆', '2025-10-06': '中秋' })
addShift('2025-09-28', '国庆')
addShift('2025-10-11', '国庆')

addOff('2026-01-01', '2026-01-03', '元旦', { '2026-01-01': '元旦' })
addShift('2026-01-04', '元旦')
addOff('2026-02-15', '2026-02-23', '春节', { '2026-02-16': '除夕', '2026-02-17': '春节' })
addShift('2026-02-14', '春节')
addShift('2026-02-28', '春节')
addOff('2026-04-04', '2026-04-06', '清明', { '2026-04-04': '清明' })
addOff('2026-05-01', '2026-05-05', '劳动节', { '2026-05-01': '劳动' })
addShift('2026-05-09', '劳动节')
addOff('2026-06-19', '2026-06-21', '端午', { '2026-06-19': '端午' })
addOff('2026-09-25', '2026-09-27', '中秋', { '2026-09-25': '中秋' })
addOff('2026-10-01', '2026-10-07', '国庆', { '2026-10-01': '国庆' })
addShift('2026-09-20', '国庆')
addShift('2026-10-10', '国庆')

export function hasOfficialHolidayYear(year: number) {
  return OFFICIAL_YEARS.has(year)
}

export function officialHolidayOnDate(date: Date) {
  return marks.get(toDateKey(date)) ?? null
}
