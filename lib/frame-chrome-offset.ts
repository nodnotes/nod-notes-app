// Selection chrome (⋮⋮ gutter) shifts RF position left so fill stays on the board.
// Persist fill-origin positions — not the chrome-shifted RF top-left.

export type FrameChromePad = { x: number; y: number }

/** Read applied chrome pad from RF node data (0 when unselected). */
export function readFrameChromePad(data: unknown): FrameChromePad {
  const pad = (data as { frameChromePad?: { x?: number; y?: number } } | null)?.frameChromePad
  return { x: pad?.x ?? 0, y: pad?.y ?? 0 }
}

/** RF position is fillOrigin − pad — recover the fill anchor on the board. */
export function fillOriginFromFlowPosition(
  position: { x: number; y: number },
  pad: FrameChromePad
): { x: number; y: number } {
  return { x: position.x + pad.x, y: position.y + pad.y }
}

/** RF top-left for a fill anchor with optional chrome pad applied. */
export function flowPositionFromFillOrigin(
  fill: { x: number; y: number },
  pad: FrameChromePad
): { x: number; y: number } {
  return { x: fill.x - pad.x, y: fill.y - pad.y }
}
