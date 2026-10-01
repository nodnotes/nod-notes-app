'use client'

// Board preview via iframe, in-flow as a block in the host frame (not a portal).
// Nested RF inside a host node cannot pan/zoom (host `nopan`) — the iframe is a
// separate document so preview pan/zoom still works. Host zoom scales the frame.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReactFlow } from 'reactflow'
import { Loader2 } from 'lucide-react'
import { useReactFlowContext } from '@/components/react-flow-context'
import {
  PREVIEW_READY_MESSAGE,
  PREVIEW_RESIZE_MESSAGE,
  PREVIEW_STYLE_MESSAGE,
  usePreviewFocus,
} from '@/lib/preview-focus-context'
import { forwardWheelToHostBoard } from '@/lib/preview-host-input'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export const PREVIEW_HEIGHT = 360 // Hug / shaped-frame inflate uses this card height
const WARM_WIDTH = 480

type NestedBoardPreviewProps = {
  conversationId: string
  title: string
  onClose: () => void
  visible?: boolean
  fill?: boolean
  hostNodeId?: string // Host map item — chrome drag moves this node
  cornerRadius?: number // Inset preview card radius (0 = square, matches frame fill)
}

/** Host RF frame is selected — preview style-select is only allowed after that. */
function hostFrameIsSelected(
  from: HTMLElement | null,
  hostNodeId?: string,
  getNode?: (id: string) => { selected?: boolean } | undefined
): boolean {
  if (hostNodeId && getNode) {
    const n = getNode(hostNodeId) // RF store — classList can lag a tick behind
    if (n) return !!n.selected
  }
  return !!from?.closest('.react-flow__node')?.classList.contains('selected')
}

function isPreviewFocusChrome(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest('[data-page-preview]') ||
      target.closest('[data-page-preview-frame]') ||
      target.closest('[data-template-preview]') ||
      target.closest('[data-change-preview]') ||
      target.closest('[data-preview-style-chrome]') ||
      target.closest('[data-radix-popper-content-wrapper]') ||
      target.closest('[role="menu"]') ||
      target.closest('[role="listbox"]') ||
      target.closest('[data-minimap-context]') ||
      target.closest('[data-minimap-toggle-context]') ||
      target.closest('[data-minimap-pill-context]') ||
      target.closest('[data-preview-minimap]') ||
      target.closest('.react-flow__minimap')
  )
}

