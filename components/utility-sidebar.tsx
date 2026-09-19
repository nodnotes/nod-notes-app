'use client'

// Transparent right utility overlay on the map — left of chat when both open; layers / sets / views

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react' // Seam drag + hover tip
import { useParams } from 'next/navigation' // Board id for Capture panel
import { ChevronsRight, Layers, Scan, SquareStack } from 'lucide-react' // Mode icons + header close
import { cn } from '@/lib/utils' // Class merge
import { useSidebarContext, UTILITY_RIGHT_GAP_PX, type UtilitySidebarMode } from './sidebar-context' // Open state + live width + right air gap
import {
  SIDEBAR_OPEN_CLOSE_MS,
  useOpenClosePresence,
} from '@/lib/hooks/use-open-close-presence' // Keep overlay mounted through open/close slide
import { LayersTouchingList } from './layers-touching-list' // Preview list of touching selection
import { SetsList } from './sets-list' // Snapshots added from frame / block / text menus
import { CapturesPanel } from './captures-menu' // Capture list (same as View-bar menu)

/** Clear the map brand chat toggle (42px + 8px inset + air) so Capture footer / lists don’t sit on it. */
const UTILITY_BRAND_CLEARANCE_PX = 64

/** Mode tab labels for the utility header strip. */
const MODE_TABS: { id: UtilitySidebarMode; label: string; icon: typeof Layers }[] = [
  { id: 'layers', label: 'Layers', icon: Layers }, // Default — frame stacking order
  { id: 'flashcards', label: 'Sets', icon: SquareStack }, // Snapshots added from menus (stored mode id stays flashcards)
  { id: 'capture', label: 'Views', icon: Scan }, // Board views — utility Views tab (mode id stays capture)
]

/**
 * Left-edge divider — same Notion-style Close/Resize as chat (click closes, drag resizes).
 * No seam-gap punches — prompt↔board threads clip at this left edge and paint under the bar.
 */
