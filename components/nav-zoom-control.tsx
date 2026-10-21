'use client'

// Zoom % control for the bottom nav menu (moved from the top-bar editor toolbar)
import { useEffect, useRef, useState } from 'react'
import { getNodesBounds, useReactFlow, useStore } from 'reactflow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BOARD_ZOOM_HARD,
  clampViewportAgainstStore,
  getBoardZoom200,
  navPercentToZoom,
  zoomToNavPercent,
  zoomToNavPercentExact,
  type BoardTranslateExtent,
} from '@/lib/board-extent' // 50% … 100% (scale 1) … live 200% (fit board bounds)
import { cn } from '@/lib/utils'

/** Same filter as the minimap — measured frames only. */
function isBoardBoundNode(n: { hidden?: boolean; width?: number | null; height?: number | null; type?: string }) {
  return (
    !n.hidden &&
    !!n.width &&
    !!n.height &&
    n.type !== 'frameShimmer' &&
    n.type !== 'placeholder'
  )
}

export function NavZoomControl({ className }: { className?: string }) {
  const reactFlowInstance = useReactFlow() // RF instance for get/set viewport
  const minZoom = useStore((s) => s.minZoom) // Smallest scale: live 200% (fit board bounds)
  const maxZoom = useStore((s) => s.maxZoom) // Largest scale: 50% max zoom-in
  const paneW = useStore((s) => s.width) // Pane CSS width for fit-200%
  const paneH = useStore((s) => s.height) // Pane CSS height for fit-200%
  const translateExtent = useStore((s) => s.translateExtent as BoardTranslateExtent) // Pan enclosure
  const nodeOrigin = useStore((s) => s.nodeOrigin) // Needed for getNodesBounds
  const [zoom, setZoom] = useState(1) // Current scale
  const [z200, setZ200] = useState(1) // Live 200% = fit current board bounds
  const [isEditingZoom, setIsEditingZoom] = useState(false) // Inline % edit active
  const [zoomEditValue, setZoomEditValue] = useState('100') // Draft string while editing
  const zoomInputRef = useRef<HTMLInputElement>(null) // Focus target for inline edit
  const [menuOpen, setMenuOpen] = useState(false) // Preset menu open state
  const [isDraggingZoom, setIsDraggingZoom] = useState(false) // Vertical scrub in progress
  // Pointer scrub: drag up = zoom in, down = zoom out; click still opens presets
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startZoom: number
    dragging: boolean
  } | null>(null)
  const suppressMenuOpenRef = useRef(false) // Block preset menu after a scrub gesture
  const z200Ref = useRef(1) // Scrub/handlers read the latest fit reference without stale closes

  /** Content AABB → board bounds (content + gap) → fit zoom labeled 200%. */
  const readZ200 = () => {
    const nodes = reactFlowInstance.getNodes().filter(isBoardBoundNode)
    const content = nodes.length > 0 ? getNodesBounds(nodes, nodeOrigin) : null
    const fit = getBoardZoom200(content, paneW, paneH)
    // RF minZoom is the live 200% stop — may sit below fit so a hidden large frame can show
    const zoom = minZoom > 0 ? Math.min(fit.zoom, minZoom) : fit.zoom
    return { ...fit, zoom }
  }

  /** Zoom in place — keep the flow point under the pane center; clamp into board bounds. */
  const setZoomKeepingView = (nextZoom: number, opts?: { duration?: number }) => {
    if (!(paneW > 0) || !(paneH > 0)) {
      reactFlowInstance.zoomTo(nextZoom) // Pane not measured yet — d3 zoom only
      return
    }
    const vp = reactFlowInstance.getViewport()
    const z0 = vp.zoom > 0 ? vp.zoom : 1
    const cx = (paneW / 2 - vp.x) / z0 // Current view center in flow space
    const cy = (paneH / 2 - vp.y) / z0
    const next = {
      x: paneW / 2 - cx * nextZoom,
      y: paneH / 2 - cy * nextZoom,
      zoom: nextZoom,
    }
    reactFlowInstance.setViewport(
      clampViewportAgainstStore(next, { translateExtent, width: paneW, height: paneH }),
      opts?.duration != null ? { duration: opts.duration } : undefined
    )
  }

  // Keep % label in sync — do not soft-snap here (that fought zoom-in near 200%)
  useEffect(() => {
    const updateZoom = () => {
      const fit = readZ200()
      z200Ref.current = fit.zoom
      setZ200(fit.zoom)
      if (isEditingZoom || isDraggingZoom) return
      const currentZoom = reactFlowInstance.getViewport().zoom
      setZoom(currentZoom)
      setZoomEditValue(String(zoomToNavPercent(currentZoom, fit.zoom)))
    }
    updateZoom()
    const interval = setInterval(updateZoom, 100)
    return () => clearInterval(interval)
  }, [reactFlowInstance, isEditingZoom, isDraggingZoom, paneW, paneH, nodeOrigin, minZoom])

  // Scrub: RF zoomTo (d3 constrain); soft-snap onto the 200% floor only (never block zoom-in)
  const applyScrubZoom = (rawZoom: number) => {
    const ref = z200Ref.current
    let next = Math.max(minZoom, Math.min(maxZoom, rawZoom))
    if (ref > 0 && next <= ref * 1.01) next = ref // At/under floor → stick to 200%
    reactFlowInstance.zoomTo(next)
    setZoom(next)
    setZoomEditValue(String(zoomToNavPercent(next, ref)))
  }

  const handleZoomPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return // Left button only
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startZoom: reactFlowInstance.getViewport().zoom,
      dragging: false,
    }
    // Don't capture yet — early capture breaks the click that opens the preset menu
  }

  const handleZoomPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dy = e.clientY - drag.startY
    if (!drag.dragging && Math.abs(dy) < 4) return // Treat tiny moves as a click
    if (!drag.dragging) {
      drag.dragging = true
      setIsDraggingZoom(true)
      setMenuOpen(false) // Close presets if open while scrubbing
      e.currentTarget.setPointerCapture(e.pointerId) // Capture only once scrubbing starts
    }
    // Drag up (negative dy) → zoom in (percent falls). Drag down → zoom out, stopping at 200%.
    const ref = z200Ref.current
    const startPct = zoomToNavPercentExact(drag.startZoom, ref)
    applyScrubZoom(navPercentToZoom(startPct + dy * 0.5, ref))
  }

  const handleZoomPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    if (drag.dragging) {
      suppressMenuOpenRef.current = true // Next click is leftover from scrub — don't open menu
      setIsDraggingZoom(false)
    }
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const handleZoomInputFocus = () => {
    setIsEditingZoom(true) // Swap button for input
    setMenuOpen(false) // Close presets while editing
    setZoomEditValue(String(zoomToNavPercent(zoom, z200Ref.current)))
    setTimeout(() => zoomInputRef.current?.select(), 0)
  }

  /** 200% → zoom out to meet board bounds; keep current view center (do not jump to content). */
  const goTo200 = () => {
    const fit = readZ200()
    z200Ref.current = fit.zoom
    setZ200(fit.zoom)
    window.dispatchEvent(new CustomEvent('fit-view-start'))
    setZoomKeepingView(fit.zoom, { duration: 300 })
    setTimeout(() => {
      setZoom(fit.zoom)
      setZoomEditValue(String(zoomToNavPercent(fit.zoom, fit.zoom)))
      window.dispatchEvent(new CustomEvent('fit-view-end'))
    }, 350)
  }

  /** 100% → default scale 1 (not past the live 200% floor). */
  const goTo100 = () => {
    const fit = readZ200()
    z200Ref.current = fit.zoom
    setZ200(fit.zoom)
    const zMid = Math.max(fit.zoom, 1)
    setZoomKeepingView(zMid, { duration: 300 })
    setTimeout(() => {
      setZoom(zMid)
      setZoomEditValue(String(zoomToNavPercent(zMid, fit.zoom)))
    }, 350)
  }

  const handleZoomInputBlur = () => {
    setIsEditingZoom(false)
    const numericValue = parseFloat(zoomEditValue)
    const ref = z200Ref.current
    if (!isNaN(numericValue)) {
      if (numericValue === 200) {
        goTo200() // Typed 200% → meet board bounds
        return
      }
      if (numericValue === 100) {
        goTo100() // Typed 100% → scale 1
        return
      }
      const newZoom = Math.max(minZoom, Math.min(maxZoom, navPercentToZoom(numericValue, ref)))
      setZoomKeepingView(newZoom)
      setZoom(newZoom)
      setZoomEditValue(String(zoomToNavPercent(newZoom, ref)))
    } else {
      setZoomEditValue(String(zoomToNavPercent(zoom, ref)))
    }
  }

  const handleZoomInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') zoomInputRef.current?.blur()
    if (e.key === 'Escape') {
      setZoomEditValue(String(zoomToNavPercent(zoom, z200Ref.current)))
      zoomInputRef.current?.blur()
    }
  }

  const handleZoomChange = (zoomValue: number | 'fit' | '100' | '200') => {
    if (zoomValue === '200') {
      goTo200()
      return
    }
    if (zoomValue === '100') {
      goTo100()
      return
    }
    if (zoomValue === 'fit') {
      // Fit content into the map, accounting for top bar + prompt box
      const topBar = document.querySelector('[class*="bg-white"][class*="shadow-sm"][class*="border-b"]') as HTMLElement
      const inputBox = document.querySelector('textarea[placeholder*="Type"], textarea[placeholder*="message"]')?.closest('[class*="pointer-events-auto"]') as HTMLElement
      const reactFlowElement = document.querySelector('.react-flow') as HTMLElement

      let topPadding = 0
      let bottomPadding = 0
      if (topBar && reactFlowElement) {
        const topBarHeight = topBar.offsetHeight
        const reactFlowHeight = reactFlowElement.offsetHeight
        if (topBarHeight > 0) topPadding = topBarHeight / reactFlowHeight
      }
      if (inputBox && reactFlowElement) {
        const inputBoxRect = inputBox.getBoundingClientRect()
        const reactFlowRect = reactFlowElement.getBoundingClientRect()
        const inputBoxHeight = reactFlowRect.bottom - inputBoxRect.top + 16
        const reactFlowHeight = reactFlowElement.offsetHeight
        if (inputBoxHeight > 0 && inputBoxHeight < reactFlowHeight) {
          bottomPadding = inputBoxHeight / reactFlowHeight
        }
      }

      const uiPadding = Math.max(topPadding, bottomPadding, 0.05)
      const nodes = reactFlowInstance.getNodes()
      if (nodes.length === 0) {
        reactFlowInstance.fitView({ padding: uiPadding, minZoom: BOARD_ZOOM_HARD.minZoom, maxZoom: BOARD_ZOOM_HARD.maxZoom, duration: 300 })
        return
      }

      const panelWidth = 768
      const panelHeight = 400
      const minX = Math.min(...nodes.map((n) => n.position.x))
      const maxX = Math.max(...nodes.map((n) => n.position.x + panelWidth))
      const minY = Math.min(...nodes.map((n) => n.position.y))
      const maxY = Math.max(...nodes.map((n) => n.position.y + panelHeight))
      const contentWidth = maxX - minX
      const contentHeight = maxY - minY
      const contentCenterX = minX + contentWidth / 2
      const contentCenterY = minY + contentHeight / 2
      const reactFlowWidth = reactFlowElement?.clientWidth || 0
      const reactFlowHeight = reactFlowElement?.clientHeight || 0
      if (reactFlowWidth === 0 || reactFlowHeight === 0) {
        reactFlowInstance.fitView({ padding: uiPadding, minZoom: BOARD_ZOOM_HARD.minZoom, maxZoom: BOARD_ZOOM_HARD.maxZoom, duration: 300 })
        return
      }

      const availableWidth = reactFlowWidth * (1 - uiPadding * 2)
      const availableHeight = reactFlowHeight * (1 - uiPadding * 2)
      let calculatedZoom = Math.min(availableWidth / contentWidth, availableHeight / contentHeight)
      calculatedZoom = Math.max(BOARD_ZOOM_HARD.minZoom, Math.min(BOARD_ZOOM_HARD.maxZoom, calculatedZoom))
      const targetViewportY = reactFlowHeight / 2 - contentCenterY * calculatedZoom

      window.dispatchEvent(new CustomEvent('fit-view-start'))
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const currentInputBox = document.querySelector('textarea[placeholder*="Type"], textarea[placeholder*="message"]')?.closest('[class*="pointer-events-auto"]') as HTMLElement
          const currentReactFlowElement = document.querySelector('.react-flow') as HTMLElement
          if (currentInputBox && currentReactFlowElement) {
            const inputBoxRect = currentInputBox.getBoundingClientRect()
            const reactFlowRect = currentReactFlowElement.getBoundingClientRect()
            const promptBoxCenterX = (inputBoxRect.left + inputBoxRect.right) / 2 - reactFlowRect.left
            reactFlowInstance.setViewport(
              { x: promptBoxCenterX - contentCenterX * calculatedZoom, y: targetViewportY, zoom: calculatedZoom },
              { duration: 300 }
            )
          } else {
            reactFlowInstance.setViewport(
              { x: reactFlowWidth / 2 - contentCenterX * calculatedZoom, y: targetViewportY, zoom: calculatedZoom },
              { duration: 300 }
            )
          }
          setTimeout(() => window.dispatchEvent(new CustomEvent('fit-view-end')), 350)
        })
      })
    } else {
      const ref = z200Ref.current
      const ratio = ref > 0 ? zoomValue / ref : 1
      if (ratio >= 0.98 && ratio <= 1.02) {
        goTo200() // Near 200% preset → meet board bounds
        return
      }
      setZoomKeepingView(zoomValue) // Presets keep the current view center
    }
    setTimeout(() => setZoom(reactFlowInstance.getViewport().zoom), 10)
  }

  if (isEditingZoom) {
    return (
      <Input
        ref={zoomInputRef}
        type="text"
        value={`${zoomEditValue}%`}
        onChange={(e) => setZoomEditValue(e.target.value.replace('%', ''))}
        onBlur={handleZoomInputBlur}
        onKeyDown={handleZoomInputKeyDown}
        className={cn(
          'h-6 w-14 px-0.5 text-xs text-center text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 focus:border-blue-500 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0',
          className
        )}
        onFocus={(e) => e.target.select()}
        autoFocus
      />
    )
  }

  return (
    <DropdownMenu
      modal={false}
      open={menuOpen}
      onOpenChange={(open) => {
        // After a vertical scrub, the pointer-up click must not open presets
        if (open && suppressMenuOpenRef.current) {
          suppressMenuOpenRef.current = false
          setMenuOpen(false)
          return
        }
        setMenuOpen(open)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-6 px-1.5 text-xs text-gray-900 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-[#2a2a2a] cursor-ns-resize',
            isDraggingZoom && 'bg-gray-200 dark:bg-[#2a2a2a]',
            className
          )}
          onPointerDown={handleZoomPointerDown}
          onPointerMove={handleZoomPointerMove}
          onPointerUp={handleZoomPointerUp}
          onPointerCancel={handleZoomPointerUp}
          onClick={(e) => {
            // After a scrub, kill the leftover click so the menu stays closed
            if (suppressMenuOpenRef.current) {
              suppressMenuOpenRef.current = false
              e.preventDefault()
              e.stopPropagation()
            }
            // Otherwise Radix trigger opens/closes the preset menu as usual
          }}
          onDoubleClick={(e) => {
            e.preventDefault() // Double-click edits the % inline (same as former top-bar click)
            e.stopPropagation()
            handleZoomInputFocus()
          }}
          title="Zoom — drag up/down to adjust, click for presets, double-click to type"
        >
          {/* Grow with digit count (50% in → 200% out); tabular so width doesn’t jump mid-scrub */}
          <span className="inline-block text-center tabular-nums whitespace-nowrap">
            {zoomToNavPercent(zoom, z200)}%
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-32">
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault() // Keep menu open while focusing inline edit
            setMenuOpen(false)
            handleZoomInputFocus()
          }}
        >
          Custom…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleZoomChange('fit')}>Fit</DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Menu opens upward: top = zoom in (50%), bottom = max zoom out (200%). */}
        {[50, 75, 100, 150, 200]
          .filter((p) => {
            if (p === 200 || p === 100) return true // Always offer default + live fit-to-bounds
            const z = navPercentToZoom(p, z200)
            return z >= minZoom - 1e-6 && z <= maxZoom + 1e-6
          })
          .map((p) => (
          <DropdownMenuItem
            key={p}
            onClick={() =>
              p === 200
                ? handleZoomChange('200')
                : p === 100
                  ? handleZoomChange('100')
                  : handleZoomChange(navPercentToZoom(p, z200))
            }
            className={cn(Math.abs(zoomToNavPercent(zoom, z200) - p) < 0.5 && 'bg-gray-100 dark:bg-gray-800')}
          >
            {p}%
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
