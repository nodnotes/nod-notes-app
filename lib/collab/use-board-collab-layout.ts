'use client'

// Sync RF frame positions ↔ board Y.Doc layout map (live multiplayer moves)

import { useEffect, useRef } from 'react'
import type { Node } from 'reactflow'
import { useBoardCollab } from '@/lib/collab/board-collab-context'
import type { CollabFrameLayout } from '@/lib/collab/board-doc'

const LOCAL_ORIGIN = 'local-layout'

/**
 * After sync: seed empty layout map from current nodes; observe remote layouts → setNodes;
 * expose publishDragPosition for drag ticks.
 */
export function useBoardCollabLayoutSync({
  nodes,
  setNodes,
  canEdit,
}: {
  nodes: Node[]
  setNodes: (updater: (nodes: Node[]) => Node[]) => void
  canEdit: boolean
}) {
  const {
    configured,
    synced,
    publishLayouts,
    subscribeLayouts,
    claimSeed,
    isSeeded,
    setSelectedFrames,
  } = useBoardCollab()

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const applyingRemoteRef = useRef(false) // Skip echo when applying remote Y updates
  const seededRef = useRef(false)

  // Seed layout map once from local RF nodes when we win the seed claim
  useEffect(() => {
    if (!configured || !synced || !canEdit || seededRef.current) return
    if (isSeeded() && !claimSeed()) {
      // Someone else already seeded — still mark local so we don't re-seed
      seededRef.current = true
      return
    }
    const won = claimSeed()
    if (!won) {
      seededRef.current = true
      return
    }
    const layouts: Record<string, CollabFrameLayout> = {}
    for (const n of nodesRef.current) {
      if (n.type !== 'chatPanel') continue
      const messageId = (n.data as { promptMessage?: { id?: string } } | undefined)?.promptMessage
        ?.id
      if (!messageId) continue
      layouts[messageId] = {
        x: n.position.x,
        y: n.position.y,
        zIndex: typeof n.zIndex === 'number' ? n.zIndex : undefined,
      }
    }
    if (Object.keys(layouts).length > 0) {
      publishLayouts(layouts)
    }
    seededRef.current = true
  }, [configured, synced, canEdit, claimSeed, isSeeded, publishLayouts])

  // Remote layout observers → move RF nodes without remounting (position/zIndex only)
  useEffect(() => {
    if (!configured || !synced) return
    return subscribeLayouts((layouts) => {
      if (applyingRemoteRef.current) return
      applyingRemoteRef.current = true
      setNodes((prev) => {
        let changed = false
        const next = prev.map((n) => {
          if (n.type !== 'chatPanel') return n
          const messageId = (n.data as { promptMessage?: { id?: string } } | undefined)
            ?.promptMessage?.id
          if (!messageId) return n
          const layout = layouts[messageId]
          if (!layout) return n
          const same =
            n.position.x === layout.x &&
            n.position.y === layout.y &&
            (layout.zIndex == null || n.zIndex === layout.zIndex)
          if (same) return n
          changed = true
          return {
            ...n,
            position: { x: layout.x, y: layout.y },
            ...(layout.zIndex != null ? { zIndex: layout.zIndex } : {}),
          }
        })
        return changed ? next : prev
      })
      queueMicrotask(() => {
        applyingRemoteRef.current = false
      })
    })
  }, [configured, synced, subscribeLayouts, setNodes])

  // Publish selection (message ids) for peer highlights
  useEffect(() => {
    if (!configured || !synced) return
    const ids: string[] = []
    for (const n of nodes) {
      if (!n.selected || n.type !== 'chatPanel') continue
      const messageId = (n.data as { promptMessage?: { id?: string } } | undefined)?.promptMessage
        ?.id
      if (messageId) ids.push(messageId)
    }
    setSelectedFrames(ids)
  }, [nodes, configured, synced, setSelectedFrames])

  /** Call from drag stop / position change with messageId → flow position. */
  const publishNodeLayout = (messageId: string, layout: CollabFrameLayout) => {
    if (!configured || !synced || !canEdit || applyingRemoteRef.current) return
    publishLayouts({ [messageId]: layout })
  }

  /** Batch-publish from an array of RF nodes (drag end). */
  const publishNodesLayouts = (dragged: Node[]) => {
    if (!configured || !synced || !canEdit || applyingRemoteRef.current) return
    const layouts: Record<string, CollabFrameLayout> = {}
    for (const n of dragged) {
      if (n.type !== 'chatPanel') continue
      const messageId = (n.data as { promptMessage?: { id?: string } } | undefined)?.promptMessage
        ?.id
      if (!messageId) continue
      layouts[messageId] = {
        x: n.position.x,
        y: n.position.y,
        zIndex: typeof n.zIndex === 'number' ? n.zIndex : undefined,
      }
    }
    if (Object.keys(layouts).length > 0) publishLayouts(layouts)
  }

  return {
    collabLayoutActive: configured && synced,
    publishNodeLayout,
    publishNodesLayouts,
    applyingRemoteRef,
  }
}

export { LOCAL_ORIGIN }
