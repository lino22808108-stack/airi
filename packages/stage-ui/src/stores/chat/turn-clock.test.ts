import { afterEach, describe, expect, it } from 'vitest'

import {
  formatElapsed,
  formatSurfaceChange,
  formatTurnClock,
  nskDayPeriod,
  nskParts,
  resetTurnClockSurfaces,
} from './turn-clock'

function nskMs(isoLocal: string): number {
  return new Date(`${isoLocal}+07:00`).getTime()
}

describe('turn clock header', () => {
  afterEach(() => {
    resetTurnClockSurfaces()
  })

  it('labels noon in Novosibirsk', () => {
    const parts = nskParts(nskMs('2026-09-12T12:00:00'))
    expect(parts.weekday).toBe('сб')
    expect(parts.hour).toBe(12)
    expect(nskDayPeriod(parts.hour)).toBe('полдень')
  })

  it('labels early morning', () => {
    expect(nskDayPeriod(5)).toBe('раннее утро')
    expect(nskDayPeriod(7)).toBe('раннее утро')
    expect(nskDayPeriod(8)).toBe('утро')
    expect(nskDayPeriod(0)).toBe('ночь')
    expect(nskDayPeriod(23)).toBe('ночь')
  })

  it('formats elapsed the agreed way', () => {
    const now = nskMs('2026-09-12T12:00:00')
    expect(formatElapsed(undefined, now)).toBe('нет')
    expect(formatElapsed(now - 2 * 60_000, now)).toBe('2мин')
    expect(formatElapsed(now - (8 * 60 + 43) * 60_000, now)).toBe('8ч 43мин')
  })

  it('formats device change', () => {
    expect(formatSurfaceChange(undefined, 'pc')).toBe('нет')
    expect(formatSurfaceChange('pc', 'pc')).toBe('нет')
    expect(formatSurfaceChange('pc', 'phone')).toBe('с пк на телефон')
    expect(formatSurfaceChange('phone', 'pc')).toBe('с телефона на пк')
  })

  it('always emits three lines', () => {
    const text = formatTurnClock({
      now: nskMs('2026-09-12T12:00:00'),
      surface: 'phone',
      previousAt: nskMs('2026-09-12T03:17:00'),
      previousSurface: 'pc',
    })
    expect(text).toBe([
      'сейчас: 2026-09-12 сб нск 12:00 (полдень) · телефон',
      'прошло: 8ч 43мин (с последнего сообщения)',
      'смена: с пк на телефон',
    ].join('\n'))
  })
})
