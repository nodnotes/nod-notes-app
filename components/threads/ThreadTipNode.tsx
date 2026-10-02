'use client'

import { Handle, Position, MarkerType } from 'reactflow' // Invisible point the free thread end attaches to

export const THREAD_TIP_SIZE = 12 // Flow px — arrow tip sits on this point

/** Arrow at a thread end that was dropped on the board (Miro free end). */
export function boardTipMarker(color: string) {
  return {
    type: MarkerType.ArrowClosed, // Filled arrow, same direction as the path
    color, // Match the thread stroke
    width: 16, // Screen-ish marker box
    height: 16,
  }
}

/** Board point a thread can end on when it is not snapped to a frame. */
export function ThreadTipNode() {
  return (
    <div
      className="tt-thread-tip" // No chrome — the edge arrow is the visible end
      style={{ width: THREAD_TIP_SIZE, height: THREAD_TIP_SIZE, background: 'transparent' }}
    >
      <Handle
        type="target" // Threads arrive here
        position={Position.Left}
        id="tip" // Stable id so the path meets the center
        isConnectable
        style={{
          opacity: 0, // The arrow marker paints the end
          width: THREAD_TIP_SIZE,
          height: THREAD_TIP_SIZE,
          border: 'none',
          background: 'transparent',
          left: '50%', // Center of the tip box
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  )
}
