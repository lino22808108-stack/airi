import { describe, expect, it } from 'vitest'

import {
  consumeExprTag,
  emptyExpressionGroupsConfig,
  EXPR_RULE,
  formatExprPrompt,
  parseExprAttrs,
  stripExprFromMessage,
} from './expr-tag'

describe('expr tag', () => {
  it('parses attributes', () => {
    expect(parseExprAttrs(' лицо="злость" рука="геймпад" шапка="нет"')).toEqual({
      лицо: 'злость',
      рука: 'геймпад',
      шапка: 'нет',
    })
  })

  it('strips a complete leading tag and keeps the spoken text', () => {
    const result = consumeExprTag('<expr лицо="злость" рука="геймпад"/>\nну ты опять слил')
    expect(result.pending).toBe(false)
    expect(result.attrs).toEqual({ лицо: 'злость', рука: 'геймпад' })
    expect(result.visible).toBe('ну ты опять слил')
  })

  it('hides an incomplete tag so it never flashes in chat', () => {
    expect(consumeExprTag('<expr лицо="зло').pending).toBe(true)
    expect(consumeExprTag('<expr лицо="зло').visible).toBe('')
    expect(consumeExprTag('<ex').visible).toBe('')
  })

  it('leaves normal text alone', () => {
    const result = consumeExprTag('привет')
    expect(result.pending).toBe(false)
    expect(result.attrs).toBeNull()
    expect(result.visible).toBe('привет')
  })

  it('strips from slices used by the stream', () => {
    const result = stripExprFromMessage({
      content: '<expr лицо="смущение"/>привет',
      slices: [
        { type: 'text', text: '<expr лицо="смущение"/>' },
        { type: 'text', text: 'привет' },
      ],
    })
    expect(result.attrs).toEqual({ лицо: 'смущение' })
    expect(result.message.content).toBe('привет')
    expect(result.message.slices?.map(slice => slice.text).join('')).toBe('привет')
  })

  it('builds a dynamic prompt from live binds only', () => {
    const config = emptyExpressionGroupsConfig()
    config.face.злость = ['8 生气']
    config.face.смущение = ['7 害羞']
    config.custom.push({
      id: 'hat',
      name: 'шапка',
      what: 'надела шапку',
      hold: 'пока холодно',
      enabled: true,
      binds: [{ expressionName: '1 帽', label: '' }],
    })
    config.custom.push({
      id: 'missing',
      name: 'крылья',
      what: 'есть крылья',
      hold: 'всегда',
      enabled: true,
      binds: [{ expressionName: 'wings', label: '' }],
    })

    const text = formatExprPrompt(config, ['8 生气', '7 害羞', '1 帽'])
    expect(text).toBe([
      'EXPR',
      'лицо: злость | смущение | нет',
      'шапка: да/нет — надела шапку; держать пока холодно',
      '',
      EXPR_RULE,
    ].join('\n'))
  })

  it('emits nothing when the current model has no live groups', () => {
    const config = emptyExpressionGroupsConfig()
    config.face.радость = ['9 爱心眼']
    expect(formatExprPrompt(config, [])).toBeUndefined()
  })
})
