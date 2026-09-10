import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref, shallowRef } from 'vue'

const liveTrack = {
  readyState: 'live' as const,
  stop: vi.fn(),
  addEventListener: vi.fn(),
}

function createLiveStream() {
  return {
    getVideoTracks: () => [liveTrack],
    getTracks: () => [liveTrack],
  } as unknown as MediaStream
}

const activeSourceId = ref('screen:0:0')
const activeStream = shallowRef<MediaStream | null>(null)
const startStream = vi.fn(async () => {
  activeStream.value = createLiveStream()
  return activeStream.value
})
const stopStream = vi.fn(() => {
  activeStream.value = null
})
const captureFrame = vi.fn(() => 'data:image/jpeg;base64,frame')
const cleanup = vi.fn()
const refetchSources = vi.fn(async () => {})

const visionMocks = vi.hoisted(() => ({
  processCapture: vi.fn(async () => ({ contextUpdates: 1, text: 'a desktop' })),
  recordError: vi.fn(),
  ensureConnected: vi.fn(async () => {}),
  startTicker: vi.fn(),
  stopTicker: vi.fn(),
}))

vi.mock('../composables/use-vision-screen-capture', () => ({
  useVisionScreenCapture: () => ({
    sources: ref([]),
    activeSourceId,
    activeSource: computed(() => null),
    activeStream,
    isRefetching: ref(false),
    hasFetchedOnce: ref(true),
    refetchSources,
    startStream,
    stopStream,
    cleanup,
    captureFrame,
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/modules/vision', async () => {
  const { defineStore } = await import('pinia')
  const { computed: vueComputed, ref: vueRef } = await import('vue')

  return {
    useVisionStore: defineStore('vision', () => {
      const activeProvider = vueRef('openrouter')
      const activeModel = vueRef('z-ai/glm-5.3-flash')
      const configured = vueComputed(() => !!activeProvider.value && !!activeModel.value)
      return { activeProvider, activeModel, configured }
    }),
    useVisionProcessingStore: defineStore('vision-processing', () => {
      const isRunning = vueRef(false)
      function startTicker(handler: unknown) {
        visionMocks.startTicker(handler)
        isRunning.value = true
      }
      function stopTicker() {
        visionMocks.stopTicker()
        isRunning.value = false
      }
      return { isRunning, startTicker, stopTicker }
    }),
    useVisionOrchestratorStore: defineStore('vision-orchestrator', () => ({
      processCapture: visionMocks.processCapture,
      recordError: visionMocks.recordError,
    })),
  }
})

vi.mock('@proj-airi/stage-ui/stores/mods/api/channel-server', () => ({
  useModsServerChannelStore: () => ({
    ensureConnected: visionMocks.ensureConnected,
    sendContextUpdate: vi.fn(),
  }),
}))

describe('stage screen stream store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    activeSourceId.value = 'screen:0:0'
    activeStream.value = null
    startStream.mockClear()
    stopStream.mockClear()
    captureFrame.mockClear()
    cleanup.mockClear()
    visionMocks.processCapture.mockClear()
    visionMocks.recordError.mockClear()
    visionMocks.ensureConnected.mockClear()
    visionMocks.startTicker.mockClear()
    visionMocks.stopTicker.mockClear()
  })

  function bindFakeVideo() {
    return {
      muted: false,
      autoplay: false,
      playsInline: false,
      srcObject: null as MediaStream | null,
      readyState: 2,
      videoWidth: 1280,
      videoHeight: 720,
      play: vi.fn(async () => {}),
      pause: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestVideoFrameCallback: vi.fn((cb: () => void) => cb()),
    } as unknown as HTMLVideoElement
  }

  it('starts the existing vision ticker when a source is captured', async () => {
    const { useStageScreenStreamStore } = await import('./stage-screen-stream')
    const { useVisionProcessingStore } = await import('@proj-airi/stage-ui/stores/modules/vision')
    const store = useStageScreenStreamStore()
    const processing = useVisionProcessingStore()
    store.bindVideoElement(bindFakeVideo())

    await store.startCapture('screen:0:0')

    expect(startStream).toHaveBeenCalledTimes(1)
    expect(visionMocks.ensureConnected).toHaveBeenCalledTimes(1)
    expect(visionMocks.startTicker).toHaveBeenCalledTimes(1)
    expect(processing.isRunning).toBe(true)
    expect(store.isStreaming).toBe(true)
    expect(store.pickerOpen).toBe(false)
  })

  it('does not start capture without a vision model', async () => {
    const { useStageScreenStreamStore } = await import('./stage-screen-stream')
    const { useVisionStore, useVisionProcessingStore } = await import('@proj-airi/stage-ui/stores/modules/vision')
    const visionStore = useVisionStore()
    visionStore.activeProvider = ''
    visionStore.activeModel = ''

    const store = useStageScreenStreamStore()
    const processing = useVisionProcessingStore()
    store.bindVideoElement(bindFakeVideo())

    await expect(store.startCapture('screen:0:0')).rejects.toThrow('Vision model is not configured')
    expect(visionMocks.startTicker).not.toHaveBeenCalled()
    expect(processing.isRunning).toBe(false)
    expect(stopStream).toHaveBeenCalled()
  })

  it('stopCapture tears down both the ticker and the live stream', async () => {
    const { useStageScreenStreamStore } = await import('./stage-screen-stream')
    const { useVisionProcessingStore } = await import('@proj-airi/stage-ui/stores/modules/vision')
    const store = useStageScreenStreamStore()
    const processing = useVisionProcessingStore()
    store.bindVideoElement(bindFakeVideo())

    await store.startCapture('screen:0:0')
    store.stopCapture()

    expect(visionMocks.stopTicker).toHaveBeenCalled()
    expect(processing.isRunning).toBe(false)
    expect(stopStream).toHaveBeenCalled()
    expect(store.isStreaming).toBe(false)
  })
})
