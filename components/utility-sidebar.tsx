'use client'

// Transparent right utility overlay on the map — left of chat when both open; layers / study / capture

import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react' // Seam drag + hover tip
import { useParams } from 'next/navigation' // Board id for Capture panel
import { ChevronsRight, Layers, Scan, SquareStack } from 'lucide-react' // Mode icons + header close
import { cn } from '@/lib/utils' // Class merge
import { useSidebarContext, type UtilitySidebarMode } from './sidebar-context' // Open state + live width
import { LayersTouchingList } from './layers-touching-list' // Preview list of touching selection
import { CapturesPanel } from './captures-menu' // Capture list (same as View-bar menu)
import {
  UtilityFilterOption,
  UtilitySearchHeader,
} from './utility-search-header' // AI-chat-style search chrome

/** Clear the map brand chat toggle (42px + 8px inset + air) so Capture footer / lists don’t sit on it. */
const UTILITY_BRAND_CLEARANCE_PX = 64

/** Mode tab labels for the utility header strip. */
const MODE_TABS: { id: UtilitySidebarMode; label: string; icon: typeof Layers }[] = [
  { id: 'layers', label: 'Layers', icon: Layers }, // Default — frame stacking order
  { id: 'flashcards', label: 'Study', icon: SquareStack }, // Flashcard study — build later
  { id: 'capture', label: 'Capture', icon: Scan }, // Board captures — utility Capture tab
]

/**
 * Left-edge divider — same Notion-style Close/Resize as chat (click closes, drag resizes).
 * No thread-gap punches (utility has no chat↔board threads).
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

/** Mode body — layers list, study stub, or embedded captures panel. */
function UtilityModeBody({
  mode,
  conversationId,
}: {
  mode: UtilitySidebarMode
  conversationId?: string
}) {
  if (mode === 'layers') {
    return <LayersTouchingList />
  }
  if (mode === 'flashcards') {
    return <StudyUtilityStub />
  }
  return <CapturesPanel conversationId={conversationId} variant="sidebar" />
}

/** Study tab shell — same search chrome; study controls later. */
function StudyUtilityStub() {
  const [query, setQuery] = useState('') // Search field (filters later)
  const [filterOpen, setFilterOpen] = useState(false) // Filter menu
  const [scope, setScope] = useState<'all' | 'due'>('all') // Stub filter: all vs due

  return (
    <div className="flex h-full min-h-0 flex-col">
      <UtilitySearchHeader
        query={query}
        onQueryChange={setQuery}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        filterActive={scope === 'due'}
        filterTitle="Filter study"
        filterMenu={
          <>
            <UtilityFilterOption
              label="All cards"
              active={scope === 'all'}
              onSelect={() => {
                setScope('all')
                setFilterOpen(false)
              }}
            />
            <UtilityFilterOption
              label="Due for review"
              active={scope === 'due'}
              onSelect={() => {
                setScope('due')
                setFilterOpen(false)
              }}
            />
          </>
        }
      />
      <div className="flex flex-col gap-1 px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
        <p className="font-medium text-gray-700 dark:text-gray-200">Study</p>
        <p className="leading-relaxed">Flashcard study controls will live here.</p>
      </div>
    </div>
  )
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
  } = useSidebarContext()
  const params = useParams<{ conversationId?: string }>() // Board id when on /board/{id}
  const conversationId =
    typeof params?.conversationId === 'string' ? params.conversationId : undefined
  // Brand mark only mounts while chat is closed — clear it then; full height when chat owns the right
  const clearBrand = !isChatSidebarOpen

  if (isMobileMode || !isUtilitySidebarOpen) return null // Phone: no column; desktop closed: unmount

  return (
    <aside
      data-utility-sidebar
      className={cn(
        'pointer-events-none absolute inset-y-0 right-0 z-20 flex flex-col', // Empty / brand clearance pass through to map + chat icon
        'bg-transparent' // Board paints through; chrome is tabs / list only
      )}
      style={{
        width: utilitySidebarWidth, // Live width from seam drag
        paddingBottom: clearBrand ? UTILITY_BRAND_CLEARANCE_PX : 0, // Only pad when the map brand mark is showing
      }}
    >
      <UtilitySidebarSeam />
      <header className="pointer-events-auto relative z-10 flex h-[52px] flex-shrink-0 items-center gap-0.5 px-1.5">
        {/* Mode tabs — left edge matches the content card (same px-1.5) */}
        <div className="flex min-w-0 flex-1 items-center">
          <div
            className="flex items-center gap-0.5 rounded-xl bg-[#f7f8f9] px-1 py-1 shadow-sm dark:bg-[#1c1c24]"
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
                      ? 'bg-white text-gray-700 dark:bg-white dark:text-gray-300' // Match selected chip fill
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
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[#f7f8f9] text-gray-500 shadow-sm transition-colors hover:text-gray-900 dark:bg-[#1c1c24] dark:text-gray-400 dark:hover:text-gray-100" // h-9 = mode pill (py-1 + h-7)
          title="Hide sidebar"
          aria-label="Hide utility sidebar"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </header>

      <div className="pointer-events-auto relative z-10 flex min-h-0 flex-1 flex-col px-1.5 pb-1.5">
        {/* Content card — same fill as Actions/Layout/Draw pill; tabs stay outside */}
        <div
          className={cn(
            'flex min-h-0 flex-1 flex-col rounded-xl bg-[#f7f8f9] shadow-md dark:bg-[#1c1c24] dark:shadow-black/40', // Same grey as mode toggle shell — no border
            'overflow-hidden' // Search stays put; body scrolls inside
          )}
        >
          <UtilityModeBody mode={utilitySidebarMode} conversationId={conversationId} />
        </div>
      </div>
    </aside>
  )
}
