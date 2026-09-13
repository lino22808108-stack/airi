import type {
  FaceGroupName,
  GestureGroupName,
  HandOption,
  ModelExpressionGroupsConfig,
  StickySlot,
} from './expr-tag'

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useExpressionStore, useLive2dParams } from '@proj-airi/stage-ui-live2d'

import { useSettingsStageModel } from '../settings/stage-model'
import { autoSortAssets } from './expr-classify'
import { sortAssetsWithLlm } from './expr-llm-sort'

import {
  emptyExpressionGroupsConfig,
  emptyRecord,
  EXPR_OFF,
  EXPR_ON,
  FACE_GROUPS,
  FACE_SLOT,
  GESTURE_GROUPS,
  GESTURE_SLOT,
  HAND_OPTIONS,
  HAND_SLOT,
  pickOne,
  resolveSlotOrName,
  STICKY_SLOTS,
} from './expr-tag'


function persistenceKey(modelId: string): string {
  return `expression-groups:${modelId}`
}

function asStringLists(source: unknown, keys: readonly string[]): Record<string, string[]> {
  const empty = emptyRecord(keys)
  if (!source || typeof source !== 'object')
    return empty
  const record = source as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    empty[key] = Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
  }
  return empty
}

export function loadExpressionGroupsConfig(modelId: string): ModelExpressionGroupsConfig {
  const empty = emptyExpressionGroupsConfig()
  if (!modelId)
    return empty
  try {
    const raw = localStorage.getItem(persistenceKey(modelId))
    if (!raw)
      return empty
    const parsed = JSON.parse(raw) as Partial<ModelExpressionGroupsConfig> & { custom?: unknown }
    return {
      face: asStringLists(parsed.face, FACE_GROUPS) as ModelExpressionGroupsConfig['face'],
      gesture: asStringLists(parsed.gesture, GESTURE_GROUPS) as ModelExpressionGroupsConfig['gesture'],
      sticky: asStringLists(parsed.sticky, STICKY_SLOTS) as ModelExpressionGroupsConfig['sticky'],
      hand: asStringLists(parsed.hand, HAND_OPTIONS) as ModelExpressionGroupsConfig['hand'],
    }
  }
  catch {
    return empty
  }
}

function saveConfig(modelId: string, config: ModelExpressionGroupsConfig) {
  if (!modelId)
    return
  try {
    localStorage.setItem(persistenceKey(modelId), JSON.stringify(config))
  }
  catch (error) {
    console.warn('[expression-groups] Failed to persist:', error)
  }
}

