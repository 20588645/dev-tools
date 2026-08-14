/**
 * 首页月历 / 七日物候：节气与七十二候用太阳黄经推算，不接外部历法服务。
 * 放假调休以国务院已公布安排为准（见 china-holidays.ts）。
 */

import { hasOfficialHolidayYear, officialHolidayOnDate, type HolidayMark } from './china-holidays'
import { adviceForDay } from './hou-advice'

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const
export const HOU_STAGE_LABELS = ['初候', '次候', '末候'] as const

export interface SolarTermDef {
  name: string
  longitude: number
  hou: readonly [string, string, string]
}

/** 按黄经 15° 一档，0° = 春分 */
export const SOLAR_TERM_DEFS: readonly SolarTermDef[] = [
  { name: '春分', longitude: 0, hou: ['玄鸟至', '雷乃发声', '始电'] },
  { name: '清明', longitude: 15, hou: ['桐始华', '田鼠化鴽', '虹始见'] },
  { name: '谷雨', longitude: 30, hou: ['萍始生', '鸣鸠拂羽', '戴胜降桑'] },
  { name: '立夏', longitude: 45, hou: ['蝼蝈鸣', '蚯蚓出', '王瓜生'] },
  { name: '小满', longitude: 60, hou: ['苦菜秀', '靡草死', '麦秋至'] },
  { name: '芒种', longitude: 75, hou: ['螳螂生', '鵙始鸣', '反舌无声'] },
  { name: '夏至', longitude: 90, hou: ['鹿角解', '蜩始鸣', '半夏生'] },
  { name: '小暑', longitude: 105, hou: ['温风至', '蟋蟀居宇', '鹰始挚'] },
  { name: '大暑', longitude: 120, hou: ['腐草为萤', '土润溽暑', '大雨时行'] },
  { name: '立秋', longitude: 135, hou: ['凉风至', '白露生', '寒蝉鸣'] },
  { name: '处暑', longitude: 150, hou: ['鹰乃祭鸟', '天地始肃', '禾乃登'] },
  { name: '白露', longitude: 165, hou: ['鸿雁来', '玄鸟归', '群鸟养羞'] },
  { name: '秋分', longitude: 180, hou: ['雷始收声', '蛰虫坯户', '水始涸'] },
  { name: '寒露', longitude: 195, hou: ['鸿雁来宾', '雀化为蛤', '菊有黄华'] },
  { name: '霜降', longitude: 210, hou: ['豺乃祭兽', '草木黄落', '蛰虫咸俯'] },
  { name: '立冬', longitude: 225, hou: ['水始冰', '地始冻', '雉入大水'] },
  { name: '小雪', longitude: 240, hou: ['虹藏不见', '天地气降', '闭塞成冬'] },
  { name: '大雪', longitude: 255, hou: ['鹖鴠不鸣', '虎始交', '荔挺出'] },
  { name: '冬至', longitude: 270, hou: ['蚯蚓结', '麋角解', '水泉动'] },
  { name: '小寒', longitude: 285, hou: ['雁北乡', '鹊始巢', '雉始雊'] },
  { name: '大寒', longitude: 300, hou: ['鸡始乳', '征鸟厉疾', '水泽腹坚'] },
  { name: '立春', longitude: 315, hou: ['东风解冻', '蛰虫始振', '鱼陟负冰'] },
  { name: '雨水', longitude: 330, hou: ['獭祭鱼', '候雁北', '草木萌动'] },
  { name: '惊蛰', longitude: 345, hou: ['桃始华', '仓庚鸣', '鹰化为鸠'] },
]

export interface CalendarCell {
  date: Date
  day: number
  inMonth: boolean
  isToday: boolean
  isWeekend: boolean
  solarTerm: string | null
  holiday: HolidayMark | null
  badge: '休' | '班' | null
  note: string | null
  key: string
}

export interface MonthCalendarData {
  year: number
  month: number
  monthLabel: string
  isCurrentMonth: boolean
  remainingDays: number | null
  offCount: number
  shiftCount: number
  footHint: string
  cells: CalendarCell[]
}

export interface PhenologyDay {
  date: Date
  key: string
  weekday: string
  day: number
  isToday: boolean
  isWeekend: boolean
  termName: string
  houName: string
  houStage: string
  isTermDay: boolean
  festival: string | null
  caption: string
  tag: string
  advice: string
}

export interface PhenologyWeekData {
  range: string
  hint: string
  days: PhenologyDay[]
}

