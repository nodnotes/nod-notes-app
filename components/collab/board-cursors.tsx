'use client'

// Remote collaborator cursors in board flow space (pointer follows awareness)

import { useEffect } from 'react'
import { useReactFlow, useViewport } from 'reactflow'
import { useBoardCollab, type BoardCollabPeer } from '@/lib/collab/board-collab-context'

/** SVG caret + name label for one remote peer (flow coordinates). */
function PeerCursor({ peer }: { peer: BoardCollabPeer }) {
  if (!peer.cursor) return null
  const { x, y } = peer.cursor
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ transform: `translate(${x}px, ${y}px)` }}
      data-collab-cursor={peer.id}
    >
      <svg width="16" height="20" viewBox="0 0 16 20" fill="none" aria-hidden>
        <path
          d="M1 1L1 15L5.5 11.5L9 18L11 17L7.5 10.5L14 10L1 1Z"
          fill={peer.color}
          stroke="white"
          strokeWidth="1"
        />
      </svg>
      <span
        className="ml-3 -mt-1 inline-block max-w-[120px] truncate rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
        style={{ backgroundColor: peer.color }}
      >
        {peer.name}
      </span>
    </div>
  )
}

/**
 * Overlay inside ReactFlow: applies the live viewport transform so cursors sit in flow space.
 */
export function BoardCollabCursors() {
  const { peers, configured, synced } = useBoardCollab()
  const { x, y, zoom } = useViewport()
  if (!configured || !synced) return null
  const withCursor = peers.filter((p) => p.cursor)
  if (withCursor.length === 0) return null

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[40] overflow-visible"
      style={{
        transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        transformOrigin: '0 0',
      }}
      data-collab-cursors
    >
      {withCursor.map((p) => (
        <PeerCursor key={p.clientId} peer={p} />
      ))}
    </div>
  )
}

/**
 * Tracks pointer over the pane and publishes flow coords to awareness (throttled).
 * Mount as a child of ReactFlow (uses useReactFlow).
 */
export function BoardCollabPointerPublisher() {
  const { setCursor, configured, synced } = useBoardCollab()
  const rf = useReactFlow()
  const viewport = useViewport()

  useEffect(() => {
    if (!configured || !synced) return
    let last = 0
    const onMove = (e: PointerEvent) => {
      const now = performance.now()
      if (now - last < 40) return // ~25 Hz
      last = now
      const pane = document.querySelector('.react-flow')
      if (!pane) return
      const bounds = pane.getBoundingClientRect()
      if (
        e.clientX < bounds.left ||
        e.clientX > bounds.right ||
        e.clientY < bounds.top ||
        e.clientY > bounds.bottom
      ) {
        setCursor(null)
        return
      }
      const flow = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
      setCursor(flow)
    }
    const onLeave = () => setCursor(null)
    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('blur', onLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('blur', onLeave)
      setCursor(null)
    }
  }, [configured, synced, setCursor, rf, viewport.x, viewport.y, viewport.zoom])

  return null
}
