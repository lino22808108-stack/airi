import type { ChatHistoryItem } from '../../../types/chat'

import { describe, expect, it } from 'vitest'

import { getChatHistoryItemKey, isHiddenScreenStreamPrompt } from './utils'

describe('getChatHistoryItemKey', () => {
  it('prefers stable message ids when available', () => {
    const createdAt = 1700000000000

    const userMessage: ChatHistoryItem = { role: 'user', content: 'hi', createdAt, id: 'user-1' }
    const assistantMessage: ChatHistoryItem = { role: 'assistant', content: 'hello', createdAt, id: 'assistant-1', slices: [], tool_results: [] }

    expect(getChatHistoryItemKey(userMessage, 0)).toBe('user-1')
    expect(getChatHistoryItemKey(assistantMessage, 1)).toBe('assistant-1')
  })

  it('falls back to a role + timestamp + index composite when ids are missing', () => {
    const createdAt = 1700000000000

    const userMessage: ChatHistoryItem = { role: 'user', content: 'hi', createdAt }
    const assistantMessage: ChatHistoryItem = { role: 'assistant', content: 'hello', createdAt, slices: [], tool_results: [] }

    expect(getChatHistoryItemKey(userMessage, 0)).toBe('user:1700000000000:0')
    expect(getChatHistoryItemKey(assistantMessage, 1)).toBe('assistant:1700000000000:1')
  })

  it('falls back to index when message is missing', () => {
    expect(getChatHistoryItemKey(undefined, 0)).toBe(0)
    expect(getChatHistoryItemKey(undefined, 1)).toBe(1)
  })

  it('falls back to a role + index composite when ids and timestamps are missing', () => {
    const userMessage: ChatHistoryItem = { role: 'user', content: 'hi' }
    const assistantMessage: ChatHistoryItem = { role: 'assistant', content: 'hello', slices: [], tool_results: [] }

    expect(getChatHistoryItemKey(userMessage, 0)).toBe('user:0')
    expect(getChatHistoryItemKey(assistantMessage, 1)).toBe('assistant:1')
  })
})

describe('isHiddenScreenStreamPrompt', () => {
  it('hides the screen-stream user instruction, including image-part content', () => {
    const plain: ChatHistoryItem = {
      role: 'user',
      content: '[Screen] You are looking at 3 numbered frames of the user\'s screen.',
    }
    const withParts: ChatHistoryItem = {
      role: 'user',
      content: [
        { type: 'text', text: '[Screen] You are looking at 6 numbered frames of the user\'s screen.' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,abc' } },
      ],
    }

    expect(isHiddenScreenStreamPrompt(plain)).toBe(true)
    expect(isHiddenScreenStreamPrompt(withParts)).toBe(true)
  })

  it('does not hide ordinary user or assistant messages', () => {
    expect(isHiddenScreenStreamPrompt({ role: 'user', content: 'what is on my screen?' })).toBe(false)
    expect(isHiddenScreenStreamPrompt({
      role: 'assistant',
      content: '[Screen] should still be visible if she says it',
      slices: [],
      tool_results: [],
    })).toBe(false)
    expect(isHiddenScreenStreamPrompt(undefined)).toBe(false)
  })
})
