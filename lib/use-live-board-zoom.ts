'use client'

// Live board zoom for selected-frame chrome (gutters, ⋮⋮, add lines).
// Reads the published viewport-CSS zoom — not the lagging RF store.

import { useSyncExternalStore } from 'react'
import {
  getLiveBoardZoom,
  subscribeLiveBoardZoom,
} from '@/lib/frame-chrome-zoom'

const subscribeNoop = () => () => {}
const getOne = () => 1

/**
 * When `enabled`, re-renders every painted zoom tick (viewport CSS matrix).
 * When disabled, stays at 1 and does not subscribe (idle frames stay cheap).
 */
export function useLiveBoardZoom(enabled: boolean): number {
  return useSyncExternalStore(
    enabled ? subscribeLiveBoardZoom : subscribeNoop,
    enabled ? getLiveBoardZoom : getOne,
    getOne
  )
}
