const pad = (n: number) => String(n).padStart(2, '0')

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/** Study day a moment belongs to, given the hour at which a new day starts. */
export function studyDayOf(time: number | Date, rolloverHour: number): string {
  const d = new Date(time)
  d.setHours(d.getHours() - rolloverHour)
  return ymd(d)
}

/** Start (inclusive) of the given study day as epoch ms. */
export function studyDayStart(day: string, rolloverHour: number): number {
  const d = parseYmd(day)
  d.setHours(rolloverHour, 0, 0, 0)
  return d.getTime()
}

/** End (exclusive) of the given study day — i.e. the next rollover. */
export function studyDayEnd(day: string, rolloverHour: number): number {
  const d = parseYmd(day)
  d.setDate(d.getDate() + 1)
  d.setHours(rolloverHour, 0, 0, 0)
  return d.getTime()
}

export function addDays(day: string, n: number): string {
  const d = parseYmd(day)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function formatDayLabel(day: string) {
  const d = parseYmd(day)
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`
}

export const weekdayLabel = (day: string) => WEEKDAYS[parseYmd(day).getDay()]!

export function formatHour(h: number) {
  return `${pad(h)}:00`
}

export function formatDateTime(t: number) {
  const d = new Date(t)
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatRelative(t: number, now = Date.now()) {
  const diff = Math.round((now - t) / 1000)
  if (diff < 60) return '剛剛'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`
  return formatDateTime(t)
}

/** Human readable interval for rating previews ("10 分", "3 天", "2.1 月"). */
export function formatInterval(ms: number) {
  const min = ms / 60000
  if (min < 1) return '<1 分'
  if (min < 60) return `${Math.round(min)} 分`
  const h = min / 60
  if (h < 24) return `${Math.round(h)} 小時`
  const d = h / 24
  if (d < 30) return `${Math.round(d)} 天`
  if (d < 365) return `${(d / 30).toFixed(1).replace(/\.0$/, '')} 月`
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')} 年`
}

/** "4:05" or "1:02:09" until a moment, never negative. */
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
