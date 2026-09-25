'use client'

// Change click → popup left of utility. Host Free nav / toolbar apply; edits are local-only.

import { useCallback, useEffect, useRef, useState } from 'react' // Focus, resize, first-edit note
import { createPortal } from 'react-dom'
import { X } from 'lucide-react' // Close — same as NestedBoardPreview
import { boardTitleOrDefault } from '@/lib/board-title'
import {
  CHANGE_PREVIEW_EDIT_MESSAGE,
  type BoardChange,
} from '@/lib/board-changes'
import { formatCaptureTimestamp } from '@/lib/captures' // Save time under the board name
import {
  PREVIEW_READY_MESSAGE,
  PREVIEW_RESIZE_MESSAGE,
  PREVIEW_STYLE_MESSAGE,
  usePreviewFocus,
} from '@/lib/preview-focus-context'
import { forwardWheelToHostBoard } from '@/lib/preview-host-input'
import {
  utilityOccupiedWidth,
  useSidebarContext,
} from '@/components/sidebar-context' // Right inset = chat + utility
import { cn } from '@/lib/utils'

type ChangePreviewPopupProps = {
  change: BoardChange // Listing + frozen embed id
  onClose: () => void
}

/** Clicks that should keep this preview focused (host nav / utility / More menus). */
function isChangePreviewChrome(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    target.closest('[data-page-preview]') ||
      target.closest('[data-page-preview-frame]') ||
      target.closest('[data-preview-style-chrome]') ||
      target.closest('[data-change-preview]') ||
      target.closest('[data-template-preview]') ||
      target.closest('[data-utility-sidebar]') ||
      target.closest('[data-edit-menu-context]') ||
      target.closest('[data-edit-menu-pill]') ||
      target.closest('[data-radix-popper-content-wrapper]') ||
      target.closest('[role="menu"]') ||
      target.closest('[role="listbox"]') ||
      target.closest('[data-minimap-context]') ||
      target.closest('[data-minimap-toggle-context]') ||
      target.closest('[data-minimap-pill-context]') ||
      target.closest('.react-flow__minimap')
  )
}

