export const FACE_SLOT = 'лицо'
export const FACE_GROUPS = [
  'радость',
  'злость',
  'смущение',
  'удивление',
  'грусть',
  'страх',
  'любовь',
  'плач',
  'скука',
  'отвращение',
] as const
export type FaceGroupName = typeof FACE_GROUPS[number]

export const GESTURE_SLOT = 'жест'
export const GESTURE_GROUPS = [
  'кивок',
  'нет',
  'думает',
  'машет',
  'спит',
  'подмигивает',
  'указывает',
  'радуется',
] as const
export type GestureGroupName = typeof GESTURE_GROUPS[number]

export const HAND_SLOT = 'рука'
export const HAND_OPTIONS = [
  'телефон',
  'микрофон',
  'геймпад',
  'еда',
  'книга',
  'оружие',
] as const
export type HandOption = typeof HAND_OPTIONS[number]

export const STICKY_SLOTS = [
  'головной_убор',
  'очки',
  'маска',
  'наушники',
  'украшение',
  'одежда',
  'шарф',
  'крылья',
  'хвост',
  'аксессуар',
] as const
export type StickySlot = typeof STICKY_SLOTS[number]

export const EXPR_OFF = 'нет'
export const EXPR_ON = 'да'

export const STICKY_HINT: Record<StickySlot, string> = {
  головной_убор: 'шапка / капюшон. держать пока надето',
  очки: 'очки. держать пока надеты',
  маска: 'маска. держать пока надета',
  наушники: 'наушники. держать пока на голове',
  украшение: 'ушки / рожки / бант. держать пока надето',
  одежда: 'куртка / плащ. держать пока надето',
  шарф: 'шарф / галстук. держать пока надет',
  крылья: 'крылья. держать пока видны',
  хвост: 'хвост. держать пока виден',
  аксессуар: 'прочий предмет на теле. держать пока надет',
}

export const HAND_HINT = 'предмет в руке. один слот. держать пока ситуация живая'
export const GESTURE_HINT = 'жест на этот ответ, не липкий. если не нужен — не пиши слот'

export const EXPR_RULE = [
  'RULE: Start the reply with one hidden tag when the feeling, gesture, or prop is clear, then the spoken text.',
  'Tag format: <expr лицо="смущение" жест="кивок" головной_убор="да" рука="геймпад"/>',
  'Use only names listed in EXPR. Prefer slot names. If a slot is missing, you may put an exact expression or motion name into лицо or жест.',
  'If you do not understand a name, do not use it.',
  'Omit a sticky/hand slot to leave it unchanged.',
  'Face and gesture are for this reply and may be used together.',
  'жест="нет" means the head-shake gesture, not “no gesture”. Skip the жест attribute if there is no gesture.',
  'If nothing fits, omit the tag.',
  'Never mention the tag, EXPR, or that a system told you to pose.',
].join('\n')


export interface ModelExpressionGroupsConfig {
  face: Record<FaceGroupName, string[]>
  gesture: Record<GestureGroupName, string[]>
  sticky: Record<StickySlot, string[]>
  hand: Record<HandOption, string[]>
}

export function emptyRecord<T extends string>(keys: readonly T[]): Record<T, string[]> {
  return Object.fromEntries(keys.map(key => [key, [] as string[]])) as Record<T, string[]>
}

export function emptyFaceBinds(): Record<FaceGroupName, string[]> {
  return emptyRecord(FACE_GROUPS)
}

export function emptyExpressionGroupsConfig(): ModelExpressionGroupsConfig {
  return {
    face: emptyRecord(FACE_GROUPS),
    gesture: emptyRecord(GESTURE_GROUPS),
    sticky: emptyRecord(STICKY_SLOTS),
    hand: emptyRecord(HAND_OPTIONS),
  }
}

export function parseExprAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([^\s=]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(raw)) != null)
    attrs[match[1]] = match[2]
  return attrs
}

const COMPLETE_TAG = /^\s*<expr\b([^>]*)\/>\s*/i
const OPEN_TAG = /^\s*<expr\b([^>]*)>\s*/i

export function consumeExprTag(text: string): {
  visible: string
  attrs: Record<string, string> | null
  pending: boolean
} {
  const complete = text.match(COMPLETE_TAG)
  if (complete) {
    return {
      visible: text.slice(complete[0].length),
      attrs: parseExprAttrs(complete[1]),
      pending: false,
    }
  }

  const trimmed = text.trimStart()
  const lower = trimmed.toLowerCase()
  if (lower.length === 0)
    return { visible: text, attrs: null, pending: false }

  if ('<expr'.startsWith(lower))
    return { visible: '', attrs: null, pending: true }

  if (lower.startsWith('<expr')) {
    if (!trimmed.includes('>')) {
      if (trimmed.length > 240)
        return { visible: text, attrs: null, pending: false }
      return { visible: '', attrs: null, pending: true }
    }

    const open = text.match(OPEN_TAG)
    if (open) {
      return {
        visible: text.slice(open[0].length),
        attrs: parseExprAttrs(open[1]),
        pending: false,
      }
    }
  }

  return { visible: text, attrs: null, pending: false }
}

