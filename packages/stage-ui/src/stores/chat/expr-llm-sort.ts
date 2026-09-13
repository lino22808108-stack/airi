import type { ModelExpressionGroupsConfig } from './expr-tag'

import { generateText } from '@xsai/generate-text'

import { useConsciousnessStore } from '../modules/consciousness'
import { useProviderStore } from '../providers/provider'
import { buildSortPrompt, parseLlmSortResult } from './expr-classify'


export async function sortAssetsWithLlm(input: {
  expressions: string[]
  motions: string[]
}): Promise<ModelExpressionGroupsConfig | null> {
  const names = [...input.expressions, ...input.motions]
  if (names.length === 0)
    return null

  const consciousness = useConsciousnessStore()
  const providerId = consciousness.activeProvider
  const model = consciousness.activeModel
  if (!providerId || !model)
    return null

  const providers = useProviderStore()
  const chatProvider = await providers.getProviderInstance(providerId) as any
  const chatConfig = chatProvider.chat(model)

  const response = await generateText({
    ...chatConfig,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: 'You classify Live2D file names into emotion/gesture/prop slots. JSON only.',
      },
      {
        role: 'user',
        content: buildSortPrompt(input),
      },
    ],
    headers: { 'Accept-Encoding': 'identity' },
  })

  const raw = (response.text || '').trim()
  if (!raw)
    return null

  return parseLlmSortResult(raw, names)
}
