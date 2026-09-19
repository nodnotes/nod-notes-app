'use client'

// Capture list — utility-sidebar Views tab (reorder + insert gaps, same as old Present)

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation' // Present navigates to the first capture's board
import { useQueryClient } from '@tanstack/react-query' // Board path + frame text
import {
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core' // Capture reorder + drop under a presentation header
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable' // Vertical list + slide transitions
import { CSS } from '@dnd-kit/utilities' // Translate while dragging
import {
  ListFilter, // Filter control (dropdown menu chrome)
  List, // In one list
  MessageSquare, // Add to chat — chat mark
  Plus, // Insert capture between rows
  Presentation, // New presentation + section header
  Scan, // Capture view (4 disconnected rounded corners)
  MoreHorizontal, // Presentation header ⋯
  Pencil, // Rename presentation
  Play, // Present
  Search, // Search field glyph (non-sidebar layout)
  Trash2, // Delete presentation
} from 'lucide-react'
import {
  UtilityFilterDivider,
  UtilityFilterOption,
  UtilitySearchHeader,
} from '@/components/utility-search-header' // Sidebar: AI-chat-style search
import { useReactFlowContext } from '@/components/react-flow-context' // Current viewport
import { useSidebarContext } from '@/components/sidebar-context' // Open chat on add-to-chat
import {
  attachCapturesToChat,
  createPresentation,
  deletePresentation,
  filterCaptures,
  formatCaptureTimestamp,
  getCaptures,
  getPresentations,
  insertCaptureIntoPresentation,
  insertUngroupedCaptureAt,
  moveCaptureUnderPresentation,
  readCaptureCameraInput,
  renamePresentation,
  setCaptureOrder,
  setPresentationCaptureOrder,
  setPresentationCollapsed,
  setUngroupedCaptureOrder,
  subscribeCaptures,
  takeBoardCapture,
  type BoardCapture,
  type BoardPresentation,
} from '@/lib/captures' // Local capture/presentation store
import { cn } from '@/lib/utils' // Class merge
import { navigateToCapture } from '@/lib/capture-link' // Present starts on the first capture's camera
import { startPresenting } from '@/lib/presentation-present' // Hide menus while presenting
import { CaptureRowMoreMenu } from './capture-row-more-menu' // Row hover ⋯ — go to / copy link
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** How the Capture list is arranged. By presentation is the default. */
type PresentationOrganize = 'list' | 'presentation'

/** Shared ⋯ chrome — same as the Layers Add group row. */
const presentationMoreButtonClass =
  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-black/[0.06] hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-200 [@media(hover:hover)]:opacity-0 data-[state=open]:opacity-100'

type CapturesPanelProps = {
  conversationId?: string // Current board — Capture view + this-board filter
  variant?: 'popover' | 'sidebar' // Popover = fixed width; sidebar = fill utility column
  onRequestClose?: () => void // Popover: dismiss after navigate / add-to-chat
}

/** Icon-only Add to chat: chat mark, small add mark in the corner. */
function AddToChatIcon() {
  return (
    <span className="relative block h-4 w-4 flex-shrink-0">
      <MessageSquare className="h-4 w-4" /> {/* Chat */}
      <Plus className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full bg-[var(--nod-chat-prompt)]" /> {/* Small add, knocked out of the bubble */}
    </span>
  )
}

/** Hairline between captures: + takes a new capture and inserts at this index. */
function InsertGap({ onAdd, disabled }: { onAdd: () => void; disabled?: boolean }) {
  return (
    <div className="relative flex h-5 items-center justify-center">
      <div className="absolute inset-x-4 h-px bg-gray-200 dark:bg-white/10" /> {/* Gap line */}
      <button
        type="button"
        className={cn(
          'relative z-[1] flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-800 dark:border-white/15 dark:bg-[#1a1a1a] dark:text-gray-400 dark:hover:bg-white/[0.06] dark:hover:text-gray-100',
          disabled && 'pointer-events-none opacity-40'
        )}
        aria-label="Capture view and insert here"
        disabled={disabled}
        onPointerDown={(e) => e.preventDefault()}
        onClick={onAdd}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}

/** One capture thumb — drag to reorder (neighbors slide); click selects; double-click expands. */
function SortableCaptureRow({
  capture,
  index,
  selected,
  conversationId,
  canReorder,
  showGaps = true,
  onToggle,
  onPreview,
  onAddAt,
  onNavigate,
}: {
  capture: BoardCapture
  index: number
  selected: boolean
  conversationId?: string
  canReorder: boolean // Off while search/filter is active
  showGaps?: boolean // List mode is flat thumbs — no + insert gaps
  onToggle: (id: string) => void
  onPreview: (id: string) => void
  onAddAt: (index: number) => void
  onNavigate?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: capture.id,
    disabled: !canReorder,
  })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform), // Move only — scale would shrink the thumb
    transition: transition || 'transform 200ms ease', // Slide neighbors into place
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.85 : 1,
  }
  const stamp = formatCaptureTimestamp(capture.createdAt) // Title / a11y only

  return (
    <div ref={setNodeRef} style={style} className="group/capture flex w-full shrink-0 flex-col">
      {canReorder && showGaps && <InsertGap onAdd={() => onAddAt(index)} />}
      <div className="relative">
        <button
          type="button"
          className={cn(
            'w-full text-left',
            canReorder && 'cursor-grab active:cursor-grabbing'
          )}
          title={canReorder ? `${stamp} — drag to reorder` : stamp}
          aria-label={selected ? `Deselect capture ${stamp}` : `Select capture ${stamp}`}
          {...(canReorder ? { ...attributes, ...listeners } : {})}
          aria-pressed={selected} // After dnd-kit attrs so selected wins (sortable also sets aria-pressed)
          onClick={() => onToggle(capture.id)}
          onDoubleClick={() => {
            if (capture.imageDataUrl) onPreview(capture.id)
          }}
        >
          <div
            className={cn(
              'relative aspect-[4/3] w-full overflow-hidden rounded-md bg-gray-50 dark:bg-[#1a1a1a]',
              selected
                ? 'border-2 border-blue-500'
                : 'border border-gray-200/80 dark:border-white/10'
            )}
          >
            {capture.imageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL
              <img
                src={capture.imageDataUrl}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-gray-300">
                <Scan className="h-4 w-4" />
              </span>
            )}
          </div>
        </button>
        <CaptureRowMoreMenu
          capture={capture}
          conversationId={conversationId}
          onNavigate={onNavigate}
          className={cn(
            'absolute right-0.5 top-0.5 z-10 bg-white/90 shadow-sm dark:bg-[#1a1a1a]/90',
            'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/capture:opacity-100'
          )}
        />
      </div>
    </div>
  )
}

