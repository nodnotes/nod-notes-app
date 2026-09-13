'use client'

// Inside React Flow — publishes the touching cluster for the utility Layers list

import { useEffect, useRef } from 'react'
import { useReactFlow, useStore } from 'reactflow'
import { useSidebarContext } from '@/components/sidebar-context'
import { isFrameDragging } from '@/lib/frame-dragging'
import {
  captureNodeLayerPreview,
  clearLayersTouching,
  computeTouchingLayerItems,
  getLayersTouching,
  patchLayersTouchingPreviews,
  publishLayersTouching,
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
 * publishes frames/drawings/shapes that touch the current selection (incl. thread endpoints).
 */
export function LayersTouchingPublisher() {
  const { isUtilitySidebarOpen, utilitySidebarMode } = useSidebarContext()
  const rf = useReactFlow()
  const active = isUtilitySidebarOpen && utilitySidebarMode === 'layers'
  // Selection only — do NOT key on width/height (selected-frame chrome resize cancels captures)
  const selectionKey = useStore((s) => {
    if (!active) return ''
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
    const { items, seedKey } = computeTouchingLayerItems(nodes, edges)
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
  }, [active, selectionKey, rf])

  // While the cluster is open, recapture thumbs when frame/drawing DOM content edits
  useEffect(() => {
    if (!active || !selectionKey) return

    const pending = new Set<string>() // Ids that need a fresh thumb
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
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
  }, [active, selectionKey])

  useEffect(() => {
    return () => {
      clearLayersTouching()
      captureGenRef.current += 1
    }
  }, [])

  return null
}
