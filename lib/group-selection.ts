// Multi-select chrome: one resize box around every selected frame / drawing / shape.
// Individuals keep their blue box; this module tells them to drop handles, dots, and menus.

import { useSyncExternalStore } from 'react' // Subscribe without walking the RF store per frame

/** RF node types that participate in the group resize box. */
export const GROUP_SELECT_TYPES = new Set(['chatPanel', 'freehand', 'shape'])

/** Frames and drawings listen for this while the group box is resized or rotated. */
export const GROUP_TRANSFORM_EVENT = 'tt-group-transform'

/** One reactions control on the group box toggles reactions on every selected frame. */
export const GROUP_COMMENTS_EVENT = 'tt-group-comments'

/** Live geometry React state that is not yet on node.data (rotation, scale, fill box). */
export type LiveGroupGeom = {
  frameScale: number // Locked proportional scale
  rotation: number // Degrees, content inside the upright box
  unlocked: boolean // Free resize (explicit box) vs fit-to-text
  contentW: number // Unrotated fill width
  contentH: number // Unrotated fill height
}

/** One selected object after a group scale or orbit. */
export type GroupNodePatch = {
  id: string // RF node id
  type: string // chatPanel | freehand | shape
  x: number // Node position.x (parent-relative)
  y: number // Node position.y
  width: number // Outer box width
  height: number // Outer box height
  frameScale?: number // Next locked scale
  rotation?: number // Next content angle
  content?: { width: number; height: number } // Next fill or ink box
  unlocked?: boolean // Whether the fill box is explicit
  data?: Record<string, unknown> // Freehand canvas_nodes.data to persist
}

/** start arms refs; move paints; end persists. */
export type GroupTransformDetail = {
  phase: 'start' | 'move' | 'end' // Gesture stage
  kind: 'resize' | 'rotate' // Which control is driving
  patches: GroupNodePatch[] // Only the nodes this gesture touches
}

const liveGeom = new Map<string, LiveGroupGeom>() // id → latest frame/drawing geometry

/** Frames and drawings publish so a group gesture reads the painted angle, not stale metadata. */
export function publishLiveGroupGeom(id: string, geom: LiveGroupGeom): void {
  liveGeom.set(id, geom) // Overwrite — last render wins
}

/** Drop a node when it unmounts so a deleted frame is not reused. */
export function clearLiveGroupGeom(id: string): void {
  liveGeom.delete(id) // Forget this id
}

/** Snapshot geometry, or null when this node has not published yet. */
export function readLiveGroupGeom(id: string): LiveGroupGeom | null {
  return liveGeom.get(id) ?? null // Missing until the node mounts
}

let groupMulti = false // True while two or more group-select nodes are selected
const listeners = new Set<() => void>() // useSyncExternalStore subscribers

/** Overlay sets this when the selection count crosses 2. */
export function setGroupMultiSelect(next: boolean): void {
  if (next === groupMulti) return // Skip redundant renders
  groupMulti = next // Publish
  listeners.forEach((listener) => listener()) // Wake subscribed nodes
}

function subscribeGroupMulti(listener: () => void): () => void {
  listeners.add(listener) // Register
  return () => listeners.delete(listener) // Cleanup
}

/** True when this selection should use the shared resize box instead of per-object handles. */
export function useGroupMultiSelect(): boolean {
  return useSyncExternalStore(subscribeGroupMulti, () => groupMulti, () => false) // SSR stays single-select chrome
}
