'use client'

// Transparent right utility overlay on the map — left of chat when both open; layers / sets / views / comments / templates / changes

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react' // Seam drag + hover tip + menu dismiss
import { useParams } from 'next/navigation' // Board id for Capture / Templates panels
import { ChevronDown, ChevronsRight, History, Layers, LayoutTemplate, MessageSquare, Scan, SquareStack, type LucideIcon } from 'lucide-react' // Mode icons + dropdown + header close
import { cn } from '@/lib/utils' // Class merge
import { useSidebarContext, UTILITY_RIGHT_GAP_PX, UTILITY_SIDEBAR_WIDTH, type UtilitySidebarMode } from './sidebar-context' // Open state + live width + right air gap + min chrome
import {
  SIDEBAR_OPEN_CLOSE_MS,
  useOpenClosePresence,
} from '@/lib/hooks/use-open-close-presence' // Keep overlay mounted through open/close slide
import { LayersTouchingList } from './layers-touching-list' // Preview list of touching selection
import { SetsList } from './sets-list' // Snapshots added from frame / block / text menus
import { CapturesPanel } from './captures-menu' // Capture list (same as View-bar menu)
import { CommentsPanel } from './comments-menu' // Board comments (between Views and Templates)
import { TemplatesPanel } from './templates-menu' // All approved + Submissions pending review
import { ChangesPanel } from './changes-menu' // Change history — last menu in the dropdown

/** Clear the map brand chat toggle (42px + 8px inset + air) so Capture footer / lists don’t sit on it. */
const UTILITY_BRAND_CLEARANCE_PX = 64

/** Header / body share `px-1.5` (6×2) — toggle shell matches the body card at the min chrome width. */
const UTILITY_TOGGLE_SHELL_WIDTH_PX = UTILITY_SIDEBAR_WIDTH - 12