/** Loose list id — captures that are not under a presentation header. */
const UNGROUPED_SECTION = 'ungrouped'

/** One visual section: a presentation header, or the loose list under all headers. */
type CaptureSectionModel = {
  id: string
  presentation: BoardPresentation | null
  captures: BoardCapture[]
}

/** Prefer the row under the pointer; fall back to closest center for gaps. */
const captureCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args) // Header / empty zone / thumb the pointer is inside
  if (hits.length > 0) return hits
  return closestCenter(args)
}

/** Which section a capture currently renders in. */
function findCaptureSection(captureId: string, sections: CaptureSectionModel[]) {
  for (const section of sections) {
    const index = section.captures.findIndex((c) => c.id === captureId) // Visible index under that header
    if (index >= 0) return { sectionId: section.id, index, ids: section.captures.map((c) => c.id) }
  }
  return null
}

/** Map a droppable id (header, empty zone, trailing gap, or capture) to a section index. */
function resolveDropTarget(overId: string, sections: CaptureSectionModel[]) {
  const prefixed = /^(header|section|end):([\s\S]+)$/.exec(overId) // Synthetic ids, not capture UUIDs
  if (prefixed) {
    const sectionId = prefixed[2]
    const section = sections.find((s) => s.id === sectionId)
    if (!section) return null
    if (prefixed[1] === 'end') return { sectionId, index: section.captures.length } // After the last thumb
    return { sectionId, index: 0 } // Header or empty zone → first slot under the header
  }
  const hit = findCaptureSection(overId, sections)
  if (!hit) return null
  return { sectionId: hit.sectionId, index: hit.index }
}