const pad = (value: number) => String(value).padStart(2, '0')

const GREGORIAN_FESTIVALS: Readonly<Record<string, string>> = {
  '01-01': '元旦',
  '05-01': '劳动节',
  '10-01': '国庆',
}

const LUNAR_FESTIVALS: Readonly<Record<string, string>> = {
  '1-1': '春节',
  '1-15': '元宵',
  '5-5': '端午',
  '7-7': '七夕',
  '7-15': '中元',
  '8-15': '中秋',
  '9-9': '重阳',
  '12-8': '腊八',
}

const solarTermCache = new Map<number, Array<{ name: string; date: Date; def: SolarTermDef }>>()

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function startOfWeek(date: Date) {
  const value = startOfDay(date)
  const weekday = value.getDay()
  value.setDate(value.getDate() - (weekday === 0 ? 6 : weekday - 1))
  return value
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function julianDate(date: Date) {
  return date.getTime() / 86_400_000 + 2_440_587.5
}

function toRadians(degrees: number) {
  return degrees * Math.PI / 180
}

/** Meeus 太阳视黄经，精度足够落到「哪一天是节气」 */
function sunApparentLongitude(jd: number) {
  const t = (jd - 2_451_545) / 36_525
  const meanLongitude = 280.46646 + 36_000.76983 * t + 0.0003032 * t * t
  const meanAnomaly = 357.52911 + 35_999.05029 * t - 0.0001537 * t * t
  const anomaly = toRadians(meanAnomaly)
  const center = (1.914602 - 0.004817 * t - 0.000014 * t * t) * Math.sin(anomaly)
    + (0.019993 - 0.000101 * t) * Math.sin(2 * anomaly)
    + 0.000289 * Math.sin(3 * anomaly)
  const omega = 125.04 - 1934.136 * t
  const lambda = meanLongitude + center - 0.00569 - 0.00478 * Math.sin(toRadians(omega))
  return ((lambda % 360) + 360) % 360
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function solarTermsInYear(year: number) {
  const cached = solarTermCache.get(year)
  if (cached) return cached
  const found: Array<{ name: string; date: Date; def: SolarTermDef }> = []
  for (let offset = 0; offset < 370; offset += 1) {
    const day = new Date(year, 0, 1 + offset)
    if (day.getFullYear() !== year) break
    const next = addDays(day, 1)
    const start = sunApparentLongitude(julianDate(day))
    let end = sunApparentLongitude(julianDate(next))
    if (end < start) end += 360
    for (const def of SOLAR_TERM_DEFS) {
      let target = def.longitude
      if (target < start) target += 360
      if (start < target && target <= end) {
        found.push({ name: def.name, date: startOfDay(day), def })
      }
    }
  }
  found.sort((left, right) => left.date.getTime() - right.date.getTime())
  solarTermCache.set(year, found)
  return found
}

function solarTermsAround(year: number) {
  return [
    ...solarTermsInYear(year - 1),
    ...solarTermsInYear(year),
    ...solarTermsInYear(year + 1),
  ]
}

export function solarTermOnDate(date: Date) {
  const day = startOfDay(date)
  return solarTermsInYear(day.getFullYear()).find((term) => term.date.getTime() === day.getTime()) ?? null
}

export function currentSolarTerm(date: Date) {
  const day = startOfDay(date).getTime()
  const terms = solarTermsAround(date.getFullYear())
    .filter((term) => term.date.getTime() <= day)
  return terms[terms.length - 1] ?? solarTermsInYear(date.getFullYear())[0]
}

function lunarParts(date: Date): { month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(date)
    const month = Number(parts.find((part) => part.type === 'month')?.value)
    const day = Number(parts.find((part) => part.type === 'day')?.value)
    if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || day < 1) return null
    return { month, day }
  } catch {
    return null
  }
}

export function festivalOnDate(date: Date) {
  const gregorian = GREGORIAN_FESTIVALS[`${pad(date.getMonth() + 1)}-${pad(date.getDate())}`]
  if (gregorian) return gregorian
  const lunar = lunarParts(date)
  if (lunar) {
    const match = LUNAR_FESTIVALS[`${lunar.month}-${lunar.day}`]
    if (match) return match
  }
  const tomorrow = lunarParts(addDays(date, 1))
  if (tomorrow?.month === 1 && tomorrow.day === 1) return '除夕'
  return null
}

