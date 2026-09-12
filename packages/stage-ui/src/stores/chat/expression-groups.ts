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

import { autoSortAssets } from './expr-classify'
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
  const scopedModelId = ref('')
  const config = ref<ModelExpressionGroupsConfig>(emptyExpressionGroupsConfig())
  const pickerFor = ref<string | null>(null)

  function useModel(modelId: string) {
    if (!modelId || modelId === scopedModelId.value)
      return
    scopedModelId.value = modelId
    config.value = loadExpressionGroupsConfig(modelId)
    pickerFor.value = null
  }

  watch(() => expressionStore.modelId, (modelId) => {
    if (modelId)
      useModel(modelId)
  }, { immediate: true })

  function persist() {
    saveConfig(scopedModelId.value || expressionStore.modelId, config.value)
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

    const faceNames = new Set(
      FACE_GROUPS.flatMap(name => config.value.face[name] ?? []).filter(name => expressions.has(name)),
    )
    const chosenFace = attrs?.[FACE_SLOT]
    const resetFace = missingTag || !attrs || !chosenFace || chosenFace === EXPR_OFF || !(FACE_GROUPS as readonly string[]).includes(chosenFace)
    if (resetFace) {
      for (const name of faceNames)
        setGroupOn(name, false)
    }
    else {
      const binds = (config.value.face[chosenFace as FaceGroupName] ?? [])
        .filter(name => expressions.has(name) || motions.has(name))
      const chosen = pickOne(binds)
      if (chosen && expressions.has(chosen)) {
        for (const name of faceNames)
          setGroupOn(name, name === chosen)
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
    // "нет" here is the head-shake gesture, not EXPR_OFF.
    if (chosenGesture && (GESTURE_GROUPS as readonly string[]).includes(chosenGesture)) {
      const binds = (config.value.gesture[chosenGesture as GestureGroupName] ?? [])
        .filter(name => motions.has(name) || expressions.has(name))
      const chosen = pickOne(binds)
      if (chosen && motions.has(chosen))
        playMotion(chosen)
      else if (chosen)
        setGroupOn(chosen, true)
    }

    const chosenHand = attrs[HAND_SLOT]
    if (chosenHand != null) {
      const allHand = HAND_OPTIONS.flatMap(option => config.value.hand[option] ?? []).filter(name => expressions.has(name))
      const keep = chosenHand === EXPR_OFF || !(HAND_OPTIONS as readonly string[]).includes(chosenHand)
        ? undefined
        : pickOne((config.value.hand[chosenHand as HandOption] ?? []).filter(name => expressions.has(name)))
      for (const name of allHand)
        setGroupOn(name, name === keep)
    }

    for (const slot of STICKY_SLOTS) {
      const value = attrs[slot]
      if (value == null)
        continue
      const binds = (config.value.sticky[slot] ?? []).filter(name => expressions.has(name))
      const on = value === EXPR_ON || value === 'true'
      for (const name of binds)
        setGroupOn(name, on)
    }
  }

  function autoSort() {
    const sorted = autoSortAssets({
      expressions: Array.from(expressionStore.expressionGroups.keys()),
      motions: [...new Set(live2d.availableMotions.map(item => item.motionName))],
    })
    config.value = sorted
    persist()
    return sorted
  }

  const liveAvailable = computed(() => availableNames())

  return {
    config,
    pickerFor,
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
