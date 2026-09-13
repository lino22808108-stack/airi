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
  ensureConnected: vi.fn(async () => {}),
  startTicker: vi.fn(),
  stopTicker: vi.fn(),
}))

const chatMocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ messages: [], sessionId: 'session-1' })),
  sending: false,
  ensureCurrentSession: vi.fn(async () => 'session-1'),
}))

const fingerprintMocks = vi.hoisted(() => ({
  next: new Uint8Array(24 * 24).fill(10),
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

vi.mock('./scene-fingerprint', async () => {
  const actual = await vi.importActual<typeof import('./scene-fingerprint')>('./scene-fingerprint')
  return {
    ...actual,
    computeFingerprintFromDataUrl: vi.fn(async () => fingerprintMocks.next.slice()),
  }
})

vi.mock('@proj-airi/stage-ui/stores/modules/vision', async () => {
  const { defineStore } = await import('pinia')
  const { ref: vueRef } = await import('vue')

  return {
    useVisionProcessingStore: defineStore('vision-processing', () => {
      const isRunning = vueRef(false)
      const commentAfterSceneChanges = vueRef(2)
      function startTicker(handler: unknown) {
        visionMocks.startTicker(handler)
        isRunning.value = true
      }
      function stopTicker() {
        visionMocks.stopTicker()
        isRunning.value = false
      }
      return { isRunning, commentAfterSceneChanges, startTicker, stopTicker }
    }),
  }
})

vi.mock('@proj-airi/stage-ui/stores/modules/consciousness', async () => {
  const { defineStore } = await import('pinia')
  const { computed: vueComputed, ref: vueRef } = await import('vue')

  return {
    useConsciousnessStore: defineStore('consciousness', () => {
      const activeProvider = vueRef('openrouter')
      const activeModel = vueRef('z-ai/glm-5.3-flash')
      const configured = vueComputed(() => !!activeProvider.value && !!activeModel.value)
      return { activeProvider, activeModel, configured }
    }),
  }
})

vi.mock('@proj-airi/stage-ui/stores/chat', () => ({
  useChatStore: () => ({
    send: chatMocks.send,
    sending: chatMocks.sending,
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/chat/session-store', () => ({
  useChatSessionStore: () => ({
    activeSessionId: 'session-1',
    ensureCurrentSession: chatMocks.ensureCurrentSession,
  }),
}))

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
    visionMocks.ensureConnected.mockClear()
    visionMocks.startTicker.mockClear()
    visionMocks.stopTicker.mockClear()
    chatMocks.send.mockClear()
    chatMocks.ensureCurrentSession.mockClear()
    chatMocks.sending = false
    fingerprintMocks.next = new Uint8Array(24 * 24).fill(10)
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

  it('starts the live ticker when a source is captured', async () => {
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

  it('does not start capture without a consciousness model', async () => {
    const { useStageScreenStreamStore } = await import('./stage-screen-stream')
    const { useConsciousnessStore } = await import('@proj-airi/stage-ui/stores/modules/consciousness')
    const { useVisionProcessingStore } = await import('@proj-airi/stage-ui/stores/modules/vision')
    const consciousnessStore = useConsciousnessStore()
    consciousnessStore.activeProvider = ''
    consciousnessStore.activeModel = ''

    const store = useStageScreenStreamStore()
    const processing = useVisionProcessingStore()
    store.bindVideoElement(bindFakeVideo())

    await expect(store.startCapture('screen:0:0')).rejects.toThrow('Consciousness model is not configured')
    expect(visionMocks.startTicker).not.toHaveBeenCalled()
    expect(processing.isRunning).toBe(false)
    expect(stopStream).toHaveBeenCalled()
  })

  it('comments through the chat model after N scene changes, with the last frames attached', async () => {
    const { useStageScreenStreamStore } = await import('./stage-screen-stream')
    const store = useStageScreenStreamStore()
    store.bindVideoElement(bindFakeVideo())
    await store.startCapture('screen:0:0')

    fingerprintMocks.next = new Uint8Array(24 * 24).fill(10)
    await store.ingestCapturedFrame('data:image/jpeg;base64,frame1')
    expect(chatMocks.send).not.toHaveBeenCalled()

    fingerprintMocks.next = new Uint8Array(24 * 24).fill(200)
    await store.ingestCapturedFrame('data:image/jpeg;base64,frame2')

    expect(chatMocks.send).toHaveBeenCalledTimes(1)
    const payload = chatMocks.send.mock.calls[0][0]
    expect(payload.sessionId).toBe('session-1')
    expect(payload.attachments).toEqual([
      { type: 'image', mimeType: 'image/jpeg', data: 'frame1' },
      { type: 'image', mimeType: 'image/jpeg', data: 'frame2' },
    ])
    expect(payload.text.startsWith('[Screen]')).toBe(true)
    expect(payload.text).toContain('scene change')
    expect(store.previewFrames).toHaveLength(2)
    expect(store.sceneChangesSinceComment).toBe(0)
  })

  it('keeps N overlay frames up to 9 and comments with that many attachments', async () => {
    const { useStageScreenStreamStore } = await import('./stage-screen-stream')
    const { useVisionProcessingStore } = await import('@proj-airi/stage-ui/stores/modules/vision')
    const processing = useVisionProcessingStore()
    processing.commentAfterSceneChanges = 6

    const store = useStageScreenStreamStore()
    store.bindVideoElement(bindFakeVideo())
    await store.startCapture('screen:0:0')

    for (let index = 1; index <= 6; index += 1) {
      fingerprintMocks.next = new Uint8Array(24 * 24).fill(index * 40)
      await store.ingestCapturedFrame(`data:image/jpeg;base64,frame${index}`)
    }

    expect(chatMocks.send).toHaveBeenCalledTimes(1)
    const payload = chatMocks.send.mock.calls[0][0]
    expect(payload.attachments).toHaveLength(6)
    expect(payload.text).toContain('6 numbered frames')
    expect(store.previewFrames).toHaveLength(6)
    expect(store.neededSceneChanges).toBe(6)
  })

  it('clamps overlay and comment count to 9, with 3×3 columns at max', async () => {
    const {
      clampCommentAfterChanges,
      overlayColumnCount,
      overlayPanelWidthRem,
      useStageScreenStreamStore,
    } = await import('./stage-screen-stream')
    const { useVisionProcessingStore } = await import('@proj-airi/stage-ui/stores/modules/vision')
    const processing = useVisionProcessingStore()
    processing.commentAfterSceneChanges = 99

    const store = useStageScreenStreamStore()
    expect(store.neededSceneChanges).toBe(9)
    expect(clampCommentAfterChanges(10)).toBe(9)
    expect(overlayColumnCount(1)).toBe(1)
    expect(overlayColumnCount(2)).toBe(2)
    expect(overlayColumnCount(3)).toBe(3)
    expect(overlayColumnCount(4)).toBe(2)
    expect(overlayColumnCount(6)).toBe(3)
    expect(overlayColumnCount(9)).toBe(3)
    expect(overlayPanelWidthRem(9)).toBeLessThan(overlayPanelWidthRem(3))
  })

  it('toggles overlay frame visibility without stopping the stream', async () => {
    const { useStageScreenStreamStore } = await import('./stage-screen-stream')
    const store = useStageScreenStreamStore()
    store.bindVideoElement(bindFakeVideo())
    await store.startCapture('screen:0:0')

    expect(store.overlayFramesVisible).toBe(true)
    store.toggleOverlayFramesVisible()
    expect(store.overlayFramesVisible).toBe(false)
    expect(store.isStreaming).toBe(true)
    store.toggleOverlayFramesVisible()
    expect(store.overlayFramesVisible).toBe(true)
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
    expect(store.previewFrames).toEqual([])
  })
})