const STATUTORY_LABELS: Readonly<Record<string, string>> = {
  元旦: '元旦',
  春节: '春节',
  除夕: '除夕',
  劳动节: '劳动',
  端午: '端午',
  中秋: '中秋',
  国庆: '国庆',
}

export function holidayMarkOnDate(date: Date): HolidayMark | null {
  const official = officialHolidayOnDate(date)
  if (official) return official
  if (hasOfficialHolidayYear(date.getFullYear())) return null
  if (solarTermOnDate(date)?.name === '清明') {
    return { name: '清明', kind: 'off', label: '清明' }
  }
  const festival = festivalOnDate(date)
  const label = festival ? STATUTORY_LABELS[festival] : undefined
  if (!festival || !label) return null
  return { name: festival, kind: 'off', label }
}

export function phenologyOnDate(date: Date): PhenologyDay {
  const term = currentSolarTerm(date)
  const elapsed = Math.max(0, Math.round((startOfDay(date).getTime() - term.date.getTime()) / 86_400_000))
  const houIndex = Math.min(2, Math.floor(elapsed / 5)) as 0 | 1 | 2
  const isTermDay = elapsed === 0
  const festival = festivalOnDate(date)
  const weekdayIndex = (date.getDay() + 6) % 7
  return {
    date: startOfDay(date),
    key: dateKey(date),
    weekday: WEEKDAY_LABELS[weekdayIndex],
    day: date.getDate(),
    isToday: false,
    isWeekend: weekdayIndex >= 5,
    termName: term.name,
    houName: term.def.hou[houIndex],
    houStage: HOU_STAGE_LABELS[houIndex],
    isTermDay,
    festival,
    caption: festival || term.def.hou[houIndex],
    tag: isTermDay ? term.name : `${term.name}·${HOU_STAGE_LABELS[houIndex]}`,
    advice: adviceForDay(dateKey(date), term.name, festival),
  }
}

function withTodayFlag(day: PhenologyDay, today: Date): PhenologyDay {
  return {
    ...day,
    isToday: startOfDay(day.date).getTime() === startOfDay(today).getTime(),
  }
}

export function buildPhenologyWeek(today: Date): PhenologyWeekData {
  const start = startOfWeek(today)
  const days = Array.from({ length: 7 }, (_, index) => (
    withTodayFlag(phenologyOnDate(addDays(start, index)), today)
  ))
  const current = days.find((day) => day.isToday) ?? withTodayFlag(phenologyOnDate(today), today)
  const end = days[6]
  return {
    range: `${start.getMonth() + 1}/${start.getDate()} — ${end.date.getMonth() + 1}/${end.date.getDate()}`,
    hint: current.festival ? `${current.festival} · ${current.termName}` : `${current.termName} · ${current.houName}`,
    days,
  }
}

export function buildMonthCalendar(viewDate: Date, today: Date): MonthCalendarData {
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const monthStart = new Date(year, month, 1)
  const gridStart = startOfWeek(monthStart)
  const lastDay = new Date(year, month + 1, 0).getDate()
  const todayStart = startOfDay(today)
  const isCurrentMonth = todayStart.getFullYear() === year && todayStart.getMonth() === month
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index)
    const weekdayIndex = (date.getDay() + 6) % 7
    const holiday = holidayMarkOnDate(date)
    const solarTerm = solarTermOnDate(date)?.name ?? null
    return {
      date,
      day: date.getDate(),
      inMonth: date.getMonth() === month,
      isToday: date.getTime() === todayStart.getTime(),
      isWeekend: weekdayIndex >= 5,
      solarTerm,
      holiday,
      badge: holiday?.kind === 'off' ? '休' as const : holiday?.kind === 'shift' ? '班' as const : null,
      note: holiday?.label || solarTerm,
      key: dateKey(date),
    }
  })
  const inMonth = cells.filter((cell) => cell.inMonth)
  const offCount = inMonth.filter((cell) => cell.badge === '休').length
  const shiftCount = inMonth.filter((cell) => cell.badge === '班').length
  const remainingDays = isCurrentMonth ? lastDay - today.getDate() : null
  const footHint = offCount || shiftCount
    ? `休 ${offCount} · 班 ${shiftCount}`
    : isCurrentMonth
      ? `本月还剩 ${remainingDays} 天`
      : '本月无放假调休'
  return {
    year,
    month,
    monthLabel: `${year}年${month + 1}月`,
    isCurrentMonth,
    remainingDays,
    offCount,
    shiftCount,
    footHint,
    cells,
  }
}
