import type { SourcesOptions } from 'electron'

import { errorMessageFrom } from '@moeru/std'
import { useVisionOrchestratorStore, useVisionProcessingStore, useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useVisionScreenCapture } from '../composables/use-vision-screen-capture'

type SourceCategory = 'displays' | 'windows'

const sourcesOptions: SourcesOptions = {
  types: ['screen', 'window'],
  fetchWindowIcons: true,
}

const CAPTURE_MAX_WIDTH = 1280
const CAPTURE_MAX_HEIGHT = 720
const CAPTURE_JPEG_QUALITY = 0.82

function hasLiveVideoStream(stream: MediaStream | null | undefined) {
  if (!stream)
    return false

  return stream.getVideoTracks().some(track => track.readyState === 'live')
}

function scaleCaptureSize(width: number, height: number) {
  const scale = Math.min(CAPTURE_MAX_WIDTH / width, CAPTURE_MAX_HEIGHT / height, 1)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function captureJpegFromTrack(stream: MediaStream) {
  const track = stream.getVideoTracks().find(candidate => candidate.readyState === 'live')
  const ImageCaptureCtor = (globalThis as unknown as {
    ImageCapture?: new (mediaTrack: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> }
  }).ImageCapture

  if (!track || !ImageCaptureCtor)
    return null

  try {
    const bitmap = await new ImageCaptureCtor(track).grabFrame()
    const canvas = document.createElement('canvas')
    const size = scaleCaptureSize(bitmap.width, bitmap.height)
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) {
      bitmap.close()
      return null
    }

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', CAPTURE_JPEG_QUALITY)
  }
  catch {
    return null
  }
}

async function waitForVideoFrame(video: HTMLVideoElement, timeoutMs = 8000) {
  if (video.readyState >= 2 && video.videoWidth > 0)
    return

  await new Promise<void>((resolve, reject) => {
    let settled = false

    const finish = (error?: Error) => {
      if (settled)
        return
      settled = true
      window.clearTimeout(timeout)
      video.removeEventListener('loadeddata', onReady)
      video.removeEventListener('loadedmetadata', onReady)
      if (error)
        reject(error)
      else
        resolve()
    }

    const onReady = () => {
      if (video.readyState >= 2 && video.videoWidth > 0)
        finish()
    }

    const timeout = window.setTimeout(() => {
      finish(new Error('Screen stream did not start'))
    }, timeoutMs)

    video.addEventListener('loadeddata', onReady)
    video.addEventListener('loadedmetadata', onReady)

    if ('requestVideoFrameCallback' in video) {
      video.requestVideoFrameCallback(() => finish())
    }

    onReady()
  })
}

/**
 * Stage-window singleton for the controls-island screen share.
 *
 * Lives outside the collapsing island so Chrome keeps decoding frames,
 * and feeds them into the existing vision ticker/orchestrator.
 */
export const useStageScreenStreamStore = defineStore('stage-screen-stream', () => {
  const visionStore = useVisionStore()
  const visionProcessingStore = useVisionProcessingStore()
  const visionOrchestratorStore = useVisionOrchestratorStore()
  const modsServerChannelStore = useModsServerChannelStore()
  const { configured } = storeToRefs(visionStore)
  const { isRunning } = storeToRefs(visionProcessingStore)

  const videoRef = ref<HTMLVideoElement | null>(null)
  const pickerOpen = ref(false)
  const starting = ref(false)
  const ignoringStreamDrop = ref(false)
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

  async function attachStreamToVideo(stream: MediaStream) {
    const video = videoRef.value
    if (!video)
      throw new Error('Screen-share video element is missing')

    video.muted = true
    video.autoplay = true
    video.playsInline = true
    if (video.srcObject !== stream)
      video.srcObject = stream

    await video.play()
    await waitForVideoFrame(video)
    return video
  }

  async function ensureVideoStream() {
    const stream = await startStream()
    await attachStreamToVideo(stream)
    return stream
  }

  async function grabFrameDataUrl() {
    const stream = activeStream.value
    if (hasLiveVideoStream(stream)) {
      const fromTrack = await captureJpegFromTrack(stream)
      if (fromTrack)
        return fromTrack
    }

    const video = videoRef.value
    if (!video)
      return null

    if (video.readyState < 2 || video.videoWidth <= 0) {
      try {
        await video.play()
        await waitForVideoFrame(video, 1500)
      }
      catch {
        return null
      }
    }

    return captureFrame(video, CAPTURE_JPEG_QUALITY, CAPTURE_MAX_WIDTH, CAPTURE_MAX_HEIGHT)
  }

  async function handleVisionTick() {
    if (!activeSourceId.value)
      return

    try {
      if (!hasLiveVideoStream(activeStream.value)) {
        ignoringStreamDrop.value = true
        try {
          await ensureVideoStream()
        }
        finally {
          ignoringStreamDrop.value = false
        }
      }

      const dataUrl = await grabFrameDataUrl()
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

  function startVisionTicker() {
    if (!configured.value)
      return false

    visionProcessingStore.startTicker(handleVisionTick)
    return true
  }

  watch(activeStream, (stream) => {
    const video = videoRef.value
    if (video && hasLiveVideoStream(stream) && video.srcObject !== stream)
      void attachStreamToVideo(stream).catch(() => {})

    if (starting.value || ignoringStreamDrop.value)
      return
    if (!hasLiveVideoStream(stream) && isRunning.value)
      visionProcessingStore.stopTicker()
  })

  watch(configured, (isConfigured) => {
    if (isConfigured && isStreaming.value && !isRunning.value)
      startVisionTicker()
  })

  function bindVideoElement(element: HTMLVideoElement | null) {
    videoRef.value = element
    const stream = activeStream.value
    if (element && hasLiveVideoStream(stream))
      void attachStreamToVideo(stream).catch(() => {})
  }

  async function startCapture(sourceId: string) {
    errorMessage.value = ''
    starting.value = true
    activeSourceId.value = sourceId

    try {
      if (!configured.value)
        throw new Error('Vision model is not configured')

      await ensureVideoStream()
      await modsServerChannelStore.ensureConnected().catch(() => {})
      startVisionTicker()
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

  function cleanupSession() {
    stopCapture()
    cleanup()
  }

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
    bindVideoElement,
    refetchSources,
    startCapture,
    stopCapture,
    openPicker,
    closePicker,
    cleanupSession,
  }
})
