<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount } from 'vue'

import {
  overlayColumnCount,
  overlayPanelWidthRem,
  useStageScreenStreamStore,
} from '../stores/stage-screen-stream'

const store = useStageScreenStreamStore()
const {
  isStreaming,
  previewFrames,
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
const overlayRows = computed(() => Math.ceil(overlaySlots.value / Math.max(1, overlayColumns.value)))
const overlayWidthRem = computed(() => overlayPanelWidthRem(overlaySlots.value))
const overlayGap = 0.25
const overlayPadding = 0.35
// Old title row ("Смены / Экран сцены") was ~1.35rem. Keep that height
// in the panel and give it to the thumbs instead of shrinking the window.
const TITLE_SLOT_REM = 1.35
const overlayCellHeightRem = computed(() => {
  const n = overlaySlots.value
  const thumb = n <= 3 ? 4.35 : n <= 6 ? 3.2 : 2.7
  const rows = overlayRows.value
  return Number((thumb * 9 / 16 + TITLE_SLOT_REM / rows).toFixed(3))
})
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
      class="pointer-events-none fixed left-0 top-0 z--1 h-[160px] w-[240px] max-h-[100vh] max-w-[100vw] opacity-0"
    />

    <div
      v-if="isStreaming && overlayFramesVisible"
      class="pointer-events-none fixed bottom-1 left-1/2 z-30 rounded-xl border border-neutral-200/70 bg-neutral-100/80 shadow-xl shadow-black/20 backdrop-blur-xl dark:border-neutral-800/70 dark:bg-neutral-900/80"
      :style="{
        width: `min(${overlayWidthRem}rem, calc(100dvw - 6.5rem))`,
        transform: 'translateX(-50%)',
        padding: `${overlayPadding}rem`,
      }"
    >
      <div
        class="grid"
        :style="{
          gridTemplateColumns: `repeat(${overlayColumns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${overlayRows}, ${overlayCellHeightRem}rem)`,
          gap: `${overlayGap}rem`,
        }"
      >
        <div
          v-for="slot in overlaySlots"
          :key="slot"
          class="relative h-full w-full overflow-hidden rounded-lg bg-neutral-200/80 dark:bg-neutral-950"
        >
          <img
            v-if="numberedFrames[slot - 1]"
            :src="numberedFrames[slot - 1].dataUrl"
            :alt="String(slot)"
            class="h-full w-full object-cover"
          >
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
