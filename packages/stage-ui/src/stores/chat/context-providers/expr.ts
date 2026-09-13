import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { useExpressionStore, useLive2dParams } from '@proj-airi/stage-ui-live2d'

import { useSettingsStageModel } from '../../settings/stage-model'
import { formatExprPrompt } from '../expr-tag'
import { loadExpressionGroupsConfig } from '../expression-groups'

const EXPR_CONTEXT_ID = 'system:expr-groups'

export function createExprGroupsContext(): ContextMessage | undefined {
  try {
    const expressionStore = useExpressionStore()
    const live2d = useLive2dParams()
    const expressions = [...expressionStore.expressionGroups.keys()]
    const motions = [...new Set(live2d.availableMotions.map(motion => motion.motionName))]
    const available = [...new Set([...expressions, ...motions])]
    if (available.length === 0)
      return undefined

    const modelId = expressionStore.modelId || useSettingsStageModel().stageModelSelected
    const text = formatExprPrompt(
      loadExpressionGroupsConfig(modelId),
      available,
      { expressions, motions },
    )
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
