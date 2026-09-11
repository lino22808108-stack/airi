<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  overlayColumnCount,
  overlayPanelWidthRem,
  useStageScreenStreamStore,
} from '../stores/stage-screen-stream'

const { t } = useI18n()
const store = useStageScreenStreamStore()
const {
  isStreaming,
  previewFrames,
  sceneChangesSinceComment,
  neededSceneChanges,
  overlayFramesVisible,
} = storeToRefs(store)

function bindVideo(element: Element | null) {
  store.bindVideoElement(element instanceof HTMLVideoElement ? element : null)
}

const numberedFrames = computed(() => {
  return previewFrames.value.map((dataUrl, index) => ({
    number: index + 1,
    dataUrl,
  }))
})

const overlaySlots = computed(() => neededSceneChanges.value)
const overlayColumns = computed(() => overlayColumnCount(overlaySlots.value))
const overlayWidthRem = computed(() => overlayPanelWidthRem(overlaySlots.value))
const overlayGap = computed(() => overlaySlots.value <= 6 ? '0.375rem' : '0.25rem')
const overlayPadding = computed(() => overlaySlots.value <= 6 ? '0.5rem' : '0.375rem')
const overlayBadgeClass = computed(() => overlaySlots.value >= 7
  ? 'px-1 py-px text-[9px] font-semibold text-white'
  : 'px-1.5 py-0.5 text-[10px] font-semibold text-white')

onBeforeUnmount(() => {
  store.cleanupSession()
})
</script>

<template>
  <Teleport to="body">
    <!--
      Must stay in the document with a real decoded size.
      display:none / size-0 / contain:strict ancestors pause Chromium's
      desktop-capture decoder, which is why the island toggle previously
      looked on but produced no vision frames.
    -->
    <video
      :ref="bindVideo"
      autoplay
      muted
      playsinline
      disablepictureinpicture
      aria-hidden="true"
      class="pointer-events-none fixed left-0 top-0 z--1 h-[180px] w-[320px] opacity-0"
    />

    <div
      v-if="isStreaming && overlayFramesVisible"
      class="pointer-events-none fixed bottom-3 left-3 z-40 rounded-2xl border border-neutral-200/70 bg-neutral-100/80 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-900/80"
      :style="{
        width: `min(${overlayWidthRem}rem, calc(100dvw - 1.5rem))`,
        padding: overlayPadding,
      }"
    >
      <div class="mb-1.5 flex items-center justify-between gap-2 px-0.5">
        <span class="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          {{ t('tamagotchi.stage.controls-island.screen-stream.overlay-title') }}
        </span>
        <span class="text-[11px] text-neutral-500 dark:text-neutral-400">
          {{ t('tamagotchi.stage.controls-island.screen-stream.overlay-changes', {
            current: sceneChangesSinceComment,
            target: neededSceneChanges,
          }) }}
        </span>
      </div>
      <div
        class="grid"
        :style="{
          gridTemplateColumns: `repeat(${overlayColumns}, minmax(0, 1fr))`,
          gap: overlayGap,
        }"
      >
        <div
          v-for="slot in overlaySlots"
          :key="slot"
          class="relative overflow-hidden rounded-lg bg-neutral-200/80 dark:bg-neutral-950"
        >
          <div class="aspect-video w-full">
            <img
              v-if="numberedFrames[slot - 1]"
              :src="numberedFrames[slot - 1].dataUrl"
              :alt="String(slot)"
              class="h-full w-full object-cover"
            >
          </div>
          <span
            class="absolute left-1 top-1 rounded-md bg-black/70"
            :class="overlayBadgeClass"
          >
            {{ slot }}
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
