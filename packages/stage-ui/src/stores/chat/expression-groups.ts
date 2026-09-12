import type { CustomExpressionGroup, FaceGroupName, ModelExpressionGroupsConfig } from './expr-tag'

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import { useExpressionStore } from '@proj-airi/stage-ui-live2d'

import {
  emptyExpressionGroupsConfig,
  emptyFaceBinds,
  EXPR_OFF,
  EXPR_ON,
  FACE_GROUPS,
  FACE_SLOT,
} from './expr-tag'

function persistenceKey(modelId: string): string {
  return `expression-groups:${modelId}`
}

export function loadExpressionGroupsConfig(modelId: string): ModelExpressionGroupsConfig {
  const empty = emptyExpressionGroupsConfig()
  if (!modelId)
    return empty
  try {
    const raw = localStorage.getItem(persistenceKey(modelId))
    if (!raw)
      return empty
    const parsed = JSON.parse(raw) as Partial<ModelExpressionGroupsConfig>
    const face = emptyFaceBinds()
    for (const name of FACE_GROUPS)
      face[name] = parsed.face?.[name] ?? []
    return {
      face,
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
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

function newGroupId() {
  return `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useExpressionGroupsStore = defineStore('live2d-expression-groups', () => {
  const expressionStore = useExpressionStore()
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
    return Array.from(expressionStore.expressionGroups.keys())
  }

  function addFaceBind(group: FaceGroupName, expressionName: string) {
    const current = config.value.face[group]
    if (!current.includes(expressionName))
      config.value.face[group] = [...current, expressionName]
    persist()
  }

  function removeFaceBind(group: FaceGroupName, expressionName: string) {
    config.value.face[group] = config.value.face[group].filter(name => name !== expressionName)
    persist()
  }

  function addCustomGroup() {
    const group: CustomExpressionGroup = {
      id: newGroupId(),
      name: '',
      what: '',
      hold: '',
      enabled: true,
      binds: [],
    }
    config.value.custom = [...config.value.custom, group]
    persist()
    return group.id
  }

  function updateCustomGroup(id: string, patch: Partial<CustomExpressionGroup>) {
    config.value.custom = config.value.custom.map(group => group.id === id ? { ...group, ...patch } : group)
    persist()
  }

  function removeCustomGroup(id: string) {
    config.value.custom = config.value.custom.filter(group => group.id !== id)
    if (pickerFor.value === id)
      pickerFor.value = null
    persist()
  }

  function addCustomBind(id: string, expressionName: string) {
    config.value.custom = config.value.custom.map((group) => {
      if (group.id !== id)
        return group
      if (group.binds.some(bind => bind.expressionName === expressionName))
        return group
      return { ...group, binds: [...group.binds, { expressionName, label: '' }] }
    })
    persist()
  }

  function removeCustomBind(id: string, expressionName: string) {
    config.value.custom = config.value.custom.map((group) => {
      if (group.id !== id)
        return group
      return { ...group, binds: group.binds.filter(bind => bind.expressionName !== expressionName) }
    })
    persist()
  }

  function setCustomBindLabel(id: string, expressionName: string, label: string) {
    config.value.custom = config.value.custom.map((group) => {
      if (group.id !== id)
        return group
      return {
        ...group,
        binds: group.binds.map(bind => bind.expressionName === expressionName ? { ...bind, label } : bind),
      }
    })
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

  function applyAttrs(attrs: Record<string, string> | null, missingTag: boolean) {
    const available = new Set(availableNames())
    const faceExpressions = new Set(
      FACE_GROUPS.flatMap(name => config.value.face[name] ?? []).filter(name => available.has(name)),
    )

    const chosenFace = attrs?.[FACE_SLOT]
    const resetFace = missingTag || !attrs || !chosenFace || chosenFace === EXPR_OFF || !(FACE_GROUPS as readonly string[]).includes(chosenFace)
    if (resetFace) {
      for (const name of faceExpressions)
        setGroupOn(name, false)
    }
    else {
      const binds = (config.value.face[chosenFace as FaceGroupName] ?? []).filter(name => available.has(name))
      const keep = binds[0]
      for (const name of faceExpressions)
        setGroupOn(name, name === keep)
    }

    if (!attrs)
      return

    for (const group of config.value.custom) {
      if (!group.enabled)
        continue
      const value = attrs[group.name.trim()]
      if (value == null)
        continue
      const binds = group.binds.filter(bind => available.has(bind.expressionName))
      if (binds.length === 0)
        continue
      if (binds.length === 1) {
        const bind = binds[0]
        const on = value === EXPR_ON || value === 'true' || value === bind.label || value === bind.expressionName
        setGroupOn(bind.expressionName, on)
        continue
      }
      const hit = binds.find(bind => (bind.label.trim() || bind.expressionName) === value)
      for (const bind of binds)
        setGroupOn(bind.expressionName, hit != null && bind.expressionName === hit.expressionName)
    }
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
    addCustomGroup,
    updateCustomGroup,
    removeCustomGroup,
    addCustomBind,
    removeCustomBind,
    setCustomBindLabel,
    applyAttrs,
  }
})
