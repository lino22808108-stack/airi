<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

import { useStageScreenStreamStore } from '../stores/stage-screen-stream'

const store = useStageScreenStreamStore()

function bindVideo(element: Element | null) {
  store.bindVideoElement(element instanceof HTMLVideoElement ? element : null)
}

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
  </Teleport>
</template>
