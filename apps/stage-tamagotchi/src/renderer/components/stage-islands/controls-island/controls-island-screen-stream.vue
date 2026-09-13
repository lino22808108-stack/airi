<script setup lang="ts">
import { Button, SelectTab } from '@proj-airi/ui'
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useStageScreenStream } from '../../../composables/use-stage-screen-stream'
import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'
import ScreenStreamIcon from './screen-stream-icon.vue'

interface Props {
  iconClass?: string
  buttonStyle?: string
}

const props = withDefaults(defineProps<Props>(), {
  iconClass: 'size-5',
})

const emit = defineEmits<{
  interactionChange: [active: boolean]
}>()

const { t } = useI18n()
const {
  pickerOpen,
  starting,
  errorMessage,
  sourceCategory,
  filteredSources,
  sourceCounts,
  activeSource,
  isRefetching,
  hasFetchedOnce,
  isStreaming,
  configured,
  refetchSources,
  startCapture,
  stopCapture,
  openPicker,
  closePicker,
} = useStageScreenStream()

watch([pickerOpen, starting], ([open, busy]) => {
  emit('interactionChange', open || busy)
}, { immediate: true })

const categoryOptions = computed(() => [
  {
    label: `${t('tamagotchi.stage.controls-island.screen-stream.displays')} (${sourceCounts.value.displays})`,
    value: 'displays',
    icon: 'i-solar:screencast-2-line-duotone',
  },
  {
    label: `${t('tamagotchi.stage.controls-island.screen-stream.windows')} (${sourceCounts.value.windows})`,
    value: 'windows',
    icon: 'i-solar:window-frame-line-duotone',
  },
])

const ariaLabel = computed(() => {
  if (isStreaming.value)
    return t('tamagotchi.stage.controls-island.screen-stream.stop')
  return t('tamagotchi.stage.controls-island.screen-stream.start')
})

const isInitialLoading = computed(() => !hasFetchedOnce.value && isRefetching.value)

async function handleClick() {
  if (isStreaming.value || starting.value) {
    stopCapture()
    closePicker()
    return
  }

  await openPicker()
}

async function handlePick(sourceId: string) {
  try {
    await startCapture(sourceId)
  }
  catch {
    // errorMessage is already set by the store
  }
}

function onPickerOpenChange(open: boolean) {
  if (!open)
    closePicker()
}
</script>

<template>
  <ControlButtonTooltip disable-hoverable-content>
    <ControlButton
      v-track-button="{
        name: 'controls_island_action',
        action: isStreaming ? 'stop_screen_stream' : 'start_screen_stream',
      }"
      :button-style="props.buttonStyle"
      :aria-label="ariaLabel"
      :aria-pressed="isStreaming"
      :class="{ 'border-primary-300/70 shadow-[0_10px_24px_rgba(0,0,0,0.22)]': isStreaming }"
      @click="handleClick"
    >
      <ScreenStreamIcon
        :live="isStreaming"
        :class="[props.iconClass, 'text-neutral-800 dark:text-neutral-300']"
      />
    </ControlButton>
    <template #tooltip>
      {{ ariaLabel }}
    </template>
  </ControlButtonTooltip>

  <DialogRoot :open="pickerOpen" @update:open="onPickerOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-9999 bg-black/40 backdrop-blur-sm data-[state=closed]:animate-fadeOut data-[state=open]:animate-fadeIn" />
      <DialogContent
        :class="[
          'fixed left-1/2 top-1/2 z-9999 max-h-[min(32rem,calc(100dvh-2rem))] w-[min(28rem,calc(100dvw-2rem))]',
          'flex flex-col gap-3 overflow-hidden rounded-2xl p-3',
          'border border-neutral-200 bg-neutral-100/90 shadow-2xl shadow-black/20 outline-none backdrop-blur-xl',
          '-translate-x-1/2 -translate-y-1/2 dark:border-neutral-800 dark:bg-neutral-900/90',
        ]"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <DialogTitle class="m-0 text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              {{ t('tamagotchi.stage.controls-island.screen-stream.pick') }}
            </DialogTitle>
            <DialogDescription class="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {{ t('tamagotchi.stage.controls-island.screen-stream.pick-hint') }}
            </DialogDescription>
          </div>
          <Button
            size="sm"
            :label="isRefetching ? t('tamagotchi.stage.controls-island.screen-stream.loading') : t('tamagotchi.stage.controls-island.refresh')"
            icon="i-solar:refresh-linear"
            :disabled="isRefetching || starting"
            @click="refetchSources()"
          />
        </div>

        <p v-if="!configured" class="rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {{ t('tamagotchi.stage.controls-island.screen-stream.vision-unconfigured') }}
        </p>
        <p v-if="errorMessage" class="rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
          {{ errorMessage }}
        </p>

        <SelectTab
          v-model="sourceCategory"
          size="sm"
          :options="categoryOptions"
        />

        <div class="min-h-0 flex-1 overflow-y-auto">
          <div
            v-if="isInitialLoading"
            class="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500"
          >
            <div class="i-svg-spinners:ring-resize text-lg" />
            {{ t('tamagotchi.stage.controls-island.screen-stream.loading') }}
          </div>

          <div
            v-else-if="filteredSources.length === 0"
            class="flex flex-col items-center justify-center gap-1 py-10 text-sm text-neutral-500"
          >
            <div class="i-solar:monitor-linear text-2xl" />
            {{ t('tamagotchi.stage.controls-island.screen-stream.empty') }}
          </div>

          <div v-else class="grid grid-cols-2 gap-2">
            <button
              v-for="source in filteredSources"
              :key="source.id"
              type="button"
              :disabled="starting || !configured"
              :class="[
                'flex flex-col gap-1.5 rounded-xl p-2 text-left',
                'border border-transparent bg-white/60 dark:bg-neutral-800/50',
                'transition duration-200 hover:border-neutral-300 dark:hover:border-neutral-600',
                activeSource?.id === source.id ? 'border-primary-400/70' : '',
              ]"
              @click="handlePick(source.id)"
            >
              <div class="aspect-video w-full overflow-hidden rounded-lg bg-neutral-200/70 dark:bg-neutral-950">
                <img
                  v-if="source.thumbnailURL"
                  :src="source.thumbnailURL"
                  :alt="source.name"
                  class="h-full w-full object-cover"
                >
                <div
                  v-else
                  class="h-full w-full flex items-center justify-center text-neutral-400 i-solar:monitor-linear"
                />
              </div>
              <span class="line-clamp-1 text-xs text-neutral-700 dark:text-neutral-200">
                {{ source.name }}
              </span>
            </button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
