'use client'

// Zoom % control for the bottom nav menu (moved from the top-bar editor toolbar)
import { useEffect, useRef, useState } from 'react'
import { useReactFlow, useStore } from 'reactflow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BOARD_ZOOM_HARD, navPercentToZoom, zoomToNavPercent, zoomToNavPercentExact } from '@/lib/board-extent' // 50% zoom-in … 100% default … 200% zoom-out
import { cn } from '@/lib/utils'

export function NavZoomControl({ className }: { className?: string }) {
  const reactFlowInstance = useReactFlow() // RF instance for get/set viewport
  const minZoom = useStore((s) => s.minZoom) // Smallest scale: 200% max zoom-out
  const maxZoom = useStore((s) => s.maxZoom) // Largest scale: 50% max zoom-in
  const [zoom, setZoom] = useState(1) // Current scale (1 = 100% default view)
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

  // Keep display in sync with viewport; snap near scale 1 to the 100% default
  useEffect(() => {
    const updateZoom = () => {
      if (isEditingZoom || isDraggingZoom) return // Don't overwrite while typing or scrubbing
      const currentZoom = reactFlowInstance.getViewport().zoom
      if (currentZoom >= 0.98 && currentZoom <= 1.02 && currentZoom !== 1) {
        const viewport = reactFlowInstance.getViewport()
        reactFlowInstance.setViewport({ ...viewport, zoom: 1 })
        setZoom(1)
        setZoomEditValue(String(zoomToNavPercent(1))) // Scale 1 is 100% (the default view)
      } else {
        setZoom(currentZoom)
        setZoomEditValue(String(zoomToNavPercent(currentZoom))) // 50% zoom-in … 200% zoom-out
      }
    }
    updateZoom()
    const interval = setInterval(updateZoom, 100)
    return () => clearInterval(interval)
  }, [reactFlowInstance, isEditingZoom, isDraggingZoom])

  // Apply zoom centered on the map (same feel as wheel zoom)
  const applyScrubZoom = (rawZoom: number) => {
    let next = Math.max(minZoom, Math.min(maxZoom, rawZoom)) // Honor live board zoom range
    if (next >= 0.98 && next <= 1.02) next = 1 // Soft snap to the 100% default (scale 1)
    reactFlowInstance.zoomTo(next)
    setZoom(next)
    setZoomEditValue(String(zoomToNavPercent(next))) // Label follows the signed nav percent
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
    const startPct = zoomToNavPercentExact(drag.startZoom) // Unrounded so the crossing at 100% doesn't jump
    applyScrubZoom(navPercentToZoom(startPct + dy * 0.5))
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
    setZoomEditValue(String(zoomToNavPercent(zoom))) // 50% in … 200% out
    setTimeout(() => zoomInputRef.current?.select(), 0)
  }

  const handleZoomInputBlur = () => {
    setIsEditingZoom(false)
    const numericValue = parseFloat(zoomEditValue)
    if (!isNaN(numericValue)) {
      const newZoom = Math.max(minZoom, Math.min(maxZoom, navPercentToZoom(numericValue))) // 50% zoom-in … 200% zoom-out
      const viewport = reactFlowInstance.getViewport()
      reactFlowInstance.setViewport({ ...viewport, zoom: newZoom })
      setZoom(newZoom)
      setZoomEditValue(String(zoomToNavPercent(newZoom)))
    } else {
      setZoomEditValue(String(zoomToNavPercent(zoom))) // Revert invalid
    }
  }

  const handleZoomInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') zoomInputRef.current?.blur()
    if (e.key === 'Escape') {
      setZoomEditValue(String(zoomToNavPercent(zoom)))
      zoomInputRef.current?.blur()
    }
  }

  const handleZoomChange = (zoomValue: number | 'fit') => {
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
      calculatedZoom = Math.max(BOARD_ZOOM_HARD.minZoom, Math.min(BOARD_ZOOM_HARD.maxZoom, calculatedZoom)) // 200% out … 50% in
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
      let finalZoom = zoomValue
      if (zoomValue >= 0.98 && zoomValue <= 1.02) finalZoom = 1 // Snap near max zoom-in (scale 1)
      const viewport = reactFlowInstance.getViewport()
      reactFlowInstance.setViewport(
        { x: viewport.x, y: viewport.y, zoom: finalZoom },
        finalZoom !== zoomValue ? { duration: 150 } : undefined
      )
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
            {zoomToNavPercent(zoom)}%
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
            const z = navPercentToZoom(p) // Preset is a nav percent, not a raw scale
            return z >= minZoom - 1e-6 && z <= maxZoom + 1e-6
          })
          .map((p) => (
          <DropdownMenuItem
            key={p}
            onClick={() => handleZoomChange(navPercentToZoom(p))}
            className={cn(Math.abs(zoomToNavPercent(zoom) - p) < 0.5 && 'bg-gray-100 dark:bg-gray-800')}
          >
            {p}%
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