/** Dropdown rows — same icons as the old icon tabs, plus the menu name. */
const MODE_TABS: { id: UtilitySidebarMode; label: string; icon: LucideIcon }[] = [
  { id: 'layers', label: 'Layers', icon: Layers }, // Default — frame stacking order
  { id: 'flashcards', label: 'Sets', icon: SquareStack }, // Snapshots added from menus (stored mode id stays flashcards)
  { id: 'capture', label: 'Views', icon: Scan }, // Board views — utility Views tab (mode id stays capture)
  { id: 'comments', label: 'Comments', icon: MessageSquare }, // Between Views (captures) and Templates
  { id: 'templates', label: 'Templates', icon: LayoutTemplate }, // Public templates — same as Create public template
  { id: 'changes', label: 'Changes', icon: History }, // Change history — last row
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

/** Mode body — layers, sets, views, comments, templates, or changes. */
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
    return <SetsList conversationId={conversationId} /> // Sets tab — All boards, or only this board
  }
  if (mode === 'comments') {
    return <CommentsPanel conversationId={conversationId} /> // Between Views and Templates
  }
  if (mode === 'templates') {
    return <TemplatesPanel conversationId={conversationId} /> // All approved + Submissions
  }
  if (mode === 'changes') {
    return <ChangesPanel conversationId={conversationId} /> // Last dropdown row
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
    chatFitPhone,
    isChatSidebarOpen,
    aiMapDockLiftPx,
    aiMapDockComposerLiftPx,
    aiKeyboardOpen,
  } = useSidebarContext()
  const params = useParams<{ conversationId?: string }>() // Board id when on /board/{id}
  const conversationId =
    typeof params?.conversationId === 'string' ? params.conversationId : undefined
  // Same dock gate as Free nav / chat — fit can map-dock chat before the phone breakpoint
  const useChatMapDock = isMobileMode || chatFitPhone
  // Brand mark only mounts while chat is closed — clear it then; full height when chat owns the right
  const clearBrand = !isChatSidebarOpen
  // Map-docked + keyboard: keep the mode dropdown, hide the grey body until the keyboard drops
  const hideUtilityBody = useChatMapDock && aiKeyboardOpen
  const currentTab = MODE_TABS.find((tab) => tab.id === utilitySidebarMode) ?? MODE_TABS[0] // Icon + name on the trigger
  const CurrentIcon = currentTab.icon // Same glyph as the selected dropdown row
  const [modeOpen, setModeOpen] = useState(false) // Name dropdown under the toggle bar
  const toggleRef = useRef<HTMLDivElement>(null) // Click-away + Escape close

  useEffect(() => {
    if (!modeOpen) return // Nothing to dismiss
    const onDoc = (e: Event) => {
      if (toggleRef.current?.contains(e.target as Node)) return // Click stayed on the bar / menu
      setModeOpen(false) // Outside → close
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModeOpen(false) // Same as other menus
    }
    document.addEventListener('pointerdown', onDoc) // Board / chrome click
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [modeOpen])
  const composerPad = aiMapDockComposerLiftPx || aiMapDockLiftPx // Empty-chat floor (chrome + Ask + keyboard)
  const bottomPad =
    useChatMapDock && isChatSidebarOpen
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
        useChatMapDock ? 'z-[46]' : 'z-20', // Map dock: above chat (z-45) so the body can overlap the transcript
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
          'relative z-20 flex h-[52px] flex-shrink-0 items-center justify-end overflow-visible px-1.5 pointer-events-none' // Above the body so the dropdown paints over the card; left strip stays pass-through
        )}
      >
        {/* Modes left + close right — dropdown hangs from this bar (no Radix portal) */}
        <div
          ref={toggleRef}
          className={cn(
            'relative flex flex-shrink-0 items-center justify-between rounded-xl border border-black/10 bg-[var(--nod-chat-prompt)] px-1 py-1 shadow-sm dark:border-white/10', // Same grey + hairline as the utility body
            shown ? 'pointer-events-auto' : 'pointer-events-none' // Only this control captures clicks
          )}
          style={{ width: UTILITY_TOGGLE_SHELL_WIDTH_PX }} // Same as the body card at UTILITY_SIDEBAR_WIDTH
        >
          <div className="relative min-w-0"> {/* Chip hugs its label — leftover bar width stays between chip and divider */}
            <button
              type="button"
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-lg bg-[var(--nod-chat-prompt)] px-2.5 text-sm font-medium text-gray-700 hover:bg-[var(--nod-on-chrome)] dark:text-gray-300', // Hug icon + name + chevron; even px like the old icon tabs
                modeOpen && 'bg-[var(--nod-on-chrome)]' // Open = selected wash
              )}
              aria-label="Utility menu"
              aria-expanded={modeOpen}
              onClick={() => setModeOpen((open) => !open)} // Toggle the list under this bar
            >
              <CurrentIcon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="whitespace-nowrap">{currentTab.label}</span>
              <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
            </button>
            {modeOpen ? (
              <div className="absolute left-0 top-[calc(100%+5px)] z-50 flex min-w-full flex-col gap-0.5 rounded-xl border border-black/10 bg-[var(--nod-chat-prompt)] p-1 shadow-md dark:border-white/10"> {/* At least as wide as the chip; p-1 matches the bar inset */}
                {MODE_TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={cn(
                      'inline-flex h-7 w-full min-w-0 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-gray-700 hover:bg-[var(--nod-on-chrome)] dark:text-gray-300', // Same rounded chip as the selected toggle button
                      id === utilitySidebarMode && 'bg-[var(--nod-on-chrome)]' // Current menu
                    )}
                    onClick={() => {
                      setUtilitySidebarMode(id) // Switch the utility body
                      setModeOpen(false) // Close after pick
                    }}
                  >
                    <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5">
            <div
              className="mx-0.5 h-5 w-px flex-shrink-0 bg-black/10 dark:bg-white/10"
              aria-hidden
            />
            <button
              type="button"
              onClick={() => setUtilitySidebarOpen(false)}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-[var(--nod-on-chrome)] hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              title="Hide sidebar"
              aria-label="Hide utility sidebar"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
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
            'flex min-h-0 flex-1 flex-col rounded-xl border border-black/10 bg-[var(--nod-chat-prompt)] shadow-md dark:border-white/10 dark:shadow-black/40' // Same grey + hairline as the mode pill and hide button — no overflow clip so filter menus can hang past the card edge; lists scroll via .utility-body-scroll
          )}
        >
          <UtilityModeBody mode={utilitySidebarMode} conversationId={conversationId} />
        </div>
      </div>
      ) : null}
    </aside>
  )
}
