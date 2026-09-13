import { describe, expect, it } from 'vitest'

import { autoSortAssets, classifyLive2dAsset, parseLlmSortResult } from './expr-classify'
import {
  consumeExprTag,
  emptyExpressionGroupsConfig,
  EXPR_RULE,
  formatExprPrompt,
  parseExprAttrs,
  pickOne,
  resolveSlotOrName,
  stripExprFromMessage,
} from './expr-tag'

describe('expr tag', () => {
  it('parses attributes', () => {
    expect(parseExprAttrs(' лицо="злость" рука="геймпад" головной_убор="нет"')).toEqual({
      лицо: 'злость',
      рука: 'геймпад',
      головной_убор: 'нет',
    })
  })

  it('strips a complete leading tag and keeps the spoken text', () => {
    const result = consumeExprTag('<expr лицо="злость" жест="кивок"/>\nну ты опять слил')
    expect(result.pending).toBe(false)
    expect(result.attrs).toEqual({ лицо: 'злость', жест: 'кивок' })
    expect(result.visible).toBe('ну ты опять слил')
  })

  it('keeps жест="нет" as the head-shake gesture', () => {
    const result = consumeExprTag('<expr лицо="злость" жест="нет"/>неа')
    expect(result.attrs).toEqual({ лицо: 'злость', жест: 'нет' })
    expect(result.visible).toBe('неа')
  })

  it('hides an incomplete tag so it never flashes in chat', () => {
    expect(consumeExprTag('<expr лицо="зло').pending).toBe(true)
    expect(consumeExprTag('<ex').visible).toBe('')
  })

  it('does not hide a whole reply behind a broken tag', () => {
    const broken = consumeExprTag('<expr лицо="злость">\nну ты опять слил')
    expect(broken.pending).toBe(false)
    expect(broken.visible.trim()).toBe('ну ты опять слил')
  })

  it('strips from slices used by the stream', () => {
    const result = stripExprFromMessage({
      content: '<expr лицо="смущение"/>привет',
      slices: [
        { type: 'text', text: '<expr лицо="смущение"/>' },
        { type: 'text', text: 'привет' },
      ],
    })
    expect(result.message.content).toBe('привет')
  })

  it('builds a prompt from fixed slots only', () => {
    const config = emptyExpressionGroupsConfig()
    config.face.злость = ['8 生气']
    config.gesture.кивок = ['w-adult01-nod']
    config.gesture.нет = ['w-adult01-no']
    config.sticky.головной_убор = ['1 帽']
    config.hand.геймпад = ['gamepad']

    const text = formatExprPrompt(config, ['8 生气', 'w-adult01-nod', 'w-adult01-no', '1 帽'])
    expect(text).toContain('лицо: злость | нет')
    expect(text).toContain('жест: кивок | нет')
    expect(text).not.toMatch(/жест:.*нет \| нет/)
    expect(text).toContain('головной_убор: да/нет')
    expect(text).not.toMatch(/\nрука:/)
    expect(text).toContain(EXPR_RULE)
    expect(text).toContain('жест="нет" means the head-shake gesture')
  })

  it('omits empty slots from the prompt', () => {
    const config = emptyExpressionGroupsConfig()
    config.face.радость = ['smile']
    const text = formatExprPrompt(config, ['smile'])
    expect(text).toContain('лицо: радость | нет')
    expect(text).not.toContain('жест:')
    expect(text).not.toContain('головной_убор:')
    expect(text).not.toContain('рука:')
  })

  it('still prompts from raw names when no slots are bound', () => {
    const text = formatExprPrompt(emptyExpressionGroupsConfig(), ['w-cute01-shy', 'w-adult01-nod'], {
      expressions: [],
      motions: ['w-cute01-shy', 'w-adult01-nod'],
    })
    expect(text).toContain('motions: w-cute01-shy | w-adult01-nod')
    expect(text).toContain('лицо: exact name from expressions/motions')
    expect(text).toContain(EXPR_RULE)
  })

  it('resolves a slot bind or a raw asset name', () => {
    const config = emptyExpressionGroupsConfig()
    config.face.смущение = ['w-cute01-shy']
    const available = new Set(['w-cute01-shy', 'w-cool10-angry'])
    expect(resolveSlotOrName('смущение', ['радость', 'смущение'], config.face, available)).toEqual(['w-cute01-shy'])
    expect(resolveSlotOrName('w-cool10-angry', ['радость', 'смущение'], config.face, available)).toEqual(['w-cool10-angry'])
    expect(resolveSlotOrName('радость', ['радость', 'смущение'], config.face, available)).toEqual([])
  })
})

