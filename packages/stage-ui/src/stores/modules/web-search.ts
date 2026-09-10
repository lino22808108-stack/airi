import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, watch } from 'vue'

import { WEB_SEARCH_TOOLSET_PROMPT } from '../../tools/web-search'
import { useLlmToolsetPromptsStore } from '../ai/chat-llm/toolset-prompts'

export type WebSearchProviderMode = 'auto' | 'tavily' | 'brave' | 'serper'

function hasKey(value: string) {
  return value.trim().length > 0
}

/**
 * Settings + lifecycle for the web-search capability (Tavily / Brave / Serper).
 *
 * Renderer-only: unlike the messaging modules it does not broadcast to a backend
 * service, so there is no configurator channel here. The tool itself is mounted
 * by `resolveWebSearchTools` in `stores/ai/chat-llm/tool-resolver.ts`, gated on
 * {@link configured}; this store owns the paired system-prompt guidance so the
 * "web content is data, not instructions" rule is present exactly when the tool
 * is, and gone when it is not.
 */
export const useWebSearchStore = defineStore('web-search', () => {
  const toolsetPromptsStore = useLlmToolsetPromptsStore()

  const enabled = useLocalStorageManualReset<boolean>('settings/web-search/enabled', false)
  const apiKey = useLocalStorageManualReset<string>('settings/web-search/api-key', '')
  const braveApiKey = useLocalStorageManualReset<string>('settings/web-search/brave-api-key', '')
  const serperApiKey = useLocalStorageManualReset<string>('settings/web-search/serper-api-key', '')
  const providerMode = useLocalStorageManualReset<WebSearchProviderMode>('settings/web-search/provider-mode', 'auto')

  const configured = computed(() => {
    if (!enabled.value)
      return false
    const mode = providerMode.value
    if (mode === 'tavily')
      return hasKey(apiKey.value)
    if (mode === 'brave')
      return hasKey(braveApiKey.value)
    if (mode === 'serper')
      return hasKey(serperApiKey.value)
    return hasKey(apiKey.value) || hasKey(braveApiKey.value) || hasKey(serperApiKey.value)
  })

  // Keep the safety/when-to-search guidance mounted iff the tool is mounted.
  // Clauses must key off the same `configured` gate the tool does, never a raw
  // key read, so the model is never told about a tool it cannot call.
  watch(configured, (isConfigured) => {
    if (isConfigured)
      toolsetPromptsStore.registerToolsetPrompts('web-search', [{ id: 'web-search', content: WEB_SEARCH_TOOLSET_PROMPT }])
    else
      toolsetPromptsStore.clearToolsetPrompts('web-search')
  }, { immediate: true })

  function resetState() {
    enabled.reset()
    apiKey.reset()
    braveApiKey.reset()
    serperApiKey.reset()
    providerMode.reset()
  }

  return {
    enabled,
    apiKey,
    braveApiKey,
    serperApiKey,
    providerMode,
    configured,
    resetState,
  }
})
