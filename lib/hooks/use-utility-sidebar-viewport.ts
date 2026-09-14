'use client'

// When the transparent utility overlay opens/closes/resizes, scale zoom as if the map pane shrank.
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { ReactFlowInstance, Viewport } from 'reactflow'
import { useStoreApi } from 'reactflow'
import { zoomIdentity } from 'd3-zoom'
import { useSidebarContext, utilityOccupiedWidth } from '@/components/sidebar-context'
import { SIDEBAR_OPEN_CLOSE_MS } from '@/lib/hooks/use-open-close-presence'

/** Apply width-ratio camera transform from a closed-state baseline (no drift). */
function viewportForOpenWidth(
  baseline: Viewport, // Camera while overlay was closed
  closedWidth: number, // Full map pane width
  openWidth: number, // Usable width (pane minus overlay)
  height: number // Pane height (unchanged by overlay)
): Viewport {
  const ratio = openWidth / closedWidth // Zoom out so the same horizontal span fits the usable strip
  return {
    zoom: baseline.zoom * ratio, // Relative zoom for narrower usable area
    x: baseline.x * ratio, // Keep horizontal framing fractions stable
    y: (height / 2) * (1 - ratio) + baseline.y * ratio, // Keep vertical center stable
  }
}

/**
 * Scales the React Flow viewport when the utility overlay toggles or resizes.
 * Resize: measured usable width + instant d3Zoom.transform (no transition interrupt flash).
 */
export function useUtilitySidebarViewportAdjust(
  reactFlowInstance: ReactFlowInstance | null, // Active flow instance (null until mounted)
  isUtilitySidebarOpen: boolean // Overlay visibility from sidebar context
) {
  const { utilitySidebarWidth } = useSidebarContext() // Live overlay chrome width (drag-resized)
  const storeApi = useStoreApi() // This board’s RF store — d3Zoom + correct pane

  const widthRef = useRef(utilityOccupiedWidth(utilitySidebarWidth)) // Occupied strip including right air gap
  widthRef.current = utilityOccupiedWidth(utilitySidebarWidth)

  const prevOpenRef = useRef(isUtilitySidebarOpen) // Skip initial mount; only react to toggles
  const closedBaselineRef = useRef<Viewport | null>(null) // Exact camera to restore on close
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // Delayed baseline clear after close
  const lastFrameKeyRef = useRef<string | null>(null) // Skip duplicate applies
  const closedPaneWidthRef = useRef<number | null>(null) // Full pane width locked once per open cycle
  const instanceRef = useRef(reactFlowInstance)
  instanceRef.current = reactFlowInstance

  /** Instant camera — skips d3 transition. */
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

  /** Frame from closed baseline; usable = locked pane − overlay (overlay does not change DOM pane). */
  const frameFromBaseline = (duration?: number) => {
    const rf = instanceRef.current
    const baseline = closedBaselineRef.current
    if (!rf || !baseline) return

    const pane = storeApi.getState().domNode as HTMLElement | null
    if (!pane) return
    const height = pane.clientHeight
    if (height <= 0) return

    const overlayW = widthRef.current
    if (closedPaneWidthRef.current == null) {
      const paneW = pane.clientWidth
      if (paneW <= 0) return
      closedPaneWidthRef.current = paneW
    }
    const closedWidth = closedPaneWidthRef.current
    if (closedWidth <= 0) return

    const openWidth = Math.max(1, closedWidth - overlayW)
    const frameKey = `${Math.round(openWidth)}|${Math.round(closedWidth)}`
    if (lastFrameKeyRef.current === frameKey) return

    const next = viewportForOpenWidth(baseline, closedWidth, openWidth, height)
    if (duration != null && duration > 0) rf.setViewport(next, { duration })
    else setViewportInstant(next)
    lastFrameKeyRef.current = frameKey
  }

  // Open / close — snapshot real closed camera, then animate
  useEffect(() => {
    if (!reactFlowInstance) return
    if (prevOpenRef.current === isUtilitySidebarOpen) return

    const wasOpen = prevOpenRef.current
    prevOpenRef.current = isUtilitySidebarOpen

    if (!wasOpen && isUtilitySidebarOpen) {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current)
        clearTimerRef.current = null
      }
      closedBaselineRef.current = reactFlowInstance.getViewport() // Always fresh closed camera
      lastFrameKeyRef.current = null
      closedPaneWidthRef.current = null
    }

    let cancelled = false
    let innerId = 0
    const outerId = requestAnimationFrame(() => {
      innerId = requestAnimationFrame(() => {
        if (cancelled) return
        if (!wasOpen && isUtilitySidebarOpen) {
          frameFromBaseline(SIDEBAR_OPEN_CLOSE_MS)
          return
        }
        if (wasOpen && !isUtilitySidebarOpen) {
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
  }, [isUtilitySidebarOpen, reactFlowInstance])

  // Resize: only after a real open baseline exists
  useLayoutEffect(() => {
    if (!reactFlowInstance || !isUtilitySidebarOpen) return
    if (!closedBaselineRef.current) return
    frameFromBaseline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utilitySidebarWidth, isUtilitySidebarOpen, reactFlowInstance])

  // Cookie/SSR already-open: seed baseline once by inverting the live framed camera
  useEffect(() => {
    if (!reactFlowInstance || !isUtilitySidebarOpen) return
    if (closedBaselineRef.current) return

    const pane = storeApi.getState().domNode as HTMLElement | null
    if (!pane) return
    const closedWidth = pane.clientWidth
    const height = pane.clientHeight
    const overlayW = widthRef.current
    if (closedWidth <= 0 || height <= 0 || overlayW <= 0 || closedWidth <= overlayW) return

    const openWidth = closedWidth - overlayW
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
  }, [isUtilitySidebarOpen, reactFlowInstance, storeApi])

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
    }
  }, [])
}
