'use client'

// Board More → Connections → Show connections.
// On: the Notion mark under a frame stays visible when that frame is not selected.
// Off: the mark shows only while the frame is selected. Default on.

import { useEffect, useState } from 'react' // Load after hydrate so SSR stays on

const STORAGE_KEY = 'nodnotes-show-frame-connections' // Persists the toggle across reloads
const CHANGE_EVENT = 'nodnotes-show-frame-connections' // Same-tab listeners (storage events are other tabs)

/** Read the toggle. Missing key stays on so selected frames keep the strip. */
export function readShowFrameConnections(): boolean {
  if (typeof window === 'undefined') return true // SSR has no localStorage
  return window.localStorage.getItem(STORAGE_KEY) !== '0' // Explicit '0' is the only off state
}

/** Write the toggle and notify mounted frames in this tab. */
export function writeShowFrameConnections(on: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0') // '1' on, '0' off
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT)) // useShowFrameConnections re-reads
}

/** Subscribe to toggle changes in this tab. */
export function subscribeShowFrameConnections(onChange: () => void): () => void {
  const handler = () => onChange() // Store listeners want a zero-arg callback
  window.addEventListener(CHANGE_EVENT, handler) // This tab's write
  return () => window.removeEventListener(CHANGE_EVENT, handler) // Drop on unmount
}

/** Selected-frame connections strip. First paint is on; then the saved toggle applies. */
export function useShowFrameConnections(): boolean {
  const [on, setOn] = useState(true) // Match SSR so the strip does not flash off
  useEffect(() => {
    setOn(readShowFrameConnections()) // Apply a saved off state after hydrate
    return subscribeShowFrameConnections(() => setOn(readShowFrameConnections())) // Menu flips update frames
  }, [])
  return on // Off hides the Notion mark on unselected frames
}
