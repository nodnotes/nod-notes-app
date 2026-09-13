'use client'

// When the right chat sidebar opens/closes/resizes, shrink/grow the map and scale zoom so the same relative content stays framed.
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactFlowInstance, Viewport } from 'reactflow'
import { useStoreApi } from 'reactflow'
import { zoomIdentity } from 'd3-zoom'
import { useSidebarContext } from '@/components/sidebar-context'
import { SIDEBAR_OPEN_CLOSE_MS } from '@/lib/hooks/use-open-close-presence'

/** Apply width-ratio camera transform from a closed-state baseline (no drift). */
function viewportForOpenWidth(
  baseline: Viewport, // Camera while sidebar was closed
  closedWidth: number, // Map pane width while closed
  openWidth: number, // Map pane width while open
  height: number // Pane height (unchanged by sidebar)
): Viewport {
  const ratio = openWidth / closedWidth // Zoom out so the same horizontal span fits
  return {
    zoom: baseline.zoom * ratio, // Relative zoom for narrower pane
    x: baseline.x * ratio, // Keep horizontal framing fractions stable
    y: (height / 2) * (1 - ratio) + baseline.y * ratio, // Keep vertical center stable
  }
}

/**
 * Scales the React Flow viewport when the chat sidebar toggles or resizes.
 * Open: lock closed pane while the column is still width 0, then RO tracks the 200ms CSS width tween (instant d3).
 * Close: setViewport 200ms restore to the closed-camera snapshot (matches column shrink).
 * Seam resize: same math with measured pane width; instant d3Zoom.transform (no transition).
 */
