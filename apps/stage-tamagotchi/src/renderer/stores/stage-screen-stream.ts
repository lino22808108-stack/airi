import type { SourcesOptions } from 'electron'

import { errorMessageFrom } from '@moeru/std'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useVisionProcessingStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useVisionScreenCapture } from '../composables/use-vision-screen-capture'
import {
  computeFingerprintFromDataUrl,
  dataUrlToImageAttachment,
  isSceneChange,
} from './scene-fingerprint'

type SourceCategory = 'displays' | 'windows'

const sourcesOptions: SourcesOptions = {
  types: ['screen', 'window'],
  fetchWindowIcons: true,
}

const CAPTURE_MAX_WIDTH = 1280
const CAPTURE_MAX_HEIGHT = 720
const CAPTURE_JPEG_QUALITY = 0.82
export const MAX_SCREEN_STREAM_FRAMES = 9
const OVERLAY_FRAMES_VISIBLE_KEY = 'stage/screen-stream/overlay-frames-visible'

export function clampCommentAfterChanges(value: number) {
  if (!Number.isFinite(value))
    return 3
  return Math.min(MAX_SCREEN_STREAM_FRAMES, Math.max(1, Math.round(value)))
}

/** 1 → 1×1, 2 → 1×2, 3 → 1×3, 4 → 2×2, 6 → 2×3, 9 → 3×3. */
export function overlayColumnCount(frameCount: number) {
  const n = clampCommentAfterChanges(frameCount)
  if (n <= 1)
    return 1
  if (n === 2 || n === 4)
    return 2
  return 3
}

export function overlayPanelWidthRem(frameCount: number) {
  const n = clampCommentAfterChanges(frameCount)
  const cols = overlayColumnCount(n)
  const thumb = n <= 3 ? 6.75 : n <= 6 ? 5.15 : 4.15
  const gap = n <= 6 ? 0.375 : 0.25
  const pad = n <= 6 ? 1 : 0.75
  return Number((cols * thumb + Math.max(0, cols - 1) * gap + pad).toFixed(2))
}

function readOverlayFramesVisible() {
  if (typeof localStorage === 'undefined')
    return true

  try {
    return localStorage.getItem(OVERLAY_FRAMES_VISIBLE_KEY) !== '0'
  }
  catch {
    return true
  }
}

function persistOverlayFramesVisible(visible: boolean) {
  if (typeof localStorage === 'undefined')
    return

  try {
    localStorage.setItem(OVERLAY_FRAMES_VISIBLE_KEY, visible ? '1' : '0')
  }
  catch {
    // Private mode can reject storage writes.
  }
}

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

