'use client'

/** Host board RF root — nested previews portal outside it. */
export function getHostBoardFlowEl(): HTMLElement | null {
  return document.querySelector('[data-board-root] .react-flow') as HTMLElement | null
}

/** Wheel over preview chrome (portaled, pointer-events auto) → host map zoom/pan. */
export function forwardWheelToHostBoard(e: WheelEvent): boolean {
  const flowEl = getHostBoardFlowEl()
  if (!flowEl) return false
  e.preventDefault()
  e.stopPropagation()
  flowEl.dispatchEvent(
    new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      clientX: e.clientX,
      clientY: e.clientY,
      screenX: e.screenX,
      screenY: e.screenY,
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaZ: e.deltaZ,
      deltaMode: e.deltaMode,
      ctrlKey: e.ctrlKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
    })
  )
  return true
}
