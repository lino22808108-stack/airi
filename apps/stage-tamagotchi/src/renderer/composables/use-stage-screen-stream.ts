import type { SourcesOptions } from 'electron'

import { errorMessageFrom } from '@moeru/std'
import { useVisionOrchestratorStore, useVisionProcessingStore, useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { useVisionScreenCapture } from './use-vision-screen-capture'

type SourceCategory = 'displays' | 'windows'

const sourcesOptions: SourcesOptions = {
  types: ['screen', 'window'],
  fetchWindowIcons: true,
}

function hasLiveVideoStream(stream: MediaStream | null | undefined) {
  if (!stream)
    return false

  return stream.getVideoTracks().some(track => track.readyState === 'live')
}

/**
 * Desktop controls-island screen share: pick a display/window, then feed
 * frames into the existing vision orchestrator so the character can see it.
 */
export function useStageScreenStream() {
  const visionStore = useVisionStore()
  const visionProcessingStore = useVisionProcessingStore()
  const visionOrchestratorStore = useVisionOrchestratorStore()
  const { configured } = storeToRefs(visionStore)
  const { isRunning } = storeToRefs(visionProcessingStore)

  const videoRef = ref<HTMLVideoElement | null>(null)
  const pickerOpen = ref(false)
  const starting = ref(false)
  const errorMessage = ref('')
  const sourceCategory = ref<SourceCategory>('displays')

  const {
    sources,
    activeSourceId,
    activeSource,
    activeStream,
    isRefetching,
    hasFetchedOnce,
    refetchSources,
    startStream,
    stopStream,
    cleanup,
    captureFrame,
  } = useVisionScreenCapture(sourcesOptions)

  const isStreaming = computed(() => hasLiveVideoStream(activeStream.value))

  const isDisplaySource = (source: { id: string }) => source.id.startsWith('screen:')
  const isWindowSource = (source: { id: string }) => source.id.startsWith('window:')

  const filteredSources = computed(() => {
    if (sourceCategory.value === 'windows')
      return sources.value.filter(isWindowSource)
    return sources.value.filter(isDisplaySource)
  })

  const sourceCounts = computed(() => ({
    displays: sources.value.filter(isDisplaySource).length,
    windows: sources.value.filter(isWindowSource).length,
  }))

  watch(activeStream, (stream) => {
    if (!hasLiveVideoStream(stream) && isRunning.value)
      visionProcessingStore.stopTicker()
  })

  async function ensureVideoStream() {
    const stream = await startStream()
    const video = videoRef.value
    if (!video)
      throw new Error('Screen-share video element is missing')

    video.srcObject = stream
    await video.play()

    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 2) {
        resolve()
        return
      }

      const timeout = window.setTimeout(() => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        reject(new Error('Screen stream did not start'))
      }, 8000)

      const handleLoadedMetadata = () => {
        window.clearTimeout(timeout)
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        resolve()
      }

      video.addEventListener('loadedmetadata', handleLoadedMetadata)
    })

    return stream
  }

  async function handleVisionTick() {
    if (!activeSourceId.value)
      return

    try {
      if (!hasLiveVideoStream(activeStream.value)) {
        stopStream()
        await ensureVideoStream()
      }

      const video = videoRef.value
      if (!video)
        return

      const dataUrl = captureFrame(video)
      if (!dataUrl)
        return

      const capturedAt = Date.now()
      const result = await visionOrchestratorStore.processCapture({
        imageDataUrl: dataUrl,
        workloadId: 'screen:interpret',
        sourceId: activeSourceId.value,
        capturedAt,
        publishContext: true,
      })

      return { capturedAt, contextUpdates: result.contextUpdates }
    }
    catch (error) {
      visionOrchestratorStore.recordError(error)
      errorMessage.value = errorMessageFrom(error)
      return { capturedAt: Date.now(), contextUpdates: 0 }
    }
  }

  async function startCapture(sourceId: string) {
    errorMessage.value = ''
    starting.value = true
    activeSourceId.value = sourceId

    try {
      await ensureVideoStream()
      if (configured.value)
        visionProcessingStore.startTicker(handleVisionTick)
      pickerOpen.value = false
    }
    catch (error) {
      visionProcessingStore.stopTicker()
      stopStream()
      errorMessage.value = errorMessageFrom(error)
      throw error
    }
    finally {
      starting.value = false
    }
  }

  function stopCapture() {
    visionProcessingStore.stopTicker()
    stopStream()
    const video = videoRef.value
    if (video) {
      video.pause()
      video.srcObject = null
    }
    starting.value = false
  }

  async function openPicker() {
    pickerOpen.value = true
    errorMessage.value = ''
    try {
      await refetchSources()
    }
    catch (error) {
      errorMessage.value = errorMessageFrom(error)
    }
  }

  function closePicker() {
    pickerOpen.value = false
  }

  onBeforeUnmount(() => {
    stopCapture()
    cleanup()
  })

  return {
    videoRef,
    pickerOpen,
    starting,
    errorMessage,
    sourceCategory,
    sources,
    filteredSources,
    sourceCounts,
    activeSource,
    activeStream,
    isRefetching,
    hasFetchedOnce,
    isStreaming,
    configured,
    refetchSources,
    startCapture,
    stopCapture,
    openPicker,
    closePicker,
  }
}
