'use client'

// Keep a panel mounted through open/close so width/transform can tween (match RF viewport 200ms).
import { useCallback, useLayoutEffect, useRef, useState, type TransitionEvent } from 'react'

/** Same duration as useChatSidebarViewportAdjust / useUtilitySidebarViewportAdjust. */
export const SIDEBAR_OPEN_CLOSE_MS = 200

/**
 * Mount while open or mid-close; `shown` drives the CSS open pose.
 * First paint skips the tween so cookie/SSR already-open columns do not slide in.
 */
export function useOpenClosePresence(open: boolean, durationMs = SIDEBAR_OPEN_CLOSE_MS) {
  const [mounted, setMounted] = useState(open) // False → unmount after close tween
  const [shown, setShown] = useState(open) // True → full open width / translateX(0)
  const [transitionOn, setTransitionOn] = useState(false) // Off while seam-resizing so drag stays instant
  const skipAnimRef = useRef(true) // Cookie/SSR restore: paint final pose with no transition
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // Unmount after close duration

  useLayoutEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current) // Cancel a pending unmount if the user reopens quickly
      closeTimerRef.current = null
    }

    if (open) {
      setMounted(true) // Column must exist before the open tween
      if (skipAnimRef.current) {
        skipAnimRef.current = false // Only the first sync is instant
        setShown(true)
        setTransitionOn(false)
        return
      }
      setTransitionOn(true) // Enable CSS width/transform for this open
      setShown(false) // Start from the closed pose when remounting mid-cycle
      let innerId = 0
      const outerId = requestAnimationFrame(() => {
        // Second frame: commit width 0 / translateX(100%), then open so the transition runs
        innerId = requestAnimationFrame(() => setShown(true))
      })
      return () => {
        cancelAnimationFrame(outerId)
        if (innerId) cancelAnimationFrame(innerId)
      }
    }

    skipAnimRef.current = false // Later opens should animate
    setTransitionOn(true)
    setShown(false) // Drive the close tween
    closeTimerRef.current = setTimeout(() => {
      setMounted(false) // Drop DOM after the close finishes
      setTransitionOn(false) // Seam resize must stay instant next open
      closeTimerRef.current = null
    }, durationMs)

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [open, durationMs])

  /** After open settles, drop transition so live seam-drag width is not lagged. */
  const onTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLElement>) => {
      if (e.propertyName !== 'width' && e.propertyName !== 'transform') return
      if (shown) setTransitionOn(false)
    },
    [shown]
  )

  return { mounted, shown, transitionOn, onTransitionEnd }
}