export const useExpressionGroupsStore = defineStore('live2d-expression-groups', () => {
  const expressionStore = useExpressionStore()
  const live2d = useLive2dParams()
  const stageModel = useSettingsStageModel()
  const scopedModelId = ref('')
  const config = ref<ModelExpressionGroupsConfig>(emptyExpressionGroupsConfig())
  const pickerFor = ref<string | null>(null)
  const sorting = ref(false)

  function resolvedModelId(): string {
    return expressionStore.modelId || stageModel.stageModelSelected || ''
  }

  function useModel(modelId: string) {
    if (!modelId || modelId === scopedModelId.value)
      return
    scopedModelId.value = modelId
    config.value = loadExpressionGroupsConfig(modelId)
    pickerFor.value = null
  }

  watch(() => resolvedModelId(), (modelId) => {
    if (modelId)
      useModel(modelId)
  }, { immediate: true })

  function persist() {
    saveConfig(scopedModelId.value || resolvedModelId(), config.value)
  }

  function availableNames(): string[] {
    const expressions = Array.from(expressionStore.expressionGroups.keys())
    const motions = live2d.availableMotions.map(motion => motion.motionName)
    return [...new Set([...expressions, ...motions])]
  }

  function addTo(list: string[], name: string) {
    if (!list.includes(name))
      list.push(name)
  }

  function addFaceBind(group: FaceGroupName, name: string) {
    addTo(config.value.face[group], name)
    persist()
  }

  function removeFaceBind(group: FaceGroupName, name: string) {
    config.value.face[group] = config.value.face[group].filter(item => item !== name)
    persist()
  }

  function addGestureBind(group: GestureGroupName, name: string) {
    addTo(config.value.gesture[group], name)
    persist()
  }

  function removeGestureBind(group: GestureGroupName, name: string) {
    config.value.gesture[group] = config.value.gesture[group].filter(item => item !== name)
    persist()
  }

  function addStickyBind(slot: StickySlot, name: string) {
    addTo(config.value.sticky[slot], name)
    persist()
  }

  function removeStickyBind(slot: StickySlot, name: string) {
    config.value.sticky[slot] = config.value.sticky[slot].filter(item => item !== name)
    persist()
  }

  function addHandBind(slot: HandOption, name: string) {
    addTo(config.value.hand[slot], name)
    persist()
  }

  function removeHandBind(slot: HandOption, name: string) {
    config.value.hand[slot] = config.value.hand[slot].filter(item => item !== name)
    persist()
  }

  function setGroupOn(name: string, on: boolean) {
    const group = expressionStore.expressionGroups.get(name)
    if (!group)
      return
    const active = group.parameters.some((parameter) => {
      if (parameter.value === 0)
        return false
      const entry = expressionStore.expressions.get(parameter.parameterId)
      return entry != null && entry.currentValue === parameter.value
    })
    if (active !== on)
      expressionStore.toggle(name)
  }

  function playMotion(groupName: string) {
    const motion = live2d.availableMotions.find(item => item.motionName === groupName || item.fileName.endsWith(groupName))
    if (!motion)
      return
    live2d.currentMotion = { group: motion.motionName, index: motion.motionIndex }
  }

  function applyAttrs(attrs: Record<string, string> | null, missingTag: boolean) {
    const expressions = new Set(expressionStore.expressionGroups.keys())
    const motions = new Set(live2d.availableMotions.map(item => item.motionName))
    const available = new Set([...expressions, ...motions])

    const faceNames = new Set(
      FACE_GROUPS.flatMap(name => config.value.face[name] ?? []).filter(name => expressions.has(name)),
    )
    const chosenFace = attrs?.[FACE_SLOT]
    const resetFace = missingTag || !attrs || !chosenFace || chosenFace === EXPR_OFF
    if (resetFace) {
      for (const name of faceNames)
        setGroupOn(name, false)
    }
    else {
      const binds = resolveSlotOrName(chosenFace, FACE_GROUPS, config.value.face, available)
      const chosen = pickOne(binds)
      if (chosen && expressions.has(chosen)) {
        for (const name of faceNames)
          setGroupOn(name, name === chosen)
        if (!faceNames.has(chosen))
          setGroupOn(chosen, true)
      }
      else {
        for (const name of faceNames)
          setGroupOn(name, false)
        if (chosen)
          playMotion(chosen)
      }
    }

    if (!attrs)
      return

    const chosenGesture = attrs[GESTURE_SLOT]
    if (chosenGesture) {
      const binds = resolveSlotOrName(chosenGesture, GESTURE_GROUPS, config.value.gesture, available)
      const chosen = pickOne(binds)
      if (chosen && motions.has(chosen))
        playMotion(chosen)
      else if (chosen)
        setGroupOn(chosen, true)
    }

    const chosenHand = attrs[HAND_SLOT]
    if (chosenHand != null) {
      const allHand = HAND_OPTIONS.flatMap(option => config.value.hand[option] ?? []).filter(name => expressions.has(name))
      const keep = chosenHand === EXPR_OFF
        ? undefined
        : pickOne(resolveSlotOrName(chosenHand, HAND_OPTIONS, config.value.hand, available).filter(name => expressions.has(name)))
      for (const name of allHand)
        setGroupOn(name, name === keep)
      if (keep && !allHand.includes(keep))
        setGroupOn(keep, true)
    }

    for (const slot of STICKY_SLOTS) {
      const value = attrs[slot]
      if (value == null)
        continue
      const binds = (config.value.sticky[slot] ?? []).filter(name => expressions.has(name) || motions.has(name))
      const on = value === EXPR_ON || value === 'true'
      if (binds.length > 0) {
        for (const name of binds) {
          if (expressions.has(name))
            setGroupOn(name, on)
        }
        continue
      }
      if (available.has(value) && expressions.has(value))
        setGroupOn(value, on)
    }
  }

  async function autoSort() {
    if (sorting.value)
      return config.value
    sorting.value = true
    try {
      const expressions = Array.from(expressionStore.expressionGroups.keys())
      const motions = [...new Set(live2d.availableMotions.map(item => item.motionName))]
      const heuristic = autoSortAssets({ expressions, motions })
      const llm = await sortAssetsWithLlm({ expressions, motions }).catch((error) => {
        console.warn('[expression-groups] LLM sort failed, using name heuristic', error)
        return null
      })
      config.value = llm ?? heuristic
      persist()
      return config.value
    }
    finally {
      sorting.value = false
    }
  }

  const liveAvailable = computed(() => availableNames())

  return {
    config,
    pickerFor,
    sorting,
    liveAvailable,
    availableNames,
    useModel,
    addFaceBind,
    removeFaceBind,
    addGestureBind,
    removeGestureBind,
    addStickyBind,
    removeStickyBind,
    addHandBind,
    removeHandBind,
    applyAttrs,
    autoSort,
    playMotion,
  }
})