export function useChatSidebarViewportAdjust(
  reactFlowInstance: ReactFlowInstance | null, // Active flow instance (null until mounted)
  isChatSidebarOpen: boolean // Right chat column visibility from sidebar context
) {
  const { chatSidebarWidth } = useSidebarContext() // Live column width (drag-resized)
  const storeApi = useStoreApi() // This board’s RF store — d3Zoom + correct pane

  const widthRef = useRef(chatSidebarWidth) // Always-current column width
  widthRef.current = chatSidebarWidth

  const prevOpenRef = useRef(isChatSidebarOpen) // Skip initial mount; only react to toggles
  const closedBaselineRef = useRef<Viewport | null>(null) // Exact camera to restore on close
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // Delayed baseline clear after close
  const lastFrameKeyRef = useRef<string | null>(null) // Skip duplicate applies
  const closedPaneWidthRef = useRef<number | null>(null) // Full map width locked once per open cycle
  const instanceRef = useRef(reactFlowInstance)
  instanceRef.current = reactFlowInstance

  /** Instant camera — skips d3 transition (setViewport always transitions, even at 0ms). */
  const setViewportInstant = (next: Viewport) => {
    const { d3Zoom, d3Selection } = storeApi.getState() as {
      d3Zoom?: { transform: (s: unknown, t: unknown) => void }
      d3Selection?: unknown
    }
    if (d3Zoom && d3Selection) {
      d3Zoom.transform(d3Selection, zoomIdentity.translate(next.x, next.y).scale(next.zoom))
      return
    }
    instanceRef.current?.setViewport(next)
  }

  /**
   * Frame from closed baseline using the measured pane width (same as open/close).
   * Requires a real baseline — never invents one here (that skewed the end pose).
   */
  const frameFromBaseline = (duration?: number) => {
    const rf = instanceRef.current
    const baseline = closedBaselineRef.current
    if (!rf || !baseline) return

    const pane = storeApi.getState().domNode as HTMLElement | null
    if (!pane) return
    const openWidth = pane.clientWidth // Measured usable map width — matches open/close math
    const height = pane.clientHeight
    if (openWidth <= 0 || height <= 0) return

    const sidebarW = widthRef.current
    // Fallback only — open path locks the true closed pane before the column grows
    if (closedPaneWidthRef.current == null) {
      closedPaneWidthRef.current = openWidth + sidebarW
    }
    const closedWidth = closedPaneWidthRef.current
    if (closedWidth <= 0) return

    const frameKey = `${Math.round(openWidth)}|${Math.round(closedWidth)}`
    if (lastFrameKeyRef.current === frameKey) return

    const next = viewportForOpenWidth(baseline, closedWidth, openWidth, height)
    if (duration != null && duration > 0) rf.setViewport(next, { duration })
    else setViewportInstant(next)
    lastFrameKeyRef.current = frameKey
  }

  // Open / close — snapshot real closed camera; open tracks CSS width via RO, close tweens back
  useEffect(() => {
    if (!reactFlowInstance) return
    if (prevOpenRef.current === isChatSidebarOpen) return

    const wasOpen = prevOpenRef.current
    prevOpenRef.current = isChatSidebarOpen

    if (!wasOpen && isChatSidebarOpen) {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current)
        clearTimerRef.current = null
      }
      // Always refresh baseline from the pre-adjust camera on open (don’t keep a synthetic one)
      closedBaselineRef.current = reactFlowInstance.getViewport()
      lastFrameKeyRef.current = null
      const pane = storeApi.getState().domNode as HTMLElement | null
      // Presence opens the column at width 0 first — pane is still the full closed width
      closedPaneWidthRef.current = pane && pane.clientWidth > 0 ? pane.clientWidth : null
    }

    let cancelled = false
    let innerId = 0
    const outerId = requestAnimationFrame(() => {
      innerId = requestAnimationFrame(() => {
        if (cancelled) return
        if (!wasOpen && isChatSidebarOpen) {
          frameFromBaseline() // Instant seed; RO follows the 200ms CSS width tween
          return
        }
        if (wasOpen && !isChatSidebarOpen) {
          const baseline = closedBaselineRef.current
          if (!baseline) return
          reactFlowInstance.setViewport(baseline, { duration: SIDEBAR_OPEN_CLOSE_MS })
          lastFrameKeyRef.current = null
          closedPaneWidthRef.current = null
          if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
          clearTimerRef.current = setTimeout(() => {
            closedBaselineRef.current = null
            clearTimerRef.current = null
          }, SIDEBAR_OPEN_CLOSE_MS + 20)
        }
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(outerId)
      if (innerId) cancelAnimationFrame(innerId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatSidebarOpen, reactFlowInstance, storeApi])

  // Resize: only after a real open baseline exists (don’t invent one in layout — that broke end pose)
  useLayoutEffect(() => {
    if (!reactFlowInstance || !isChatSidebarOpen) return
    if (!closedBaselineRef.current) return // Open effect owns the first snapshot
    frameFromBaseline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatSidebarWidth, isChatSidebarOpen, reactFlowInstance])

  // Pane flex often settles after the width commit — RO (before paint) corrects to the real clientWidth
  useEffect(() => {
    if (!reactFlowInstance || !isChatSidebarOpen) return
    const pane = storeApi.getState().domNode as HTMLElement | null
    if (!pane) return

    const ro = new ResizeObserver(() => {
      if (!closedBaselineRef.current) return
      frameFromBaseline() // Instant d3 — no rAF (rAF would flash; transition would too)
    })
    ro.observe(pane)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatSidebarOpen, reactFlowInstance, storeApi])

  // Cookie/SSR already-open: seed baseline once by inverting the live framed camera
  useEffect(() => {
    if (!reactFlowInstance || !isChatSidebarOpen) return
    if (closedBaselineRef.current) return

    const pane = storeApi.getState().domNode as HTMLElement | null
    if (!pane) return
    const openWidth = pane.clientWidth
    const height = pane.clientHeight
    const sidebarW = widthRef.current
    if (openWidth <= 0 || height <= 0 || sidebarW <= 0) return

    const closedWidth = openWidth + sidebarW
    const ratio = openWidth / closedWidth
    if (ratio <= 0 || ratio >= 1) return
    const vp = reactFlowInstance.getViewport()
    closedBaselineRef.current = {
      zoom: vp.zoom / ratio,
      x: vp.x / ratio,
      y: (vp.y - (height / 2) * (1 - ratio)) / ratio,
    }
    closedPaneWidthRef.current = closedWidth
    lastFrameKeyRef.current = `${Math.round(openWidth)}|${Math.round(closedWidth)}`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChatSidebarOpen, reactFlowInstance, storeApi])

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    }
  }, [])
}
