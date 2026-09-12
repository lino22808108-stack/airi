import type { FaceGroupName, GestureGroupName, HandOption, StickySlot } from './expr-tag'

import {
  emptyExpressionGroupsConfig,
  FACE_GROUPS,
  GESTURE_GROUPS,
  HAND_OPTIONS,
  STICKY_SLOTS,
} from './expr-tag'

export type SlotKind = 'face' | 'gesture' | 'sticky' | 'hand'

export interface ClassifiedAsset {
  kind: SlotKind
  slot: FaceGroupName | GestureGroupName | StickySlot | HandOption
}

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9\u0400-\u04ff\u4e00-\u9fff]+/i)
    .filter(Boolean)
}

function matches(name: string, keys: string[]): boolean {
  const h = name.toLowerCase()
  const parts = tokens(name)
  return keys.some((key) => {
    const k = key.toLowerCase()
    if (k.length <= 3)
      return parts.includes(k)
    return h.includes(k) || parts.includes(k)
  })
}

function firstMatch<T extends string>(name: string, rules: Array<{ slot: T, keys: string[] }>): T | null {
  for (const rule of rules) {
    if (matches(name, rule.keys))
      return rule.slot
  }
  return null
}

const HAND_RULES: Array<{ slot: HandOption, keys: string[] }> = [
  { slot: 'телефон', keys: ['phone', 'mobile', 'smartphone', '手机', '電話'] },
  { slot: 'микрофон', keys: ['mic', 'mike', 'микро', '麦克风'] },
  { slot: 'геймпад', keys: ['gamepad', 'joystick', 'controller', 'геймпад', '手柄'] },
  { slot: 'еда', keys: ['food', 'eat', 'drink', 'cup', 'cake', 'еда', 'delicious'] },
  { slot: 'книга', keys: ['book', 'tablet', 'notebook', 'книга'] },
  { slot: 'оружие', keys: ['weapon', 'sword', 'gun', 'blade', 'оруж'] },
]

const STICKY_RULES: Array<{ slot: StickySlot, keys: string[] }> = [
  { slot: 'головной_убор', keys: ['hat', 'cap', 'hood', 'beanie', 'beret', 'шапк', '帽', '帽子'] },
  { slot: 'очки', keys: ['glass', 'sunglass', 'очк', '眼镜'] },
  { slot: 'маска', keys: ['mask', 'respirator', 'маск', '口罩'] },
  { slot: 'наушники', keys: ['headphone', 'headset', 'earphone', 'науш', '耳机'] },
  { slot: 'украшение', keys: ['horn', 'ribbon', 'ушк', 'рожк', 'бант'] },
  { slot: 'одежда', keys: ['coat', 'jacket', 'cape', 'hoodie', 'курт', 'плащ', '夹克'] },
  { slot: 'шарф', keys: ['scarf', 'галст', 'шарф', '围巾'] },
  { slot: 'крылья', keys: ['wing', 'крыл', '翼'] },
  { slot: 'хвост', keys: ['tail', 'хвост', '尾'] },
  { slot: 'аксессуар', keys: ['accessory', 'аксес'] },
]

const GESTURE_RULES: Array<{ slot: GestureGroupName, keys: string[] }> = [
  { slot: 'кивок', keys: ['nod', 'кивок', '点头'] },
  { slot: 'нет', keys: ['shakehead', 'shake-head', 'headshake', 'deny', 'refuse', 'nope', 'отказ', 'качает', '摇头', 'no'] },
  { slot: 'думает', keys: ['think', 'ponder', 'дума', '思考'] },
  { slot: 'машет', keys: ['wave', 'shakehand', 'shake-hand', 'bye', 'маш', 'hi'] },
  { slot: 'спит', keys: ['sleep', 'nap', 'спит', '睡'] },
  { slot: 'подмигивает', keys: ['wink', 'подмиг', '眨眼'] },
  { slot: 'указывает', keys: ['point', 'peace', 'piece', 'указ'] },
  { slot: 'радуется', keys: ['guts', 'cheer', 'dance'] },
]

const FACE_RULES: Array<{ slot: FaceGroupName, keys: string[] }> = [
  { slot: 'любовь', keys: ['love', 'heart', 'kiss', 'люб', '爱', '心'] },
  { slot: 'плач', keys: ['cry', 'tear', 'weep', 'плач', '泣'] },
  { slot: 'радость', keys: ['glad', 'happy', 'joy', 'smile', 'laugh', 'радост', '笑'] },
  { slot: 'злость', keys: ['angry', 'anger', 'rage', 'mad', 'зл', '生气', '怒'] },
  { slot: 'смущение', keys: ['shy', 'blush', 'embarrass', 'смущ', '羞'] },
  { slot: 'удивление', keys: ['surprise', 'shock', 'удив', '惊'] },
  { slot: 'грусть', keys: ['sad', 'sorrow', 'груст', '悲'] },
  { slot: 'страх', keys: ['fear', 'scare', 'afraid', 'страх', '恐'] },
  { slot: 'скука', keys: ['bored', 'sigh', 'скук'] },
  { slot: 'отвращение', keys: ['disgust', 'trouble', 'отвр'] },
]

export function classifyLive2dAsset(name: string, source: 'expression' | 'motion'): ClassifiedAsset | null {
  const hand = firstMatch(name, HAND_RULES)
  if (hand)
    return { kind: 'hand', slot: hand }

  const sticky = firstMatch(name, STICKY_RULES)
  if (sticky)
    return { kind: 'sticky', slot: sticky }

  if (source === 'motion') {
    const gesture = firstMatch(name, GESTURE_RULES)
    if (gesture)
      return { kind: 'gesture', slot: gesture }
  }

  const face = firstMatch(name, FACE_RULES)
  if (face)
    return { kind: 'face', slot: face }

  return null
}

export function autoSortAssets(input: {
  expressions: string[]
  motions: string[]
}) {
  const next = emptyExpressionGroupsConfig()

  function push(list: string[], name: string) {
    if (!list.includes(name))
      list.push(name)
  }

  for (const name of input.expressions) {
    const hit = classifyLive2dAsset(name, 'expression')
    if (!hit)
      continue
    if (hit.kind === 'face')
      push(next.face[hit.slot as FaceGroupName], name)
    else if (hit.kind === 'sticky')
      push(next.sticky[hit.slot as StickySlot], name)
    else if (hit.kind === 'hand')
      push(next.hand[hit.slot as HandOption], name)
    else
      push(next.gesture[hit.slot as GestureGroupName], name)
  }

  for (const name of input.motions) {
    const hit = classifyLive2dAsset(name, 'motion')
    if (!hit)
      continue
    if (hit.kind === 'gesture')
      push(next.gesture[hit.slot as GestureGroupName], name)
    else if (hit.kind === 'face')
      push(next.face[hit.slot as FaceGroupName], name)
    else if (hit.kind === 'sticky')
      push(next.sticky[hit.slot as StickySlot], name)
    else
      push(next.hand[hit.slot as HandOption], name)
  }

  return next
}

export { FACE_GROUPS, GESTURE_GROUPS, HAND_OPTIONS, STICKY_SLOTS }