/** Fixed popup left of the utility bar — iframe is `/embed/change/{id}` (editable sandbox). */
export function ChangePreviewPopup({ change, onClose }: ChangePreviewPopupProps) {
  const title = boardTitleOrDefault(change.title) // Same empty-board label
  const description = formatCaptureTimestamp(change.created_at) // When this save was taken
  const previewFocus = usePreviewFocus()
  const {
    isChatSidebarOpen,
    chatSidebarWidth,
    isUtilitySidebarOpen,
    utilitySidebarWidth,
    isMobileMode,
    chatFitPhone,
  } = useSidebarContext()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const previewFocusRef = useRef(previewFocus) // Stable unmount cleanup
  previewFocusRef.current = previewFocus
  const [navReady, setNavReady] = useState(false) // Hide the load veil after PREVIEW_READY
  const [editNote, setEditNote] = useState(false) // First-edit “won’t be saved”
  const [topInset, setTopInset] = useState(104) // Below Actions/Layout/Draw pill (52+4+40+8)
  const isFocused = previewFocus?.focusedBoardId === change.id
  const useChatMapDock = isMobileMode || chatFitPhone // Chat is not a right column
  const chatRight = !useChatMapDock && isChatSidebarOpen ? chatSidebarWidth : 0
  const utilityRight = isUtilitySidebarOpen ? utilityOccupiedWidth(utilitySidebarWidth) : 0
  const rightInset = chatRight + utilityRight + 8 // Sit left of utility (and chat when it’s a column)

  // Sit under the Actions/Layout/Draw toolbar toggle — do not cover the pill
  useEffect(() => {
    const measure = () => {
      const pill = document.querySelector('[data-edit-menu-pill]')
      if (pill instanceof HTMLElement) {
        setTopInset(Math.round(pill.getBoundingClientRect().bottom) + 8) // 8px under the toggle
        return
      }
      setTopInset(104) // 52 bar + 4 gap + ~40 pill + 8
    }
    measure()
    const pill = document.querySelector('[data-edit-menu-pill]')
    const ro = pill ? new ResizeObserver(measure) : null
    if (pill) ro?.observe(pill)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose() // Same dismiss as menus
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Select on open so host pan/zoom/draw/Board style apply like NestedBoardPreview
  useEffect(() => {
    previewFocusRef.current?.selectPreview({ pageId: change.id, title })
  }, [change.id, title])

  useEffect(() => {
    const pageId = change.id // Close this preview only
    return () => {
      const focus = previewFocusRef.current
      if (focus?.focusedBoardId === pageId) focus.clearPreviewFocus()
    }
  }, [change.id])

  useEffect(() => {
    setNavReady(false) // New iframe
    setEditNote(false) // Fresh note for this save
  }, [change.id])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; pageId?: string } | null
      if (!data) return
      if (data.type === PREVIEW_READY_MESSAGE && data.pageId === change.id) {
        setNavReady(true) // Embed can pan/zoom
      }
      if (data.type === CHANGE_PREVIEW_EDIT_MESSAGE && data.pageId === change.id) {
        setEditNote(true) // Local edits only
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [change.id])

  useEffect(() => {
    if (navReady) return
    const t = window.setTimeout(() => setNavReady(true), 1200) // Veil fallback
    return () => window.clearTimeout(t)
  }, [navReady, change.id])

  // Remeasure embed when the popup box changes
  useEffect(() => {
    const win = iframeRef.current?.contentWindow
    if (!win || !navReady) return
    win.postMessage(
      { type: PREVIEW_RESIZE_MESSAGE, pageId: change.id, fit: true },
      window.location.origin
    )
  }, [change.id, navReady, rightInset, topInset])

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
    if (!isFocused || !previewFocus) return
    const onPointerDown = (event: PointerEvent) => {
      if (isChangePreviewChrome(event.target)) return // Host nav / utility / this popup
      previewFocus.clearPreviewFocus() // Click-away: keep popup, idle the embed
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [isFocused, previewFocus])

  useEffect(() => {
    const chrome = chromeRef.current
    if (!chrome) return
    const onWheel = (e: WheelEvent) => {
      forwardWheelToHostBoard(e) // Header wheel pans the host map
    }
    chrome.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => chrome.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  useEffect(() => {
    const body = bodyRef.current
    if (!body || isFocused) return
    const onWheel = (e: WheelEvent) => {
      forwardWheelToHostBoard(e) // Deselected body is static
    }
    body.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => body.removeEventListener('wheel', onWheel, { capture: true })
  }, [isFocused])

  const handleSelectChrome = useCallback(() => {
    previewFocus?.selectPreview({ pageId: change.id, title })
  }, [previewFocus, change.id, title])

  if (typeof document === 'undefined') return null // SSR

  return createPortal(
    <div
      data-change-preview
      data-page-preview={change.id}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className={cn(
        'fixed z-[25] flex flex-col overflow-hidden rounded-xl border bg-white shadow-xl dark:bg-[#1a1a1a]',
        isFocused
          ? 'border-blue-500 dark:border-blue-400 ring-2 ring-blue-400/40'
          : 'border-black/10 dark:border-white/10'
      )}
      style={{
        top: topInset, // Under the Actions/Layout/Draw toolbar toggle
        right: rightInset, // Left of utility (+ chat column when it owns the right)
        width: `min(480px, calc(100vw - ${rightInset + 24}px))`,
        height: `min(400px, calc(100vh - ${topInset + 16}px))`,
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <header
        ref={chromeRef}
        data-preview-style-chrome
        className={cn(
          'flex shrink-0 items-start gap-2 border-b px-2.5 py-1.5',
          isFocused
            ? 'border-blue-400 bg-blue-50/90 dark:bg-blue-950/50'
            : 'border-black/10 dark:border-white/10'
        )}
        onPointerDown={handleSelectChrome} // Click chrome to retarget host tools
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-gray-900 dark:text-gray-100">
            {title}
          </p>
          {description ? (
            <p className="line-clamp-2 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-[#2a2a2a] dark:hover:text-gray-100"
          title="Close preview"
          aria-label="Close preview"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            previewFocus?.clearPreviewFocus()
            onClose()
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>
      <div
        ref={bodyRef}
        className={cn(
          'relative min-h-0 flex-1 bg-gray-50 dark:bg-[#0f0f0f]',
          !isFocused && 'cursor-grab'
        )}
        onPointerDown={!isFocused ? handleSelectChrome : undefined}
      >
        <iframe
          ref={iframeRef}
          data-page-preview-frame={change.id}
          data-preview-selected={isFocused ? 'true' : 'false'}
          title={title}
          src={`/embed/change/${change.id}`}
          className="absolute inset-0 h-full w-full border-0"
          style={{ pointerEvents: isFocused ? 'auto' : 'none' }}
          onLoad={() => {
            const win = iframeRef.current?.contentWindow
            if (!win) return
            win.postMessage(
              { type: PREVIEW_RESIZE_MESSAGE, pageId: change.id, fit: true },
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
        {!navReady ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-xs text-gray-500 dark:text-gray-400 bg-gray-50/70 dark:bg-[#0f0f0f]/70">
            Loading preview…
          </div>
        ) : null}
        {editNote ? (
          <div
            role="status"
            className="absolute left-2 right-2 top-2 z-20 flex items-start gap-2 rounded-lg border border-black/10 bg-white/95 px-2.5 py-1.5 text-[12px] leading-4 text-gray-700 shadow-sm dark:border-white/10 dark:bg-[#1a1a1a]/95 dark:text-gray-200"
          >
            <p className="min-w-0 flex-1">
              Change preview changes won’t be saved.
            </p>
            <button
              type="button"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-[#2a2a2a] dark:hover:text-gray-100"
              title="Dismiss"
              aria-label="Dismiss"
              onClick={() => setEditNote(false)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
