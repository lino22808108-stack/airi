export const TURN_CLOCK_RULE = 'RULE: This is knowledge you already have (time, season, silence, device). Never mention a log, header, system message, or that this was sent to you. If you notice a long gap, night, or a device switch — say it as yourself, not as reading a log.'

export const NSK_TIME_ZONE = 'Asia/Novosibirsk'

export type ChatClientSurface = 'pc' | 'phone'

const WEEKDAY_NSK = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const

export interface TurnClockInput {
  now: number
  surface: ChatClientSurface
  previousAt?: number
  previousSurface?: ChatClientSurface
}

export function nskParts(now: number): { year: number, month: number, day: number, hour: number, minute: number, weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NSK_TIME_ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(now))

  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  const weekdayEn = pick('weekday')
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayEn)

  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
    hour: Number(pick('hour')),
    minute: Number(pick('minute')),
    weekday: WEEKDAY_NSK[weekdayIndex === -1 ? 0 : weekdayIndex],
  }
}

export function nskDayPeriod(hour: number): string {
  if (hour >= 0 && hour <= 4)
    return 'ночь'
  if (hour >= 5 && hour <= 7)
    return 'раннее утро'
  if (hour >= 8 && hour <= 11)
    return 'утро'
  if (hour === 12)
    return 'полдень'
  if (hour >= 13 && hour <= 17)
    return 'день'
  if (hour >= 18 && hour <= 22)
    return 'вечер'
  return 'ночь'
}

export function nskSeason(month: number): string {
  if (month >= 3 && month <= 5)
    return 'весна'
  if (month >= 6 && month <= 8)
    return 'лето'
  if (month >= 9 && month <= 11)
    return 'осень'
  return 'зима'
}

export function formatElapsed(previousAt: number | undefined, now: number): string {
  if (previousAt == null)
    return 'нет'

  const totalMin = Math.max(0, Math.floor((now - previousAt) / 60_000))
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const mins = totalMin % 60

  if (days > 0)
    return hours ? `${days}д ${hours}ч` : `${days}д`
  if (hours > 0)
    return mins ? `${hours}ч ${mins}мин` : `${hours}ч`
  return `${mins}мин`
}

export function formatSurfaceLabel(surface: ChatClientSurface): 'пк' | 'телефон' {
  return surface === 'phone' ? 'телефон' : 'пк'
}

export function formatSurfaceChange(previous: ChatClientSurface | undefined, current: ChatClientSurface): string {
  if (!previous || previous === current)
    return 'нет'
  if (previous === 'pc' && current === 'phone')
    return 'с пк на телефон'
  return 'с телефона на пк'
}

export function formatTurnClock(input: TurnClockInput): string {
  const parts = nskParts(input.now)
  const date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
  const time = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`

  return [
    `сейчас: ${date} ${parts.weekday} нск ${time} (${nskDayPeriod(parts.hour)}, ${nskSeason(parts.month)}) · ${formatSurfaceLabel(input.surface)}`,
    `прошло: ${formatElapsed(input.previousAt, input.now)} (с последнего сообщения)`,
    `смена: ${formatSurfaceChange(input.previousSurface, input.surface)}`,
    TURN_CLOCK_RULE,
  ].join('\n')
}

const lastSurfaceBySession = new Map<string, ChatClientSurface>()

export function peekLastSurface(sessionId: string): ChatClientSurface | undefined {
  return lastSurfaceBySession.get(sessionId)
}

export function rememberSurface(sessionId: string, surface: ChatClientSurface): void {
  lastSurfaceBySession.set(sessionId, surface)
}

export function resetTurnClockSurfaces(): void {
  lastSurfaceBySession.clear()
}

export function lastMessageTimestamp(messages: Array<{ role?: string, createdAt?: number }>): number | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if ((message.role === 'user' || message.role === 'assistant') && typeof message.createdAt === 'number')
      return message.createdAt
  }
  return undefined
}