function buildScreenCommentPrompt(sceneChanges: number, frameCount: number) {
  return [
    `[Screen] You are looking at ${frameCount} numbered frames of the user's screen.`,
    'Frame 1 is the oldest, the last frame is the newest.',
    `There have been ${sceneChanges} distinct scene change${sceneChanges === 1 ? '' : 's'} since your last comment.`,
    'Comment in character, briefly, about what you see.',
    'Do not mention screenshots, numbered frames, or that you are watching a stream unless asked.',
  ].join(' ')
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
 * Lives outside the collapsing island so Chrome keeps decoding frames.
 * Consciousness (the chat model) is her eyes: N numbered frames
 * are shown (max 9), and she comments after N scene changes.
 */
export const useStageScreenStreamStore = defineStore('stage-screen-stream', () => {
  const consciousnessStore = useConsciousnessStore()
  const visionProcessingStore = useVisionProcessingStore()
  const modsServerChannelStore = useModsServerChannelStore()
  const chatStore = useChatStore()
  const chatSession = useChatSessionStore()
  const { configured } = storeToRefs(consciousnessStore)
  const { isRunning, commentAfterSceneChanges } = storeToRefs(visionProcessingStore)

  const videoRef = ref<HTMLVideoElement | null>(null)
  const pickerOpen = ref(false)
  const starting = ref(false)
  const ignoringStreamDrop = ref(false)
  const errorMessage = ref('')
  const sourceCategory = ref<SourceCategory>('displays')
  const previewFrames = ref<string[]>([])
  const sceneChangesSinceComment = ref(0)
  const lastFingerprint = ref<Uint8Array | null>(null)
  const commentInFlight = ref(false)
  const overlayFramesVisible = ref(readOverlayFramesVisible())

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
  const neededSceneChanges = computed(() => clampCommentAfterChanges(commentAfterSceneChanges.value))

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

  function resetFrameState() {
    previewFrames.value = []
    sceneChangesSinceComment.value = 0
    lastFingerprint.value = null
    commentInFlight.value = false
  }

  function toggleOverlayFramesVisible() {
    overlayFramesVisible.value = !overlayFramesVisible.value
  }

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

  async function commentOnFrames() {
    if (commentInFlight.value || chatStore.sending)
      return false
    if (previewFrames.value.length === 0)
      return false

    let sessionId = chatSession.activeSessionId
    if (!sessionId)
      sessionId = await chatSession.ensureCurrentSession()
    if (!sessionId)
      return false

    const attachments = previewFrames.value
      .map(dataUrlToImageAttachment)
      .filter((attachment): attachment is { type: 'image', data: string, mimeType: string } => attachment !== null)

    if (attachments.length === 0)
      return false

    commentInFlight.value = true
    try {
      await chatStore.send({
        sessionId,
        text: buildScreenCommentPrompt(sceneChangesSinceComment.value, attachments.length),
        attachments,
      })
      sceneChangesSinceComment.value = 0
      return true
    }
    finally {
      commentInFlight.value = false
    }
  }

  async function ingestCapturedFrame(dataUrl: string) {
    const fingerprint = await computeFingerprintFromDataUrl(dataUrl)
    const changed = !fingerprint || isSceneChange(lastFingerprint.value, fingerprint)
    if (fingerprint)
      lastFingerprint.value = fingerprint

    if (changed) {
      previewFrames.value = [...previewFrames.value, dataUrl].slice(-neededSceneChanges.value)
      sceneChangesSinceComment.value += 1
    }
    else if (previewFrames.value.length === 0) {
      previewFrames.value = [dataUrl]
    }

    let commented = false
    if (sceneChangesSinceComment.value >= neededSceneChanges.value)
      commented = await commentOnFrames()

    return { changed, commented }
  }

  async function handleStreamTick() {
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
      const result = await ingestCapturedFrame(dataUrl)
      return { capturedAt, contextUpdates: result.changed || result.commented ? 1 : 0 }
    }
    catch (error) {
      errorMessage.value = errorMessageFrom(error)
      return { capturedAt: Date.now(), contextUpdates: 0 }
    }
  }

  function startStreamTicker() {
    if (!configured.value)
      return false

    visionProcessingStore.startTicker(handleStreamTick)
    return true
  }

  watch(overlayFramesVisible, persistOverlayFramesVisible)

  watch(neededSceneChanges, (limit) => {
    if (previewFrames.value.length > limit)
      previewFrames.value = previewFrames.value.slice(-limit)
  })

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
      startStreamTicker()
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
        throw new Error('Consciousness model is not configured')

      resetFrameState()
      await ensureVideoStream()
      await modsServerChannelStore.ensureConnected().catch(() => {})
      startStreamTicker()
      pickerOpen.value = false
    }
    catch (error) {
      visionProcessingStore.stopTicker()
      stopStream()
      resetFrameState()
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
    resetFrameState()
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
    previewFrames,
    sceneChangesSinceComment,
    commentAfterSceneChanges,
    neededSceneChanges,
    overlayFramesVisible,
    toggleOverlayFramesVisible,
    bindVideoElement,
    refetchSources,
    startCapture,
    stopCapture,
    openPicker,
    closePicker,
    cleanupSession,
    ingestCapturedFrame,
  }
})
