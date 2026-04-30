const TZ = 'Asia/Tokyo'

export function formatMatchDate(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleDateString('ja-JP', {
    timeZone: TZ,
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })
}

export function formatMatchTime(isoDate: string): string {
  const date = new Date(isoDate)
  return date.toLocaleTimeString('ja-JP', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatAlarmTime(isoDate: string, minutesBefore: number): string {
  const date = new Date(new Date(isoDate).getTime() - minutesBefore * 60 * 1000)
  return date.toLocaleTimeString('ja-JP', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isMatchOver(isoDate: string): boolean {
  return new Date(isoDate).getTime() + 2.5 * 3600000 < Date.now()
}

export function isToday(isoDate: string): boolean {
  const date = new Date(isoDate)
  const todayStr = new Date().toLocaleDateString('ja-JP', { timeZone: TZ })
  const dateStr = date.toLocaleDateString('ja-JP', { timeZone: TZ })
  return dateStr === todayStr
}
