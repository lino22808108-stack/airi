<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useStageScreenStream } from '../../../composables/use-stage-screen-stream'
import ControlButtonTooltip from './control-button-tooltip.vue'
import ControlButton from './control-button.vue'
import OverlayFramesIcon from './overlay-frames-icon.vue'

interface Props {
  iconClass?: string
  buttonStyle?: string
}

const props = withDefaults(defineProps<Props>(), {
  iconClass: 'size-5',
})

const { t } = useI18n()
const {
  isStreaming,
  overlayFramesVisible,
  toggleOverlayFramesVisible,
} = useStageScreenStream()

const ariaLabel = computed(() => overlayFramesVisible.value
  ? t('tamagotchi.stage.controls-island.screen-stream.overlay-hide')
  : t('tamagotchi.stage.controls-island.screen-stream.overlay-show'))
</script>

<template>
  <ControlButtonTooltip v-if="isStreaming" side="inward">
    <ControlButton
      v-track-button="{
        name: 'controls_island_action',
        action: overlayFramesVisible ? 'hide_screen_stream_frames' : 'show_screen_stream_frames',
      }"
      data-testid="overlay-frames-toggle"
      :button-style="props.buttonStyle"
      :aria-label="ariaLabel"
      :aria-pressed="overlayFramesVisible"
      :class="overlayFramesVisible
        ? 'border-white/70 text-white shadow-[0_0_14px_rgba(255,255,255,0.28)]'
        : ''"
      @click="toggleOverlayFramesVisible()"
    >
      <OverlayFramesIcon
        :lit="overlayFramesVisible"
        :class="[
          props.iconClass,
          overlayFramesVisible ? 'text-white' : 'text-neutral-800 dark:text-neutral-300',
        ]"
      />
    </ControlButton>
    <template #tooltip>
      {{ ariaLabel }}
    </template>
  </ControlButtonTooltip>
</template>
