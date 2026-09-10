import { storeToRefs } from 'pinia'

import { useStageScreenStreamStore } from '../stores/stage-screen-stream'

/**
 * Controls-island / host access to the stage-window screen-share session.
 * State lives in a Pinia store so collapsing the island cannot tear down
 * the MediaStream or the vision ticker.
 */
export function useStageScreenStream() {
  const store = useStageScreenStreamStore()
  const {
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
  } = storeToRefs(store)

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
    bindVideoElement: store.bindVideoElement,
    refetchSources: store.refetchSources,
    startCapture: store.startCapture,
    stopCapture: store.stopCapture,
    openPicker: store.openPicker,
    closePicker: store.closePicker,
    cleanupSession: store.cleanupSession,
  }
}