function UtilitySidebarSeam() {
  const { setUtilitySidebarOpen, utilitySidebarWidth, setUtilitySidebarWidth } = useSidebarContext()
  const [tipOpen, setTipOpen] = useState(false) // Hover tip beside the handle
  const dragRef = useRef<{ startX: number; startW: number; moved: boolean } | null>(null)

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return // Left button only
    e.preventDefault()
    setTipOpen(false) // Hide tip while dragging
    dragRef.current = { startX: e.clientX, startW: utilitySidebarWidth, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = drag.startX - e.clientX // Drag left → wider utility (panel is on the right)
    if (!drag.moved && Math.abs(dx) < 3) return // Click-slop before resize
    drag.moved = true
    setUtilitySidebarWidth(drag.startW + dx) // Clamp lives in context
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    if (drag && !drag.moved) setUtilitySidebarOpen(false) // Click without drag = Close
  }

  return (
    <div
      data-utility-sidebar-seam-hit
      className="absolute inset-y-0 left-0 z-30 w-3 -translate-x-1/2 cursor-col-resize touch-none pointer-events-auto"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseEnter={() => {
        if (!dragRef.current) setTipOpen(true)
      }}
      onMouseLeave={() => setTipOpen(false)}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize or close sidebar"
      tabIndex={-1}
    >
      {tipOpen ? (
        <div
          className="pointer-events-none absolute left-0 top-1/2 z-40 -translate-x-full -translate-y-1/2 -ml-2 rounded-md bg-[#2f2f2f] px-2.5 py-1.5 text-[12px] leading-snug text-white shadow-lg whitespace-nowrap"
          role="tooltip"
        >
          <div>
            <span className="font-semibold">Close</span>
            <span className="text-white/70"> Click</span>
          </div>
          <div>
            <span className="font-semibold">Resize</span>
            <span className="text-white/70"> Drag</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Mode body — layers list, sets list, or embedded captures panel. */
function UtilityModeBody({
  mode,
  conversationId,
}: {
  mode: UtilitySidebarMode
  conversationId?: string
}) {
  if (mode === 'layers') {
    return <LayersTouchingList conversationId={conversationId} /> // Groups are stored per board
  }
  if (mode === 'flashcards') {
    return <SetsList /> // Sets tab — named sets, not the Add-to-set picker
  }
  return <CapturesPanel conversationId={conversationId} variant="sidebar" />
}

/** Overlay on the map’s right edge (left of chat) — transparent so the board shows through. */
export function UtilitySidebar() {
  const {
    isUtilitySidebarOpen,
    utilitySidebarWidth,
    utilitySidebarMode,
    setUtilitySidebarMode,
    setUtilitySidebarOpen,
    isMobileMode,
    isChatSidebarOpen,
    aiMapDockLiftPx,
    aiMapDockComposerLiftPx,
    aiKeyboardOpen,
  } = useSidebarContext()
  const params = useParams<{ conversationId?: string }>() // Board id when on /board/{id}
  const conversationId =
    typeof params?.conversationId === 'string' ? params.conversationId : undefined
  // Brand mark only mounts while chat is closed — clear it then; full height when chat owns the right
  const clearBrand = !isChatSidebarOpen
  // Phone + keyboard: keep the mode tabs, hide the grey body until the keyboard drops (chat, I-bar, any field)
  const hideUtilityBody = isMobileMode && aiKeyboardOpen
  const composerPad = aiMapDockComposerLiftPx || aiMapDockLiftPx // Empty-chat floor (chrome + Ask + keyboard)
  const bottomPad =
    isMobileMode && isChatSidebarOpen
      ? hideUtilityBody
        ? 0 // Header-only while the keyboard is up
        : composerPad // Overlap the transcript; stop above Ask like a new chat
      : clearBrand
        ? UTILITY_BRAND_CLEARANCE_PX
        : 0
  const {
    mounted,
    shown,
    transitionOn,
    onTransitionEnd,
  } = useOpenClosePresence(isUtilitySidebarOpen, SIDEBAR_OPEN_CLOSE_MS)

  if (!mounted) return null // Stay mounted through the close tween on desktop and phone

  return (
    <aside
      data-utility-sidebar
      className={cn(
        'pointer-events-none absolute inset-y-0 right-0 flex flex-col isolate', // isolate: under-thread SVG (z-0) stacks under chrome
        isMobileMode ? 'z-[46]' : 'z-20', // Phone: above the map-docked chat (z-45) so the body can overlap the transcript
        'bg-transparent', // Board paints through; chrome is tabs / list only
        transitionOn && 'transition-transform duration-200 ease-out' // Match RF viewport open/close; off while seam-resizing
      )}
      style={{
        width: utilitySidebarWidth + UTILITY_RIGHT_GAP_PX, // Chrome width + right air so close matches top-bar open
        paddingRight: UTILITY_RIGHT_GAP_PX, // Pass-through; + header px-1.5 = 8px, same as mode-pill → close
        paddingBottom: bottomPad, // Brand disc when chat is closed; phone Ask/chrome floor when chat is open
        transform: shown ? 'translateX(0)' : 'translateX(100%)', // Slide off the right edge when closing (includes the gap)
      }}
      onTransitionEnd={onTransitionEnd}
      aria-hidden={!shown}
    >
      {shown ? <UtilitySidebarSeam /> : null}
      <header
        className={cn(
          'relative z-10 flex h-[52px] flex-shrink-0 items-center gap-0.5 px-1.5',
          shown ? 'pointer-events-auto' : 'pointer-events-none' // Pass through to the map while sliding off
        )}
      >
        {/* Mode tabs — left edge matches the content card (same px-1.5) */}
        <div className="flex min-w-0 flex-1 items-center">
          <div
            className="flex items-center gap-0.5 rounded-xl bg-[var(--nod-chat-prompt)] px-1 py-1 border border-black/10 dark:border-white/10 shadow-sm" // Same grey + hairline as Actions/Layout/Draw pill
            role="tablist"
            aria-label="Utility modes"
          >
            {MODE_TABS.map(({ id, label, icon: Icon }) => {
              const active = utilitySidebarMode === id // White chip when selected
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setUtilitySidebarMode(id)}
                  className={cn(
                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200',
                    active
                      ? 'bg-white shadow-sm text-gray-700 dark:bg-white dark:text-gray-300' // Match mode-pill selected chip fill + lift
                      : 'bg-transparent text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
                  )}
                  title={label}
                  aria-label={label}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              )
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setUtilitySidebarOpen(false)}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-black/10 bg-[var(--nod-chat-prompt)] text-gray-500 shadow-sm transition-colors hover:text-gray-900 dark:border-white/10 dark:text-gray-400 dark:hover:text-gray-100" // Same hairline as the mode pill next to it
          title="Hide sidebar"
          aria-label="Hide utility sidebar"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </header>

      {!hideUtilityBody ? (
      <div
        className={cn(
          'relative z-10 flex min-h-0 flex-1 flex-col px-1.5 pb-3', // pb-3 matches chat prompt bottom gap
          shown ? 'pointer-events-auto' : 'pointer-events-none' // Pass through to the map while sliding off
        )}
      >
        {/* Content card — same fill as Actions/Layout/Draw pill; tabs stay outside */}
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col rounded-xl border border-black/10 bg-[var(--nod-chat-prompt)] shadow-md dark:border-white/10 dark:shadow-black/40', // Same grey + hairline as the mode pill and hide button
            'overflow-hidden' // Search stays put; body scrolls inside
          )}
        >
          <UtilityModeBody mode={utilitySidebarMode} conversationId={conversationId} />
        </div>
      </div>
      ) : null}
    </aside>
  )
}
