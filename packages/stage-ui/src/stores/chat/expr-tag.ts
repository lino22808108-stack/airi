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
  'RULE: You MAY start the reply with one hidden tag, then the spoken text.',
  'Tag format: <expr лицо="смущение" жест="кивок" головной_убор="да" рука="геймпад"/>',
  'Use only names from EXPR. Omit a sticky/hand slot to leave it unchanged.',
  'Face and gesture are for this reply and may be used together.',
  'жест="нет" means the head-shake gesture, not “no gesture”. Skip the жест attribute if there is no gesture.',
  'If you skip the tag, just speak normally.',
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

export function formatExprPrompt(
  config: ModelExpressionGroupsConfig,
  availableNames: string[],
): string | undefined {
  const available = new Set(availableNames)
  const lines: string[] = []

  const faceOptions = FACE_GROUPS.filter(name => live(config.face[name], available).length > 0)
  if (faceOptions.length > 0)
    lines.push(`${FACE_SLOT}: ${[...faceOptions, EXPR_OFF].join(' | ')}`)

  // Gesture "нет" is the head-shake slot. Omitting the attribute means no gesture.
  const gestureOptions = GESTURE_GROUPS.filter(name => live(config.gesture[name], available).length > 0)
  if (gestureOptions.length > 0)
    lines.push(`${GESTURE_SLOT}: ${gestureOptions.join(' | ')} — ${GESTURE_HINT}`)

  const handOptions = HAND_OPTIONS.filter(name => live(config.hand[name], available).length > 0)
  if (handOptions.length > 0)
    lines.push(`${HAND_SLOT}: ${[...handOptions, EXPR_OFF].join(' | ')} — ${HAND_HINT}`)

  for (const slot of STICKY_SLOTS) {
    if (live(config.sticky[slot], available).length === 0)
      continue
    lines.push(`${slot}: ${EXPR_ON}/${EXPR_OFF} — ${STICKY_HINT[slot]}`)
  }

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
