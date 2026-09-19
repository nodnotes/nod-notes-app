'use client'

// Inside React Flow — publishes the touching cluster for the utility Layers list

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useReactFlow, useStore } from 'reactflow'
import { useSidebarContext } from '@/components/sidebar-context'
import { isFrameDragging } from '@/lib/frame-dragging'
import {
  captureNodeLayerPreview,
  clearLayersTouching,
  computeAllLayerItems,
  computeTouchingLayerItems,
  getLayersPublishScope,
  getLayersTouching,
  isLayerableNode,
  patchLayersTouchingPreviews,
  publishLayersTouching,
  subscribeLayersPublishScope,
  subscribeLayersTouching,
} from '@/lib/layers-touching'

/** Safe query for an RF node by id. */
function nodeEl(id: string): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const safeId = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return document.querySelector(`.react-flow__node[data-id="${safeId}"]`) as HTMLElement | null
}

/**
 * Mount under ReactFlowProvider (BoardFlow). When the utility Layers panel is open,
 * publishes the Layers filter set: every layerable node (All) or the touching cluster.
 */
export function LayersTouchingPublisher() {
  const { isUtilitySidebarOpen, utilitySidebarMode } = useSidebarContext()
  const rf = useReactFlow()
  const active = isUtilitySidebarOpen && utilitySidebarMode === 'layers'
  const scope = useSyncExternalStore(subscribeLayersPublishScope, getLayersPublishScope, () => 'touching') // All vs touching
  // Selection only — do NOT key on width/height (selected-frame chrome resize cancels captures)
  const selectionKey = useStore((s) => {
    if (!active || getLayersPublishScope() === 'all') return '' // All mode ignores selection churn
    const selected = s
      .getNodes()
      .filter((n) => n.selected)
      .map((n) => n.id)
      .sort()
      .join(',')
    const edges = s.edges
      .filter((e) => e.selected)
      .map((e) => e.id)
      .sort()
      .join(',')
    return `${selected}|${edges}`
  })
  // All mode republishes when a layer is added or removed, not on every drag
  const allIdsKey = useStore((s) => {
    if (!active || getLayersPublishScope() !== 'all') return ''
    return s
      .getNodes()
      .filter(isLayerableNode)
      .map((n) => n.id)
      .sort()
      .join(',')
  })
  const publishKey = scope === 'all' ? `all:${allIdsKey}` : `touch:${selectionKey}` // One key so All doesn't recapture on select
  const captureGenRef = useRef(0) // Cancel stale full-list captures
  const itemIdsKeyRef = useRef('') // Current cluster ids for edit observers

  // Publish list + initial thumbs when selection changes
  useEffect(() => {
    if (!active) {
      clearLayersTouching()
      itemIdsKeyRef.current = ''
      return
    }
    if (isFrameDragging()) return // Wait until drag settles

    const nodes = rf.getNodes()
    const edges = rf.getEdges()
    const { items, seedKey } =
      scope === 'all' ? computeAllLayerItems(nodes) : computeTouchingLayerItems(nodes, edges) // Filter “All” vs cluster
    publishLayersTouching(items, seedKey) // Keeps prior thumbs for same ids while recapturing
    itemIdsKeyRef.current = items
      .map((i) => i.id)
      .sort()
      .join(',')

    if (items.length === 0) return

    const gen = ++captureGenRef.current
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const item of items) {
          if (gen !== captureGenRef.current) return // Selection changed
          const url = await captureNodeLayerPreview(item.id)
          if (gen !== captureGenRef.current) return
          if (url) patchLayersTouchingPreviews({ [item.id]: url }) // Show each thumb as it lands
        }
      })()
    }, 250) // Debounce past selection-chrome measure jitter

    return () => {
      window.clearTimeout(timer)
      captureGenRef.current += 1 // Invalidate in-flight captures for this selection
    }
  }, [active, publishKey, scope, rf])

  // While the cluster is open, recapture thumbs when frame/drawing DOM content edits
  useEffect(() => {
    if (!active) return // Sidebar closed or not on Layers
    if (scope !== 'all' && !selectionKey && getLayersTouching().length === 0) return // Nothing to watch

    const pending = new Set<string>() // Ids that need a fresh thumb
    let debounceTimer: number | null = null // DOM window.setTimeout; Node Timeout clashes with @types/node
    let editGen = 0 // Cancel in-flight edit captures independently of selection gen
    const observers: MutationObserver[] = []

    const flushEdits = () => {
      debounceTimer = null
      const ids = [...pending]
      pending.clear()
      if (ids.length === 0) return
      const gen = ++editGen
      void (async () => {
        for (const id of ids) {
          if (gen !== editGen) return
          // Still in the current layers list?
          if (!getLayersTouching().some((i) => i.id === id)) continue
          const url = await captureNodeLayerPreview(id)
          if (gen !== editGen) return
          if (url) patchLayersTouchingPreviews({ [id]: url })
        }
      })()
    }

    const schedule = (id: string) => {
      if (isFrameDragging()) return // Don't snapshot mid-drag
      pending.add(id)
      if (debounceTimer) window.clearTimeout(debounceTimer)
      debounceTimer = window.setTimeout(flushEdits, 450) // Idle after typing / stroke
    }

    const watchIds = (ids: string[]) => {
      for (const obs of observers) obs.disconnect()
      observers.length = 0
      for (const id of ids) {
        const el = nodeEl(id)
        if (!el) continue
        const mo = new MutationObserver(() => schedule(id))
        mo.observe(el, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true, // Freehand path / style updates
        })
        observers.push(mo)
      }
    }

    // Initial watch from current store (publish may have just run)
    watchIds(
      getLayersTouching()
        .map((i) => i.id)
        .sort()
    )

    // Re-attach when the cluster membership changes (without tearing down on every thumb patch)
    const unsub = subscribeLayersTouching(() => {
      const key = getLayersTouching()
        .map((i) => i.id)
        .sort()
        .join(',')
      if (key === itemIdsKeyRef.current) return // Same ids — keep observers (thumb patch only)
      itemIdsKeyRef.current = key
      watchIds(key ? key.split(',') : [])
    })

    return () => {
      unsub()
      for (const obs of observers) obs.disconnect()
      if (debounceTimer) window.clearTimeout(debounceTimer)
      editGen += 1
    }
  }, [active, scope, selectionKey])

  useEffect(() => {
    return () => {
      clearLayersTouching()
      captureGenRef.current += 1
    }
  }, [])

  return null
}