/** Empty presentation — full-width add/drop row. No label = quiet drop-out for loose captures. */
function EmptySectionDrop({
  id,
  label,
  onAdd,
  disabled,
}: {
  id: string
  label?: string // Shown copy; omitted for the unlabeled loose drop
  onAdd?: () => void // Click captures a view into this presentation
  disabled?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${id}` }) // Drop → index 0
  if (!label) {
    return (
      <div
        ref={setNodeRef}
        className={cn('min-h-2', isOver && 'rounded-md bg-blue-500/10')} // Hit area only; no header
      />
    )
  }
  return (
    <button
      type="button"
      ref={setNodeRef}
      disabled={disabled}
      className={cn(
        '-ml-1.5 -mr-2 flex min-h-8 w-[calc(100%+0.375rem+0.5rem)] items-center px-3 text-left text-[13px] text-gray-400', // Menu-wide; cancels the list’s pl-1.5 / pr-2
        'hover:bg-black/[0.04] disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-white/[0.06]',
        isOver && 'bg-blue-500/10 text-blue-600' // Drop highlight, still no border
      )}
      onPointerDown={(e) => e.preventDefault()} // Keep the utility menu from stealing the click
      onClick={onAdd}
    >
      {label}
    </button>
  )
}

/** Trailing gap is also a drop target so a capture can land at the end of a section. */
function TrailingDrop({ sectionId, children }: { sectionId: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `end:${sectionId}` }) // Drop → append
  return (
    <div ref={setNodeRef} className={cn('rounded-md', isOver && 'bg-blue-500/10')}>
      {children}
    </div>
  )
}

/** Presentation glyph. Closed box with text lines; the stand shows only while open. */
function PresentationIcon({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="4" y="3" width="16" height="11" rx="2" /> {/* Screen; top stroke matches the bottom, no rail */}
      <path d="M7 7h8" /> {/* Title line, inset from the frame */}
      <path d="M7 10h5" /> {/* Body line */}
      {collapsed ? null : <path d="m7 20 5-6 5 6" />} {/* Stand; hidden when closed */}
    </svg>
  )
}

/** Presentation name row — click collapses like a group; drop on it to put a capture first. */
function PresentationHeader({
  presentation,
  renaming,
  canPresent,
  onRenameStart,
  onRenameEnd,
  onPresent,
  onDelete,
}: {
  presentation: BoardPresentation
  renaming: boolean
  canPresent: boolean // Needs at least one capture under the header
  onRenameStart: () => void
  onRenameEnd: () => void
  onPresent: () => void
  onDelete: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `header:${presentation.id}` }) // Drop → index 0
  const skipBlur = useRef(false) // Escape blur must not save the in-progress edit
  const collapsed = !!presentation.collapsed // Closed hides the captures

  useEffect(() => {
    if (!renaming) return
    document.getElementById(`presentation-header-${presentation.id}`)?.scrollIntoView({ block: 'nearest' })
  }, [renaming, presentation.id])

  return (
    <div
      ref={setNodeRef}
      id={`presentation-header-${presentation.id}`}
      className={cn(
        'relative mt-0.5 flex h-7 items-center gap-1.5 rounded-md pl-1.5',
        isOver && 'bg-blue-500/10'
      )}
    >
      {renaming ? (
        <>
          <PresentationIcon className="h-4 w-4 flex-shrink-0 text-gray-800 dark:text-gray-200" collapsed={collapsed} />
          <input
            autoFocus // New header opens ready to name
            defaultValue={presentation.name}
            aria-label="Presentation name"
            className="min-w-0 flex-1 bg-transparent text-xs text-gray-900 outline-none dark:text-gray-100"
            onFocus={(e) => e.currentTarget.select()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()} // Don't start another rename while naming
            onKeyDown={(e) => {
              e.stopPropagation() // Don't let the board steal Enter / Escape
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                skipBlur.current = true
                e.currentTarget.blur()
              }
            }}
            onBlur={(e) => {
              if (!skipBlur.current) renamePresentation(presentation.id, e.currentTarget.value)
              skipBlur.current = false
              onRenameEnd()
            }}
          />
        </>
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-gray-800 dark:text-gray-200"
          title={collapsed ? 'Expand presentation' : 'Collapse presentation'}
          aria-label={collapsed ? 'Expand presentation' : 'Collapse presentation'}
          aria-expanded={!collapsed}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            if (renaming) return // The name field owns the click while it is open
            setPresentationCollapsed(presentation.id, !collapsed)
          }}
          onDoubleClick={onRenameStart} // A double-click's two clicks cancel, so collapse stays put
        >
          <PresentationIcon className="h-4 w-4 flex-shrink-0" collapsed={collapsed} /> {/* Stand hidden when closed */}
          <span className="min-w-0 flex-1 truncate text-xs text-gray-900 dark:text-gray-100">{presentation.name}</span>
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(presentationMoreButtonClass, '[@media(hover:hover)]:group-hover/presentation:opacity-100')}
            title="Presentation options"
            aria-label={`${presentation.name} options`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-40"
          onClick={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => e.preventDefault()} // Leave focus for the name field, not the ⋯ button
        >
          <DropdownMenuItem onSelect={onRenameStart}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canPresent} onSelect={onPresent}>
            <Play className="mr-2 h-4 w-4" />
            Present
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
            onSelect={onDelete}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Captures list body — utility Views tab (reorder + + insert). */
export function CapturesPanel({
  conversationId,
  variant = 'popover',
  onRequestClose,
}: CapturesPanelProps) {
  const queryClient = useQueryClient() // Path + messages cache
  const router = useRouter() // Present may open another board
  const { reactFlowInstance } = useReactFlowContext() // Viewport at Capture view
  const { setChatSidebarOpen } = useSidebarContext() // Reveal chat when attaching
  const captures = useSyncExternalStore(subscribeCaptures, getCaptures, getCaptures) // List
  const presentations = useSyncExternalStore(subscribeCaptures, getPresentations, getPresentations)
  const [query, setQuery] = useState('') // Search: board / date / words
  const [thisBoardOnly, setThisBoardOnly] = useState(false) // Filter: this board vs all
  const [filterOpen, setFilterOpen] = useState(false) // Filter panel
  const [selected, setSelected] = useState<Set<string>>(() => new Set()) // Row selection
  const [previewId, setPreviewId] = useState<string | null>(null) // Expanded JPEG overlay
  const [capturing, setCapturing] = useState(false) // Capture view in flight
  const [renamingId, setRenamingId] = useState<string | null>(null) // Header whose name is being edited
  const [organize, setOrganize] = useState<PresentationOrganize>('presentation') // Filter menu: one list, or headers
  const [plusOpen, setPlusOpen] = useState(false) // + menu: New presentation / Add to presentation / Add to chat
  const plusRef = useRef<HTMLDivElement>(null) // + button and its menu, so outside clicks can close it
  const sidebar = variant === 'sidebar' // Narrow column layout

  useEffect(() => {
    if (!plusOpen) return // Listener only while the + menu is up
    const onDown = (event: PointerEvent) => {
      if (plusRef.current?.contains(event.target as globalThis.Node)) return // Keep clicks on the menu itself
      setPlusOpen(false) // Click outside the + closes New presentation / Add to presentation / Add to chat
    }
    window.addEventListener('pointerdown', onDown, true) // Capture so the board does not eat the click first
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [plusOpen])

  const items = useMemo(
    () =>
      filterCaptures(captures, query, {
        boardId: conversationId,
        thisBoardOnly: thisBoardOnly && Boolean(conversationId),
      }),
    [captures, query, conversationId, thisBoardOnly]
  )

  // Reorder / + gaps only on the full unfiltered list (order is per section)
  const canReorder = !query.trim() && !thisBoardOnly

  const sections = useMemo(() => {
    const byId = new Map(items.map((c) => [c.id, c])) // Visible captures only
    const claimed = new Set<string>() // A capture renders under its first header
    const grouped: CaptureSectionModel[] = []
    const nameQuery = query.trim().toLowerCase()
    for (const presentation of presentations) {
      const rows: BoardCapture[] = []
      for (const id of presentation.captureIds) {
        if (claimed.has(id)) continue
        const row = byId.get(id)
        if (!row) continue // Filtered out, or deleted
        claimed.add(id)
        rows.push(row)
      }
      const nameHit = Boolean(nameQuery) && presentation.name.toLowerCase().includes(nameQuery)
      if (!canReorder && rows.length === 0 && !nameHit) continue // Hide empty headers while searching
      grouped.push({ id: presentation.id, presentation, captures: rows })
    }
    const memberIds = new Set(presentations.flatMap((p) => p.captureIds))
    const ungrouped = items.filter((c) => !memberIds.has(c.id)) // Not under any header
    const loose: CaptureSectionModel = { id: UNGROUPED_SECTION, presentation: null, captures: ungrouped }
    return { grouped, all: [...grouped, loose] }
  }, [items, presentations, canReorder, query])

  const hasSelection = selected.size > 0
  const previewItem = previewId ? items.find((c) => c.id === previewId) : undefined

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }) // Click selects; drag reorders
  )

  const captureAt = async (index: number | null, presentationId: string | null = null) => {
    if (!conversationId || capturing) return
    setCapturing(true)
    try {
      const vp = reactFlowInstance?.getViewport() || { x: 0, y: 0, zoom: 1 }
      const created = await takeBoardCapture(
        (key) => queryClient.getQueryData(key),
        conversationId,
        readCaptureCameraInput(vp)
      )
      if (canReorder && presentationId) {
        insertCaptureIntoPresentation(presentationId, created.id, index ?? 0) // Land under that header
      } else if (canReorder && index !== null) {
        insertUngroupedCaptureAt(created, index) // Land in the loose list at the + gap
      }
      setSelected((prev) => new Set(prev).add(created.id))
    } finally {
      setCapturing(false)
    }
  }

  const onNewPresentation = () => {
    setOrganize('presentation') // The new header only shows under By presentation
    const created = createPresentation([]) // Empty header at the top of the list
    setRenamingId(created.id) // Name it immediately
  }

  const onAddToPresentation = () => {
    const ids = items.filter((c) => selected.has(c.id)).map((c) => c.id) // Visual order, not click order
    if (ids.length === 0) return // Disabled until a capture is selected
    setOrganize('presentation') // The new header only shows under By presentation
    const created = createPresentation([]) // Empty header, then the selection moves in
    ids.forEach((id, index) => {
      moveCaptureUnderPresentation(id, created.id, index) // Exclusive — leaves any other presentation
    })
    setRenamingId(created.id) // Name it immediately
  }

  const presentPresentation = (presentation: BoardPresentation) => {
    const byId = new Map(captures.map((c) => [c.id, c]))
    const first = presentation.captureIds
      .map((id) => byId.get(id))
      .find((c): c is BoardCapture => Boolean(c)) // First capture that still exists
    if (!first) return
    startPresenting() // Hide menus before the camera move
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        navigateToCapture(first, conversationId, router) // Land on that capture's view
      })
    })
  }

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedIds = () => [...selected]

  const onAddToChat = () => {
    if (!hasSelection) return // Disabled until a capture is selected
    attachCapturesToChat(selectedIds()) // Selected captures become composer pills
    setChatSidebarOpen(true) // Reveal chat so the pills are visible
    onRequestClose?.() // Popover dismisses; the utility column stays open
  }

  const onListDragEnd = (event: DragEndEvent) => {
    if (!canReorder) return // Search and This board stay put
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = items.map((item) => item.id) // Flat list, headers ignored
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    setCaptureOrder(arrayMove(ids, from, to))
  }

  const onDragEnd = (event: DragEndEvent) => {
    if (!canReorder) return
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return
    const from = findCaptureSection(activeId, sections.all)
    const to = resolveDropTarget(overId, sections.all)
    if (!from || !to) return
    if (from.sectionId === to.sectionId) {
      const newIndex = to.index >= from.ids.length ? from.ids.length - 1 : to.index // End-cap → last slot
      if (from.index < 0 || from.index === newIndex) return
      const next = arrayMove(from.ids, from.index, newIndex)
      if (from.sectionId === UNGROUPED_SECTION) setUngroupedCaptureOrder(next)
      else setPresentationCaptureOrder(from.sectionId, next)
      return
    }
    moveCaptureUnderPresentation(
      activeId,
      to.sectionId === UNGROUPED_SECTION ? null : to.sectionId,
      to.index
    )
    if (to.sectionId !== UNGROUPED_SECTION) {
      const target = getPresentations().find((p) => p.id === to.sectionId)
      if (target?.collapsed) setPresentationCollapsed(target.id, false) // A drop opens a closed presentation
    }
  }

  const loose = sections.all[sections.all.length - 1] // Captures not under a header
  const nothingToShow = sections.grouped.length === 0 && loose.captures.length === 0

  const renderSectionCaptures = (section: CaptureSectionModel) => {
    const inPresentation = Boolean(section.presentation) // + bars only between captures that belong to a presentation
    return (
      <>
        {section.captures.length === 0 && canReorder ? (
          <EmptySectionDrop
            id={section.id}
            label={inPresentation ? 'Add or drag captures' : undefined} // Loose list has no section title
            disabled={!conversationId || capturing}
            onAdd={
              inPresentation
                ? () => void captureAt(0, section.presentation?.id ?? null) // Add captures into this header
                : undefined
            }
          />
        ) : (
          <SortableContext items={section.captures.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {section.captures.map((item, index) => (
              <SortableCaptureRow
                key={item.id}
                capture={item}
                index={index}
                selected={selected.has(item.id)}
                conversationId={conversationId}
                canReorder={canReorder}
                showGaps={inPresentation && index > 0} // Between slides only — not before the first, not on loose captures
                onToggle={toggleRow}
                onPreview={setPreviewId}
                onAddAt={(i) => void captureAt(i, section.presentation?.id ?? null)}
                onNavigate={onRequestClose}
              />
            ))}
          </SortableContext>
        )}
        {canReorder && section.captures.length > 0 && (
          <TrailingDrop sectionId={section.id}>
            <div className="h-1" /> {/* End stays a drop target — no + bar after the last slide or on an empty presentation */}
          </TrailingDrop>
        )}
      </>
    )
  }

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden',
        sidebar ? 'h-full min-h-0' : 'w-full'
      )}
    >
      {sidebar ? (
        <>
          <UtilitySearchHeader
            query={query}
            onQueryChange={setQuery}
            filterOpen={filterOpen}
            onFilterOpenChange={setFilterOpen}
            filterActive={thisBoardOnly || organize !== 'presentation'} // Blue unless every board is showing by presentation
            filterTitle="Filter captures"
            filterMenu={
              <>
                <UtilityFilterOption
                  label="All boards"
                  active={!thisBoardOnly}
                  onSelect={() => {
                    setThisBoardOnly(false)
                    setFilterOpen(false)
                  }}
                />
                <UtilityFilterOption
                  label="This board"
                  active={thisBoardOnly}
                  disabled={!conversationId}
                  onSelect={() => {
                    if (!conversationId) return
                    setThisBoardOnly(true)
                    setFilterOpen(false)
                  }}
                />
                <UtilityFilterDivider /> {/* Organize used to live in the ⋯ menu */}
                <UtilityFilterOption
                  label="In one list"
                  icon={<List className="h-4 w-4 flex-shrink-0" />} // Same list mark the ⋯ row used
                  active={organize === 'list'}
                  onSelect={() => {
                    setOrganize('list') // Flat thumbs, no presentation headers
                    setFilterOpen(false)
                  }}
                />
                <UtilityFilterOption
                  label="By presentation"
                  icon={<Presentation className="h-4 w-4 flex-shrink-0" />} // Same presentation mark the ⋯ row used
                  active={organize === 'presentation'}
                  onSelect={() => {
                    setOrganize('presentation') // Headers
                    setFilterOpen(false)
                  }}
                />
              </>
            }
          />
          <div className="flex h-8 flex-shrink-0 items-center gap-1 px-1.5 pt-2">
            <div ref={plusRef} className="relative flex-shrink-0"> {/* Top left — same + menu as Layers */}
              <button
                type="button"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-black/[0.06] hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100',
                  plusOpen && 'bg-black/[0.06] text-gray-900 dark:bg-white/[0.08] dark:text-gray-100' // Stay marked while the menu is open
                )}
                title="Add"
                aria-label="New presentation, add to presentation, or add to chat"
                aria-expanded={plusOpen}
                aria-haspopup="menu"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setPlusOpen((open) => !open)}
              >
                <Plus className="h-4 w-4" /> {/* Opens New presentation, Add to presentation, and Add to chat */}
              </button>
              {plusOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-50 mt-0.5 min-w-[12.5rem] overflow-hidden rounded-md border border-gray-200 bg-[var(--nod-chat-prompt)] py-1 shadow-md dark:border-[#2f2f2f]" // Same chrome grey as the utility body
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm text-gray-900 hover:bg-[var(--nod-on-chrome)] dark:text-gray-100"
                    title="New presentation"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onNewPresentation() // Empty header, named immediately
                      setPlusOpen(false)
                    }}
                  >
                    <Plus className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">New presentation</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm text-gray-900 hover:bg-[var(--nod-on-chrome)] disabled:opacity-40 dark:text-gray-100"
                    title="Add to presentation"
                    disabled={!hasSelection} // Needs a selected capture
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onAddToPresentation() // Selected captures into a new header
                      setPlusOpen(false)
                    }}
                  >
                    <PresentationIcon className="h-4 w-4 flex-shrink-0" /> {/* Same mark as the header */}
                    <span className="flex-1">Add to presentation</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm text-gray-900 hover:bg-[var(--nod-on-chrome)] disabled:opacity-40 dark:text-gray-100"
                    title="Add to chat"
                    disabled={!hasSelection} // Needs a selected capture
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onAddToChat() // Selected captures become composer pills, then chat opens
                      setPlusOpen(false)
                    }}
                  >
                    <AddToChatIcon /> {/* Same chat-plus mark Layers uses */}
                    <span className="flex-1">Add to chat</span>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="ml-auto flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-black/[0.06] hover:text-gray-900 disabled:opacity-40 dark:text-gray-400 dark:hover:bg-white/[0.08] dark:hover:text-gray-100"
              title="Capture view"
              aria-label="Capture view"
              disabled={!conversationId || capturing} // Needs a board, and not a capture already in flight
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => void captureAt(null)} // Snapshot the current view
            >
              <Scan className="h-4 w-4" /> {/* Far right of the + — words don't fit this column */}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-shrink-0 items-center gap-1 px-2 pb-1.5 pt-2">
          <div className="relative flex-shrink-0">
            <button
              type="button"
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.06]',
                (filterOpen || thisBoardOnly) &&
                  'bg-gray-100 text-gray-900 dark:bg-white/[0.08] dark:text-gray-100'
              )}
              title="Filter"
              aria-label="Filter"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => setFilterOpen((v) => !v)}
            >
              <ListFilter className="h-4 w-4" />
            </button>
            {filterOpen && (
              <div className="absolute left-0 top-full z-10 mt-1 w-40 rounded-md border border-gray-200 bg-white py-1 shadow-md dark:border-white/10 dark:bg-[#1a1a1a]">
                <button
                  type="button"
                  className={cn(
                    'flex w-full px-2.5 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/[0.06]',
                    !thisBoardOnly && 'font-medium text-gray-900 dark:text-gray-100'
                  )}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setThisBoardOnly(false)
                    setFilterOpen(false)
                  }}
                >
                  All boards
                </button>
                <button
                  type="button"
                  className={cn(
                    'flex w-full px-2.5 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/[0.06]',
                    thisBoardOnly && 'font-medium text-gray-900 dark:text-gray-100',
                    !conversationId && 'opacity-40'
                  )}
                  disabled={!conversationId}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!conversationId) return
                    setThisBoardOnly(true)
                    setFilterOpen(false)
                  }}
                >
                  This board
                </button>
              </div>
            )}
          </div>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search captures..."
              className="h-8 w-full rounded-md border border-gray-200 bg-white pl-7 pr-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-gray-300 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-gray-100 dark:placeholder:text-gray-500"
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <button
            type="button"
            className="flex h-8 flex-shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/[0.06]"
            title="Capture view"
            aria-label="Capture view"
            disabled={!conversationId || capturing}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => void captureAt(null)}
          >
            Capture view
            <Scan className="h-3.5 w-3.5" /> {/* Just right of the words */}
          </button>
          <button
            type="button"
            className={cn(
              'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/[0.06]',
              !hasSelection && 'pointer-events-none' // Stay visible but inert until a row is selected
            )}
            title="Add to chat"
            aria-label="Add to chat"
            disabled={!hasSelection}
            onPointerDown={(e) => e.preventDefault()}
            onClick={onAddToChat}
          >
            <AddToChatIcon /> {/* Far right of Capture view — icon only */}
          </button>
        </div>
      )}

      <div
        className={cn(
          'utility-body-scroll relative min-h-0 pl-1.5 pr-2 pb-1', /* Not a flex column — that compresses thumbs while reordering */
          sidebar ? 'flex-1' : 'max-h-72'
        )}
      >
        {nothingToShow ? (
          <div className="px-1 py-8 text-center text-xs text-gray-400">
            {captures.length === 0 ? 'No captures yet' : 'No captures match'}
          </div>
        ) : organize === 'list' ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onListDragEnd}>
            <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {items.map((item, index) => (
                <SortableCaptureRow
                  key={item.id}
                  capture={item}
                  index={index}
                  selected={selected.has(item.id)}
                  conversationId={conversationId}
                  canReorder={canReorder}
                  showGaps={false} // Flat list — no + gaps between thumbs
                  onToggle={toggleRow}
                  onPreview={setPreviewId}
                  onAddAt={() => undefined}
                  onNavigate={onRequestClose}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <DndContext sensors={sensors} collisionDetection={captureCollision} onDragEnd={onDragEnd}>
            {sections.grouped.map((section) => (
              <div key={section.id} className="group/presentation"> {/* Hover name or thumb shows ⋯ */}
                {section.presentation && (
                  <PresentationHeader
                    presentation={section.presentation}
                    renaming={renamingId === section.id}
                    canPresent={section.presentation.captureIds.some((id) => captures.some((c) => c.id === id))}
                    onRenameStart={() => setRenamingId(section.id)}
                    onRenameEnd={() => setRenamingId((current) => (current === section.id ? null : current))}
                    onPresent={() => presentPresentation(section.presentation!)}
                    onDelete={() => deletePresentation(section.id)}
                  />
                )}
                <div
                  className={
                    section.presentation && !section.presentation.collapsed && section.captures.length > 0
                      ? 'pl-7' // Thumbs indent; an empty “Add or drag” row stays menu-wide
                      : undefined
                  }
                >
                  {section.presentation && section.presentation.collapsed ? null : renderSectionCaptures(section)}
                </div>
              </div>
            ))}
            {/* Loose captures sit under every header with no section title, so they can still be dragged into one */}
            {(loose.captures.length > 0 || (sections.grouped.length > 0 && items.length > 0)) &&
              renderSectionCaptures(loose)}
          </DndContext>
        )}

      </div>

      {previewItem?.imageDataUrl && (
        <button
          type="button"
          className="absolute inset-0 z-20 flex flex-col bg-white p-2 text-left dark:bg-[#0f0f0f]"
          aria-label="Close preview"
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setPreviewId(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
          <img
            src={previewItem.imageDataUrl}
            alt=""
            className="min-h-0 w-full flex-1 rounded-md bg-gray-50 object-contain dark:bg-[#1a1a1a]"
          />
          <span className="mt-1.5 text-[12px] font-medium text-gray-900 dark:text-gray-100">
            {formatCaptureTimestamp(previewItem.createdAt)}
          </span>
          <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">
            {previewItem.boardPath}
          </span>
        </button>
      )}

    </div>
  )
}
