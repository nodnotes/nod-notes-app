// Board prefs for frame edge-align (magnetize) — top-bar More → Snap.

import { stackLineGapFlow } from '@/lib/frame-stack-line'

/** localStorage — frame edge magnetize on/off (default on). */
export const EDGE_SNAP_STORAGE_KEY = 'nodnotes-edge-snap'

/** localStorage — helper-line / guide snap (same as context snapEnabled). */
export const GUIDE_SNAP_STORAGE_KEY = 'nodnotes-guide-snap'

/** Read edge-snap preference (SSR-safe default: on). */
export function readEdgeSnapEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const raw = localStorage.getItem(EDGE_SNAP_STORAGE_KEY)
  if (raw === null) return true // Default on — distance is the soft control
  return raw === '1' || raw === 'true'
}

/** Persist edge-snap preference. */
export function writeEdgeSnapEnabled(on: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(EDGE_SNAP_STORAGE_KEY, on ? '1' : '0')
}

/** Read guide-snap preference (SSR-safe default: off — matches prior snapEnabled). */
export function readGuideSnapEnabled(): boolean {
  if (typeof window === 'undefined') return false
  const raw = localStorage.getItem(GUIDE_SNAP_STORAGE_KEY)
  if (raw === null) return false
  return raw === '1' || raw === 'true'
}

/** Persist guide-snap preference. */
export function writeGuideSnapEnabled(on: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(GUIDE_SNAP_STORAGE_KEY, on ? '1' : '0')
}

/**
 * Flow-px arm that engages edge magnetize.
 * Must exceed the park gap so the magnet sticks after jump-in — keep the slack small
 * so frames do not yank from far away.
 */
export function snapArmPx(zoom: number): number {
  return stackLineGapFlow(zoom) + 4
}

/** Min fraction of the shorter parallel edge that must overlap for a side snap. */
export const SNAP_OVERLAP_MIN = 0.4
