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

export const EXPR_OFF = 'нет'
export const EXPR_ON = 'да'

export const EXPR_RULE = [
  'RULE: You MAY start the reply with one hidden tag, then the spoken text.',
  'Tag format: <expr лицо="смущение" шапка="да"/>',
  'Use only names from EXPR. Omit a sticky slot to leave it unchanged.',
  'If you skip the tag, just speak normally.',
  'Never mention the tag, EXPR, or that a system told you to pose.',
].join('\n')

export interface ExpressionBind {
  expressionName: string
  label: string
}

export interface CustomExpressionGroup {
  id: string
  name: string
  what: string
  hold: string
  enabled: boolean
  binds: ExpressionBind[]
}

export interface ModelExpressionGroupsConfig {
  face: Record<FaceGroupName, string[]>
  custom: CustomExpressionGroup[]
}

export function emptyFaceBinds(): Record<FaceGroupName, string[]> {
  return {
    радость: [],
    злость: [],
    смущение: [],
    удивление: [],
    грусть: [],
    страх: [],
    любовь: [],
    плач: [],
    скука: [],
    отвращение: [],
  }
}

export function emptyExpressionGroupsConfig(): ModelExpressionGroupsConfig {
  return {
    face: emptyFaceBinds(),
    custom: [],
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

function liveBinds(binds: ExpressionBind[], available: Set<string>): ExpressionBind[] {
  return binds.filter(bind => available.has(bind.expressionName))
}

function optionLabel(bind: ExpressionBind): string {
  return bind.label.trim() || bind.expressionName
}

export function formatExprPrompt(
  config: ModelExpressionGroupsConfig,
  availableNames: string[],
): string | undefined {
  const available = new Set(availableNames)
  const lines: string[] = []

  const faceOptions = FACE_GROUPS.filter((name) => {
    const bound = config.face[name] ?? []
    return bound.some(expression => available.has(expression))
  })
  if (faceOptions.length > 0)
    lines.push(`${FACE_SLOT}: ${[...faceOptions, EXPR_OFF].join(' | ')}`)

  for (const group of config.custom) {
    if (!group.enabled)
      continue
    const name = group.name.trim()
    const what = group.what.trim()
    const hold = group.hold.trim()
    if (!name || !what || !hold)
      continue
    const binds = liveBinds(group.binds, available)
    if (binds.length === 0)
      continue
    if (binds.length === 1)
      lines.push(`${name}: ${EXPR_ON}/${EXPR_OFF} — ${what}. ${hold}`)
    else
      lines.push(`${name}: ${[...binds.map(optionLabel), EXPR_OFF].join(' | ')} — ${what}. ${hold}`)
  }

  if (lines.length === 0)
    return undefined

  return ['EXPR', ...lines, '', EXPR_RULE].join('\n')
}
