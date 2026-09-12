import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { useExpressionStore, useLive2dParams } from '@proj-airi/stage-ui-live2d'

import { formatExprPrompt } from '../expr-tag'
import { loadExpressionGroupsConfig } from '../expression-groups'

const EXPR_CONTEXT_ID = 'system:expr-groups'

export function createExprGroupsContext(): ContextMessage | undefined {
  try {
    const expressionStore = useExpressionStore()
    const live2d = useLive2dParams()
    if (!expressionStore.modelId)
      return undefined

    const available = [
      ...expressionStore.expressionGroups.keys(),
      ...live2d.availableMotions.map(motion => motion.motionName),
    ]
    const text = formatExprPrompt(loadExpressionGroupsConfig(expressionStore.modelId), available)
    if (!text)
      return undefined

    return {
      id: nanoid(),
      contextId: EXPR_CONTEXT_ID,
      strategy: ContextUpdateStrategy.ReplaceSelf,
      metadata: { source: { id: EXPR_CONTEXT_ID } },
      text,
      createdAt: Date.now(),
    }
  }
  catch {
    return undefined
  }
}
