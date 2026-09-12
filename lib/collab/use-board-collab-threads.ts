'use client'

// Sync RF threads (panel_edges) via board Y.Doc threads map

import { useEffect, useRef } from 'react'
import type { Edge } from 'reactflow'
import { useBoardCollab } from '@/lib/collab/board-collab-context'
import { getThreadsMap, setThreads, type CollabThread } from '@/lib/collab/board-doc'
import { deleteThreadSnapshot } from '@/lib/collab/snapshot'

const EDGE_TYPE = 'editable'

function messageIdFromNodeId(nodeId: string): string | null {
  // RF chat panels use `panel-{messageId}`
  if (nodeId.startsWith('panel-')) return nodeId.slice('panel-'.length)
  return null
}

function nodeIdFromMessageId(messageId: string): string {
  return `panel-${messageId}`
}

export function useBoardCollabThreads({
  edges,
  setEdges,
  canEdit,
  boardId,
}: {
  edges: Edge[]
  setEdges: (updater: (edges: Edge[]) => Edge[]) => void
  canEdit: boolean
  boardId: string | undefined
}) {
  const { configured, synced, doc, claimSeed, isSeeded } = useBoardCollab()
  const edgesRef = useRef(edges)
  edgesRef.current = edges
  const applyingRemoteRef = useRef(false)
  const seededRef = useRef(false)

  // Seed threads map once from local edges when we own the seed claim
  useEffect(() => {
    if (!configured || !synced || !canEdit || !doc || seededRef.current) return
    if (isSeeded()) {
      // Layout hook may have claimed already — still seed threads if map empty
      const map = getThreadsMap(doc)
      if (map.size > 0) {
        seededRef.current = true
        return
      }
    } else {
      claimSeed()
    }
    const threads: CollabThread[] = []
    for (const e of edgesRef.current) {
      const source = messageIdFromNodeId(e.source)
      const target = messageIdFromNodeId(e.target)
      if (!source || !target) continue
      threads.push({
        id: e.id,
        source,
        target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
        metadata: (e.data as Record<string, unknown>) ?? {},
      })
    }
    if (threads.length > 0) setThreads(doc, threads, undefined, 'local')
    seededRef.current = true
  }, [configured, synced, canEdit, doc, claimSeed, isSeeded])

  // Remote thread changes → RF edges
  useEffect(() => {
    if (!configured || !synced || !doc) return
    const map = getThreadsMap(doc)
    const apply = () => {
      if (applyingRemoteRef.current) return
      applyingRemoteRef.current = true
      const remote: Edge[] = []
      map.forEach((t) => {
        remote.push({
          id: t.id,
          source: nodeIdFromMessageId(t.source),
          target: nodeIdFromMessageId(t.target),
          sourceHandle: t.sourceHandle ?? undefined,
          targetHandle: t.targetHandle ?? undefined,
          type: EDGE_TYPE,
          data: t.metadata ?? {},
        })
      })
      setEdges((prev) => {
        // Preserve non-panel edges (placeholders etc.)
        const keep = prev.filter(
          (e) => !messageIdFromNodeId(e.source) || !messageIdFromNodeId(e.target)
        )
        const byId = new Map(remote.map((e) => [e.id, e]))
        // Prefer remote for panel↔panel threads
        return [...keep.filter((e) => !byId.has(e.id)), ...remote]
      })
      queueMicrotask(() => {
        applyingRemoteRef.current = false
      })
    }
    map.observe(apply)
    return () => map.unobserve(apply)
  }, [configured, synced, doc, setEdges])

  /** Publish a new/updated thread into Y (DB insert stays on the existing board-flow path). */
  const publishThread = async (edge: Edge) => {
    if (!configured || !synced || !canEdit || !doc || !boardId) return
    if (applyingRemoteRef.current) return
    const source = messageIdFromNodeId(edge.source)
    const target = messageIdFromNodeId(edge.target)
    if (!source || !target) return
    const thread: CollabThread = {
      id: edge.id,
      source,
      target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      metadata: (edge.data as Record<string, unknown>) ?? {},
    }
    setThreads(doc, [thread], undefined, 'local')
  }

  /** Remove a thread from Y (+ best-effort DB delete for remote removers). */
  const unpublishThread = (edge: Edge) => {
    if (!configured || !synced || !canEdit || !doc || !boardId) return
    const source = messageIdFromNodeId(edge.source)
    const target = messageIdFromNodeId(edge.target)
    if (!source || !target) return
    setThreads(doc, [], [edge.id], 'local')
    void deleteThreadSnapshot(boardId, { id: edge.id, source, target })
  }

  return { publishThread, unpublishThread, collabThreadsActive: configured && synced }
}