export function NestedBoardPreview({
  conversationId,
  title,
  onClose: _onClose, // Close lives on the boardLink open menu — no top bar X
  visible = true,
  fill = false,
  hostNodeId,
  cornerRadius = 0, // Square — same as FRAME_CORNER_RADIUS when host does not pass one
}: NestedBoardPreviewProps) {
  const previewFocus = usePreviewFocus()
  const { getSetNodes, reactFlowInstance } = useReactFlowContext()
  const { getNode } = useReactFlow() // Host node position for unfocused-body drag
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null) // In-flow card — ResizeObserver reads layout size
  const wasVisibleRef = useRef(false)
  const dragRef = useRef<{
    startX: number
    startY: number
    origX: number
    origY: number
  } | null>(null)
  const [layoutSize, setLayoutSize] = useState({ w: WARM_WIDTH, h: PREVIEW_HEIGHT }) // Iframe resize only
  const [loadedRule, setLoadedRule] = useState<'wide' | 'college' | 'narrow'>('college')
  const [loadedStyle, setLoadedStyle] = useState<'none' | 'dotted' | 'lined' | 'grid'>('dotted')
  const [navReady, setNavReady] = useState(false)
  const isFocused = previewFocus?.focusedBoardId === conversationId
  const embedSrc = `/embed/${conversationId}`

  // Select on open only when the host frame is already selected — unselected host: frame first
  useEffect(() => {
    if (!previewFocus) return
    const justOpened = visible && !wasVisibleRef.current
    wasVisibleRef.current = visible
    if (!justOpened) return
    if (!hostFrameIsSelected(shellRef.current, hostNodeId, getNode)) return // Don’t style-select over an unselected frame
    previewFocus.selectPreview({
      pageId: conversationId,
      title,
      boardRule: loadedRule,
      boardStyle: loadedStyle,
    })
  }, [visible, conversationId, title, loadedRule, loadedStyle, previewFocus, hostNodeId, getNode])

  useEffect(() => {
    setNavReady(false)
  }, [conversationId])

  // Layout size only — host zoom is CSS on the frame; do not re-fitView the embed every tick
  useEffect(() => {
    const el = shellRef.current
    if (!el || !visible) return
    const measure = () => {
      const w = Math.max(el.offsetWidth, 1) // Unscaled iframe resolution
      const h = Math.max(el.offsetHeight, 1)
      setLayoutSize((prev) =>
        Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5 ? prev : { w, h }
      )
    }
    measure()
    const ro = new ResizeObserver(measure) // Frame resize, not board pan/zoom
    ro.observe(el)
    return () => ro.disconnect()
  }, [visible])

  // Only remasure embed when layout box changes — not when host zoom changes
  const layoutW = layoutSize.w
  const layoutH = layoutSize.h
  useEffect(() => {
    if (!visible || !layoutW || !layoutH || !iframeRef.current?.contentWindow) return
    if (layoutW < 16 || layoutH < 16) return
    iframeRef.current.contentWindow.postMessage(
      { type: PREVIEW_RESIZE_MESSAGE, pageId: conversationId, fit: true },
      window.location.origin
    )
  }, [conversationId, layoutW, layoutH, visible, navReady])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; pageId?: string } | null
      if (!data || data.type !== PREVIEW_READY_MESSAGE) return
      if (data.pageId !== conversationId) return
      setNavReady(true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [conversationId])

  useEffect(() => {
    if (navReady) return
    const t = window.setTimeout(() => setNavReady(true), 1200)
    return () => window.clearTimeout(t)
  }, [navReady, conversationId])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', conversationId)
        .maybeSingle()
      if (cancelled) return
      const meta = (data?.metadata as Record<string, unknown>) || {}
      const rule = meta.boardRule
      const style = meta.boardStyle
      if (rule === 'wide' || rule === 'college' || rule === 'narrow') setLoadedRule(rule)
      if (style === 'none' || style === 'dotted' || style === 'lined' || style === 'grid') {
        setLoadedStyle(style)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [conversationId])

  useEffect(() => {
    if (!isFocused || !previewFocus) return
    const win = iframeRef.current?.contentWindow
    if (!win) return
    win.postMessage(
      {
        type: PREVIEW_STYLE_MESSAGE,
        boardRule: previewFocus.boardRule,
        boardStyle: previewFocus.boardStyle,
      },
      window.location.origin
    )
  }, [isFocused, previewFocus, previewFocus?.boardRule, previewFocus?.boardStyle])

  useEffect(() => {
    if (!visible || !isFocused || !previewFocus) return
    const onPointerDown = (event: PointerEvent) => {
      if (isPreviewFocusChrome(event.target)) return
      previewFocus.clearPreviewFocus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [visible, isFocused, previewFocus])

  useEffect(() => {
    return () => {
      if (previewFocus?.focusedBoardId === conversationId) {
        previewFocus.clearPreviewFocus()
      }
    }
  }, [conversationId, previewFocus])

  useEffect(() => {
    const body = bodyRef.current
    if (!body || !visible || isFocused) return
    const onWheel = (e: WheelEvent) => {
      forwardWheelToHostBoard(e)
    }
    body.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => body.removeEventListener('wheel', onWheel, { capture: true })
  }, [visible, isFocused])

  const handleSelectChrome = useCallback(() => {
    if (!previewFocus) return
    if (!hostFrameIsSelected(shellRef.current, hostNodeId, getNode)) return // Frame select first
    previewFocus.selectPreview({
      pageId: conversationId,
      title,
      boardRule: loadedRule,
      boardStyle: loadedStyle,
    })
  }, [
    conversationId,
    title,
    loadedRule,
    loadedStyle,
    previewFocus,
    hostNodeId,
    getNode,
  ])

  // Chrome drag moves the host frame like an unselected frame (no select on drag)
  const onHostDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return
      if (!hostNodeId) return
      const node = getNode(hostNodeId)
      if (!node) return
      if (!node.selected) {
        previewFocus?.clearPreviewFocus() // Drop any other preview focus
        return // Bubble — RF selects/drags the host frame first
      }
      e.preventDefault()
      e.stopPropagation()
      previewFocus?.clearPreviewFocus()
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: node.position.x,
        origY: node.position.y,
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [getNode, hostNodeId, previewFocus]
  )

  const onHostDragPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current || !hostNodeId) return
      const setNodes = getSetNodes()
      if (!setNodes) return
      const zoom = reactFlowInstance?.getViewport?.()?.zoom || 1
      const dx = (e.clientX - dragRef.current.startX) / zoom
      const dy = (e.clientY - dragRef.current.startY) / zoom
      const nextX = dragRef.current.origX + dx
      const nextY = dragRef.current.origY + dy
      setNodes((nodes: any[]) =>
        nodes.map((n) =>
          n.id === hostNodeId ? { ...n, position: { x: nextX, y: nextY } } : n
        )
      )
    },
    [getSetNodes, hostNodeId, reactFlowInstance]
  )

  const onHostDragPointerEnd = useCallback(
    (e: React.PointerEvent) => {
      if (!dragRef.current) return
      const moved =
        Math.abs(e.clientX - dragRef.current.startX) > 3 ||
        Math.abs(e.clientY - dragRef.current.startY) > 3
      dragRef.current = null
      if (!moved) handleSelectChrome()
    },
    [handleSelectChrome]
  )

  const cancelHostDrag = useCallback(() => {
    dragRef.current = null
  }, [])

  return (
      <div
        ref={shellRef}
        data-page-preview={conversationId}
        className={cn(
          'flex flex-col overflow-hidden border bg-gray-50 dark:bg-[#0f0f0f]', // In-flow block — fill shows around the inset
          fill ? 'h-full min-h-0 min-w-0 w-full flex-1' : 'w-full min-w-[280px] shrink-0',
          isFocused
            ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-400/40'
            : 'border-gray-200 dark:border-[#2f2f2f]',
          !visible && 'hidden'
        )}
        style={{
          height: fill ? '100%' : PREVIEW_HEIGHT, // Hug the content column; fixed height when not filling
          borderRadius: cornerRadius, // Inner card — not flush to the fill
        }}
        onClick={(e) => {
          const frame = (e.currentTarget as HTMLElement).closest('.react-flow__node')
          if (frame?.classList.contains('selected')) e.stopPropagation() // Selected: keep caret/atom quiet
        }}
        onDoubleClick={(e) => {
          const frame = (e.currentTarget as HTMLElement).closest('.react-flow__node')
          if (frame?.classList.contains('selected')) e.stopPropagation()
        }}
      >
        <div
          ref={bodyRef}
          data-preview-style-chrome // Click the board (no top bar) to style-select
          className={cn('relative flex-1 min-h-0', !isFocused && 'cursor-grab active:cursor-grabbing')}
          onPointerDown={!isFocused ? onHostDragPointerDown : undefined}
          onPointerMove={!isFocused ? onHostDragPointerMove : undefined}
          onPointerUp={!isFocused ? onHostDragPointerEnd : undefined}
          onPointerCancel={!isFocused ? cancelHostDrag : undefined}
        >
          <iframe
            ref={iframeRef}
            data-page-preview-frame={conversationId}
            data-preview-selected={isFocused ? 'true' : 'false'}
            title={title || 'Board preview'}
            src={embedSrc}
            className="absolute inset-0 w-full h-full border-0 bg-gray-50 dark:bg-[#0f0f0f]"
            style={{ pointerEvents: isFocused ? 'auto' : 'none' }}
            onLoad={() => {
              const win = iframeRef.current?.contentWindow
              if (!win) return
              win.postMessage(
                { type: PREVIEW_RESIZE_MESSAGE, pageId: conversationId, fit: true },
                window.location.origin
              )
              if (!isFocused || !previewFocus) return
              win.postMessage(
                {
                  type: PREVIEW_STYLE_MESSAGE,
                  boardRule: previewFocus.boardRule,
                  boardStyle: previewFocus.boardStyle,
                },
                window.location.origin
              )
            }}
          />
          {visible && !navReady && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50/70 dark:bg-[#0f0f0f]/70">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading page…
            </div>
          )}
        </div>
      </div>
  )
}

/** Prefetch lean embed document so the first open isn’t a cold Next navigation. */
export function prefetchBoardEmbed(conversationId: string) {
  if (typeof window === 'undefined' || !conversationId) return
  const href = `/embed/${conversationId}`
  if (document.querySelector(`link[data-tt-embed-prefetch="${conversationId}"]`)) return
  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.href = href
  link.as = 'document'
  link.setAttribute('data-tt-embed-prefetch', conversationId)
  document.head.appendChild(link)
}
