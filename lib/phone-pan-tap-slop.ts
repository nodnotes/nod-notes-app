/**
 * Phone pan tool: d3-zoom ignores clickDistance on touch — any touchmove pans and
 * preventDefaults, so the synthetic click (I-bar / frame select) never fires.
 * Swallow one-finger touchmove inside tap slop so jitter stays a tap; past slop, d3 pans.
 */

import { PANE_TAP_SLOP_PX } from '@/lib/pane-click-slop'

const SKIP =
  '[data-minimap-context], [data-minimap-toggle-context], [data-minimap-pill-context], [data-chat-map-dock], [data-edit-top-bar]' // Chrome outside the map gesture

/** Slightly fatter than select marquee — fat-finger pan jitter is larger than mouse. */
export const PHONE_PAN_TAP_SLOP_PX = Math.max(PANE_TAP_SLOP_PX, 14)

/**
 * Capture-phase touchmove gate while the pan tool owns one-finger drag.
 * Attach only when phone + pan tool (`panOnDrag === true`); select tool already uses marquee.
 */
export function attachPhonePanTapSlop(root: HTMLElement) {
  let armed = false // One-finger press on the board
  let committed = false // Past slop — real pan, stop gating
  let startX = 0
  let startY = 0
  const slop2 = PHONE_PAN_TAP_SLOP_PX * PHONE_PAN_TAP_SLOP_PX

  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') {
      armed = false
      return
    }
    if (event.button !== 0 && event.button !== -1) {
      armed = false
      return
    }
    const target = event.target
    if (!(target instanceof Element)) {
      armed = false
      return
    }
    if (target.closest(SKIP) || !target.closest('.react-flow')) {
      armed = false // Overlay chrome / off-board
      return
    }
    armed = true
    committed = false
    startX = event.clientX
    startY = event.clientY
  }

  const onTouchMove = (event: TouchEvent) => {
    if (!armed || committed) return // Not gating
    if (event.touches.length !== 1) {
      armed = false // Pinch / two-finger — never block board-rotation or d3
      return
    }
    const t = event.touches[0]
    const dx = t.clientX - startX
    const dy = t.clientY - startY
    if (dx * dx + dy * dy <= slop2) {
      // Stop before ZoomPane/d3 — no preventDefault → iOS still synthesizes click
      event.stopPropagation()
      return
    }
    committed = true // Hand the rest of the gesture to d3 pan
  }

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length > 1) armed = false // Second finger — drop the tap gate
  }

  const onUp = () => {
    armed = false
    committed = false
  }

  root.addEventListener('pointerdown', onDown, true) // Arm before d3 touchstart
  root.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
  root.addEventListener('touchmove', onTouchMove, { capture: true, passive: true }) // stopPropagation only
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onUp, true)
  window.addEventListener('touchend', onUp, true)
  window.addEventListener('touchcancel', onUp, true)
  return () => {
    root.removeEventListener('pointerdown', onDown, true)
    root.removeEventListener('touchstart', onTouchStart, { capture: true })
    root.removeEventListener('touchmove', onTouchMove, { capture: true })
    window.removeEventListener('pointerup', onUp, true)
    window.removeEventListener('pointercancel', onUp, true)
    window.removeEventListener('touchend', onUp, true)
    window.removeEventListener('touchcancel', onUp, true)
    armed = false
  }
}
