<script setup lang="ts">
import { Callout, FieldCheckbox, FieldInput, FieldSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useWebSearchStore } from '../../stores/modules/web-search'

const { t } = useI18n()
const webSearchStore = useWebSearchStore()
// Settings persist to localStorage on change (useLocalStorageManualReset), and
// the tool + prompt react to `configured` — so there is no explicit save step.
const { enabled, apiKey, braveApiKey, serperApiKey, providerMode, configured } = storeToRefs(webSearchStore)

const providerOptions = computed(() => [
  { label: t('settings.pages.modules.web-search.provider-auto'), value: 'auto' as const },
  { label: t('settings.pages.modules.web-search.provider-tavily'), value: 'tavily' as const },
  { label: t('settings.pages.modules.web-search.provider-brave'), value: 'brave' as const },
  { label: t('settings.pages.modules.web-search.provider-serper'), value: 'serper' as const },
])
</script>

<template>
  <div
    :class="[
      'h-fit w-full',
      'flex flex-col gap-4',
      'rounded-xl bg-neutral-100 p-4 dark:bg-[rgba(0,0,0,0.3)]',
    ]"
  >
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.web-search.enable')"
      :description="t('settings.pages.modules.web-search.enable-description')"
    />

    <FieldSelect
      v-model="providerMode"
      :label="t('settings.pages.modules.web-search.provider')"
      :description="t('settings.pages.modules.web-search.provider-description')"
      :options="providerOptions"
    />

    <FieldInput
      v-model="apiKey"
      type="password"
      :label="t('settings.pages.modules.web-search.api-key')"
      :description="t('settings.pages.modules.web-search.api-key-description')"
      :placeholder="t('settings.pages.modules.web-search.api-key-placeholder')"
    />

    <FieldInput
      v-model="braveApiKey"
      type="password"
      :label="t('settings.pages.modules.web-search.brave-api-key')"
      :description="t('settings.pages.modules.web-search.brave-api-key-description')"
      :placeholder="t('settings.pages.modules.web-search.brave-api-key-placeholder')"
    />

    <FieldInput
      v-model="serperApiKey"
      type="password"
      :label="t('settings.pages.modules.web-search.serper-api-key')"
      :description="t('settings.pages.modules.web-search.serper-api-key-description')"
      :placeholder="t('settings.pages.modules.web-search.serper-api-key-placeholder')"
    />

    <Callout
      v-if="configured"
      theme="lime"
      :label="t('settings.pages.modules.web-search.configured')"
    />
  </div>
</template>