export function stripExprFromMessage<T extends { content?: unknown, slices?: Array<{ type: string, text?: string }> }>(
  message: T,
): { message: T, attrs: Record<string, string> | null, pending: boolean } {
  const next = { ...message } as T
  const rawContent = message.content
  const fromContent = typeof rawContent === 'string'
    ? consumeExprTag(rawContent)
    : { visible: '', attrs: null as Record<string, string> | null, pending: false }

  if (typeof rawContent === 'string')
    next.content = fromContent.visible as T['content']

  if (Array.isArray(message.slices)) {
    next.slices = message.slices.map(slice => ({ ...slice }))
    const joined = next.slices
      .filter(slice => slice.type === 'text')
      .map(slice => slice.text ?? '')
      .join('')
    const fromSlices = consumeExprTag(joined)
    if (fromSlices.pending || fromSlices.attrs || fromSlices.visible !== joined) {
      let remainingSkip = joined.length - fromSlices.visible.length
      for (const slice of next.slices ?? []) {
        if (slice.type !== 'text' || !slice.text)
          continue
        if (remainingSkip <= 0)
          break
        const cut = Math.min(remainingSkip, slice.text.length)
        slice.text = slice.text.slice(cut)
        remainingSkip -= cut
      }
      return {
        message: next,
        attrs: fromSlices.attrs ?? fromContent.attrs,
        pending: fromSlices.pending,
      }
    }
  }

  return { message: next, attrs: fromContent.attrs, pending: fromContent.pending }
}

function live(names: string[] | undefined, available: Set<string>): string[] {
  return (names ?? []).filter(name => available.has(name))
}

function boundNames(config: ModelExpressionGroupsConfig, available: Set<string>): Set<string> {
  return new Set([
    ...FACE_GROUPS.flatMap(name => live(config.face[name], available)),
    ...GESTURE_GROUPS.flatMap(name => live(config.gesture[name], available)),
    ...STICKY_SLOTS.flatMap(name => live(config.sticky[name], available)),
    ...HAND_OPTIONS.flatMap(name => live(config.hand[name], available)),
  ])
}

export function resolveSlotOrName(
  value: string,
  slotNames: readonly string[],
  binds: Record<string, string[]>,
  available: Set<string>,
): string[] {
  if ((slotNames as readonly string[]).includes(value)) {
    const liveBinds = live(binds[value], available)
    if (liveBinds.length > 0)
      return liveBinds
  }
  if (available.has(value))
    return [value]
  return []
}

export function formatExprPrompt(
  config: ModelExpressionGroupsConfig,
  availableNames: string[],
  lists?: { expressions?: string[], motions?: string[] },
): string | undefined {
  const available = new Set(availableNames)
  const bound = boundNames(config, available)
  const lines: string[] = []

  const faceOptions = FACE_GROUPS.filter(name => live(config.face[name], available).length > 0)
  const gestureOptions = GESTURE_GROUPS.filter(name => live(config.gesture[name], available).length > 0)
  const handOptions = HAND_OPTIONS.filter(name => live(config.hand[name], available).length > 0)
  const unboundExpressions = (lists?.expressions ?? []).filter(name => available.has(name) && !bound.has(name))
  const unboundMotions = (lists?.motions ?? []).filter(name => available.has(name) && !bound.has(name))

  if (faceOptions.length > 0)
    lines.push(`${FACE_SLOT}: ${[...faceOptions, EXPR_OFF].join(' | ')}`)
  else if (unboundExpressions.length > 0 || unboundMotions.length > 0)
    lines.push(`${FACE_SLOT}: exact name from expressions/motions, or ${EXPR_OFF}`)

  if (gestureOptions.length > 0)
    lines.push(`${GESTURE_SLOT}: ${gestureOptions.join(' | ')} — ${GESTURE_HINT}`)
  else if (unboundMotions.length > 0)
    lines.push(`${GESTURE_SLOT}: exact motion name — ${GESTURE_HINT}`)

  if (handOptions.length > 0)
    lines.push(`${HAND_SLOT}: ${[...handOptions, EXPR_OFF].join(' | ')} — ${HAND_HINT}`)

  for (const slot of STICKY_SLOTS) {
    if (live(config.sticky[slot], available).length === 0)
      continue
    lines.push(`${slot}: ${EXPR_ON}/${EXPR_OFF} — ${STICKY_HINT[slot]}`)
  }

  if (unboundExpressions.length > 0)
    lines.push(`expressions: ${unboundExpressions.join(' | ')}`)
  if (unboundMotions.length > 0)
    lines.push(`motions: ${unboundMotions.join(' | ')}`)

  if (lines.length === 0)
    return undefined

  return ['EXPR', ...lines, '', EXPR_RULE].join('\n')
}

export function pickOne<T>(items: readonly T[]): T | undefined {
  if (items.length === 0)
    return undefined
  if (items.length === 1)
    return items[0]
  return items[Math.floor(Math.random() * items.length)]
}