describe('auto sort', () => {
  it('maps miku motion names into face and gesture slots', () => {
    const sorted = autoSortAssets({
      expressions: ['1 帽', '8 生气'],
      motions: [
        'w-cute01-shy',
        'w-cool10-angry',
        'w-adult01-nod',
        'w-cute01-sleep05',
        'w-cool13-sigh',
        'w-adult01-think',
        'w-cute01-wave',
        'w-cute01-wink',
        'idle',
      ],
    })
    expect(sorted.sticky.головной_убор).toContain('1 帽')
    expect(sorted.face.злость).toEqual(expect.arrayContaining(['8 生气', 'w-cool10-angry']))
    expect(sorted.face.смущение).toContain('w-cute01-shy')
    expect(sorted.gesture.кивок).toContain('w-adult01-nod')
    expect(sorted.gesture.спит).toContain('w-cute01-sleep05')
    expect(sorted.gesture.думает).toContain('w-adult01-think')
    expect(sorted.gesture.машет).toContain('w-cute01-wave')
    expect(sorted.gesture.подмигивает).toContain('w-cute01-wink')
    expect(sorted.face.скука).toContain('w-cool13-sigh')
    expect(sorted.gesture.кивок).not.toContain('idle')
    expect(sorted.gesture.машет).not.toContain('w-adult01-think')
  })

  it('does not treat think as a wave', () => {
    expect(classifyLive2dAsset('w-adult01-think', 'motion')).toEqual({ kind: 'gesture', slot: 'думает' })
    expect(classifyLive2dAsset('w-cute01-hi', 'motion')).toEqual({ kind: 'gesture', slot: 'машет' })
  })

  it('maps refuse motions to the head-shake slot', () => {
    expect(classifyLive2dAsset('w-adult01-deny', 'motion')).toEqual({ kind: 'gesture', slot: 'нет' })
    expect(classifyLive2dAsset('w-adult01-no', 'motion')).toEqual({ kind: 'gesture', slot: 'нет' })
    expect(classifyLive2dAsset('w-adult01-nod', 'motion')).toEqual({ kind: 'gesture', slot: 'кивок' })
  })

  it('keeps only names the model actually has and drops unknowns', () => {
    const sorted = parseLlmSortResult(`
      \`\`\`json
      {"face":{"смущение":["w-cute01-shy","made-up"],"злость":["w-cool10-angry"]},"gesture":{"кивок":["w-adult01-nod"]}}
      \`\`\`
    `, ['w-cute01-shy', 'w-cool10-angry', 'w-adult01-nod'])
    expect(sorted?.face.смущение).toEqual(['w-cute01-shy'])
    expect(sorted?.face.злость).toEqual(['w-cool10-angry'])
    expect(sorted?.gesture.кивок).toEqual(['w-adult01-nod'])
    expect(sorted?.face.смущение).not.toContain('made-up')
    expect(parseLlmSortResult('{"face":{"радость":["nope"]}}', ['w-cute01-shy'])).toBeNull()
  })
})

describe('pickOne', () => {
  it('returns the only bind, or one of the listed binds', () => {
    expect(pickOne(['a'])).toBe('a')
    expect(pickOne([])).toBeUndefined()
    const picked = pickOne(['a', 'b', 'c'])
    expect(['a', 'b', 'c']).toContain(picked)
  })
})
