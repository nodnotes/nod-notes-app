/**
 * Phone: select / deselect on finger-up within tap slop.
 * Synthetic `click` is flaky after pan jitter; pointerup is the source of truth.
 */

import { PANE_TAP_SLOP_PX } from '@/lib/pane-click-slop'

const SKIP =
  '.react-flow__edge, .react-flow__handle, .react-flow__resize-control, [data-frame-chrome], [data-tt-block-handle], [data-tt-insert-line], .block-actions-menu, [data-minimap-context], [data-minimap-toggle-context], [data-minimap-pill-context], [data-chat-map-dock], [data-edit-top-bar], [data-page-link-preview]' // Chrome / threads — not frame/pane tap

const SKIP_PANE_ONLY =
  '.react-flow__node, .react-flow__edge, .react-flow__handle, .react-flow__resize-control, [data-minimap-context], [data-minimap-toggle-context], [data-minimap-pill-context], [data-chat-map-dock], [data-edit-top-bar]' // Empty board only

export type PhoneFrameTapSelectOptions = {
  /** Unselected chatPanel under the point, or null. */
  resolveUnselectedFrameId: (clientX: number, clientY: number, target: EventTarget | null) => string | null
  /** True when any frame is selected (live — not a stale ref). */
  hasSelectedFrame: () => boolean
  selectFrame: (nodeId: string) => void
  /** Empty-board tap while a frame is selected — clear selection in this gesture. */
  deselectFrames: () => void
}

type Arm = 'frame' | 'pane-deselect'

export function attachPhoneFrameTapSelect(root: HTMLElement, options: PhoneFrameTapSelectOptions) {
  let pointerId: number | null = null
  let startX = 0
  let startY = 0
  let nodeId: string | null = null
  let arm: Arm | null = null
  const slop2 = PANE_TAP_SLOP_PX * PANE_TAP_SLOP_PX

  const reset = () => {
    pointerId = null
    nodeId = null
    arm = null
  }

  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
    if (event.button !== 0 && event.button !== -1) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest(SKIP) && !target.closest('.react-flow__node')) return

    const frameId = options.resolveUnselectedFrameId(event.clientX, event.clientY, target)
    if (frameId) {
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      nodeId = frameId
      arm = 'frame'
      return
    }

    // Empty pane + something selected → this tap deselects (don't wait for a second click)
    if (
      options.hasSelectedFrame() &&
      target.closest('.react-flow__pane') &&
      !target.closest(SKIP_PANE_ONLY)
    ) {
      pointerId = event.pointerId
      startX = event.clientX
      startY = event.clientY
      nodeId = null
      arm = 'pane-deselect'
    }
  }

  const onMove = (event: PointerEvent) => {
    if (pointerId == null || event.pointerId !== pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (dx * dx + dy * dy > slop2) reset() // Pan / marquee — not a tap
  }

  const onUp = (event: PointerEvent) => {
    if (pointerId == null || event.pointerId !== pointerId) return
    const kind = arm
    const id = nodeId
    reset()
    if (!kind) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (dx * dx + dy * dy > slop2) return
    if (kind === 'frame' && id) {
      options.selectFrame(id)
      return
    }
    if (kind === 'pane-deselect') {
      options.deselectFrames() // One finger-up clears selection
    }
  }

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length > 1) reset() // Pinch cancels
  }

  root.addEventListener('pointerdown', onDown, true)
  root.addEventListener('pointermove', onMove, true)
  root.addEventListener('pointerup', onUp, true)
  root.addEventListener('pointercancel', onUp, true)
  root.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
  return () => {
    root.removeEventListener('pointerdown', onDown, true)
    root.removeEventListener('pointermove', onMove, true)
    root.removeEventListener('pointerup', onUp, true)
    root.removeEventListener('pointercancel', onUp, true)
    root.removeEventListener('touchstart', onTouchStart, { capture: true })
    reset()
  }
}
