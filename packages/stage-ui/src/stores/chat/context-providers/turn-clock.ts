import type { ContextMessage } from '../../../types/chat'
import type { ChatClientSurface } from '../turn-clock'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import {
  formatTurnClock,
  lastMessageTimestamp,
  peekLastSurface,
  rememberSurface,
} from '../turn-clock'

const TURN_CLOCK_CONTEXT_ID = 'system:turn-clock'

export function createTurnClockContext(input: {
  sessionId: string
  surface: ChatClientSurface
  messages: Array<{ role?: string, createdAt?: number }>
  now?: number
}): ContextMessage {
  const now = input.now ?? Date.now()
  const text = formatTurnClock({
    now,
    surface: input.surface,
    previousAt: lastMessageTimestamp(input.messages),
    previousSurface: peekLastSurface(input.sessionId),
  })
  rememberSurface(input.sessionId, input.surface)

  return {
    id: nanoid(),
    contextId: TURN_CLOCK_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: { source: { id: TURN_CLOCK_CONTEXT_ID } },
    text,
    createdAt: now,
  }
}
