'use client'

// Capture list — utility-sidebar Capture tab (reorder + insert gaps, same as old Present)

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query' // Board path + frame text
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core' // Capture reorder
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable' // Vertical list + slide transitions
import { CSS } from '@dnd-kit/utilities' // Translate while dragging
import {
  ListFilter, // Filter control (dropdown menu chrome)
  MessageSquare, // Add to chat
  Plus, // Insert capture between rows
  Presentation, // Add to presentation
  Scan, // Capture view (4 disconnected rounded corners)
  Search, // Search field glyph (non-sidebar layout)
} from 'lucide-react'
import {
  UtilityFilterOption,
  UtilitySearchHeader,
} from '@/components/utility-search-header' // Sidebar: AI-chat-style search
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu' // Add-to-presentation menu
import { useReactFlowContext } from '@/components/react-flow-context' // Current viewport
import { useSidebarContext } from '@/components/sidebar-context' // Open chat on add-to-chat
import {
  addCapturesToPresentation,
  attachCapturesToChat,
  createPresentation,
  filterCaptures,
  formatCaptureTimestamp,
  getCaptures,
  getPresentations,
  insertNewCaptureAt,
  readCaptureCameraInput,
  setCaptureOrder,
  subscribeCaptures,
  takeBoardCapture,
  type BoardCapture,
} from '@/lib/captures' // Local capture/presentation store
import { cn } from '@/lib/utils' // Class merge
import { CaptureRowMoreMenu } from './capture-row-more-menu' // Row hover ⋯ — go to / copy link

type CapturesPanelProps = {
  conversationId?: string // Current board — Capture view + this-board filter
  variant?: 'popover' | 'sidebar' // Popover = fixed width; sidebar = fill utility column
  onRequestClose?: () => void // Popover: dismiss after navigate / add-to-chat
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
  tags,
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
  tags: { id: string; name: string }[]
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
    transform: CSS.Transform.toString(transform), // Follow pointer
    transition: transition || 'transform 200ms ease', // Slide neighbors into place
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.85 : 1,
  }
  const stamp = formatCaptureTimestamp(capture.createdAt) // Title / a11y only

  return (
    <div ref={setNodeRef} style={style} className="group/capture flex flex-col">
      {canReorder && <InsertGap onAdd={() => onAddAt(index)} />}
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
      {tags.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 px-0.5">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex max-w-full items-center gap-0.5 truncate rounded-md bg-gray-200/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-white/10 dark:text-gray-300"
              title={tag.name}
            >
              <Presentation className="h-2.5 w-2.5 flex-shrink-0 text-gray-500" />
              <span className="truncate">{tag.name}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Captures list body — utility Capture tab (reorder + + insert). */
export function CapturesPanel({
  conversationId,
  variant = 'popover',
  onRequestClose,
}: CapturesPanelProps) {
  const queryClient = useQueryClient() // Path + messages cache
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
  const sidebar = variant === 'sidebar' // Narrow column layout

  const items = useMemo(
    () =>
      filterCaptures(captures, query, {
        boardId: conversationId,
        thisBoardOnly: thisBoardOnly && Boolean(conversationId),
      }),
    [captures, query, conversationId, thisBoardOnly]
  )

  const presentationsByCapture = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>()
    for (const p of presentations) {
      for (const captureId of p.captureIds) {
        const list = map.get(captureId) || []
        list.push({ id: p.id, name: p.name })
        map.set(captureId, list)
      }
    }
    return map
  }, [presentations])

  // Reorder / + gaps only on the full unfiltered list (order is global)
  const canReorder = !query.trim() && !thisBoardOnly
  const hasSelection = selected.size > 0
  const previewItem = previewId ? items.find((c) => c.id === previewId) : undefined

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }) // Click selects; drag reorders
  )

  const captureAt = async (index: number | null) => {
    if (!conversationId || capturing) return
    setCapturing(true)
    try {
      const vp = reactFlowInstance?.getViewport() || { x: 0, y: 0, zoom: 1 }
      const created = await takeBoardCapture(
        (key) => queryClient.getQueryData(key),
        conversationId,
        readCaptureCameraInput(vp)
      )
      if (index !== null && canReorder) {
        insertNewCaptureAt(created, index) // Place at the + gap (takeBoardCapture prepended first)
      }
      setSelected((prev) => new Set(prev).add(created.id))
    } finally {
      setCapturing(false)
    }
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

  const onDragEnd = (event: DragEndEvent) => {
    if (!canReorder) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = items.map((c) => c.id)
    const oldIndex = ids.indexOf(String(active.id))
    const newIndex = ids.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    setCaptureOrder(arrayMove(ids, oldIndex, newIndex))
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
            filterActive={thisBoardOnly}
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
              </>
            }
          />
          <div className="flex-shrink-0 px-2 pb-1.5 pt-2">
            <button
              type="button"
              className="flex h-8 w-full flex-shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-gray-700 hover:bg-black/[0.04] disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/[0.06]"
              title="Capture view"
              aria-label="Capture view"
              disabled={!conversationId || capturing}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => void captureAt(null)}
            >
              <Scan className="h-3.5 w-3.5" />
              Capture view
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
            className="flex h-8 flex-shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/[0.06]"
            title="Capture view"
            aria-label="Capture view"
            disabled={!conversationId || capturing}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => void captureAt(null)}
          >
            <Scan className="h-3.5 w-3.5" />
            Capture view
          </button>
        </div>
      )}

      <div
        className={cn(
          'relative flex min-h-0 flex-col overflow-y-auto px-1.5 pb-1',
          sidebar ? 'flex-1' : 'max-h-72'
        )}
      >
        {items.length === 0 ? (
          <div className="px-1 py-8 text-center text-xs text-gray-400">
            {captures.length === 0 ? 'No captures yet' : 'No captures match'}
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              {items.map((item, index) => (
                <SortableCaptureRow
                  key={item.id}
                  capture={item}
                  index={index}
                  selected={selected.has(item.id)}
                  conversationId={conversationId}
                  canReorder={canReorder}
                  tags={presentationsByCapture.get(item.id) || []}
                  onToggle={toggleRow}
                  onPreview={setPreviewId}
                  onAddAt={(i) => void captureAt(i)}
                  onNavigate={onRequestClose}
                />
              ))}
            </SortableContext>
            {canReorder && (
              <InsertGap
                onAdd={() => void captureAt(items.length)}
                disabled={!conversationId || capturing}
              />
            )}
          </DndContext>
        )}

        {/* Empty list still gets a trailing + so the first capture can land here */}
        {items.length === 0 && canReorder && conversationId && (
          <InsertGap onAdd={() => void captureAt(0)} disabled={capturing} />
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

      <div
        className={cn(
          'flex flex-shrink-0 items-center gap-1 border-t border-gray-100 px-2 py-2 dark:border-white/10',
          sidebar ? 'flex-col' : 'justify-between'
        )}
      >
        <button
          type="button"
          className={cn(
            'flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium',
            sidebar && 'w-full justify-center',
            hasSelection
              ? 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]'
              : 'pointer-events-none opacity-40'
          )}
          disabled={!hasSelection}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => {
            if (!hasSelection) return
            attachCapturesToChat(selectedIds())
            setChatSidebarOpen(true)
            onRequestClose?.()
          }}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Add to chat
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium',
                sidebar && 'w-full justify-center',
                hasSelection
                  ? 'text-gray-800 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]'
                  : 'pointer-events-none opacity-40'
              )}
              disabled={!hasSelection}
              onPointerDown={(e) => {
                if (!hasSelection) e.preventDefault()
              }}
            >
              <Presentation className="h-3.5 w-3.5" />
              Add to presentation
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44 p-1" side={sidebar ? 'left' : 'top'} align="end">
            <DropdownMenuItem
              onSelect={() => {
                createPresentation(selectedIds())
              }}
            >
              Create new
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={presentations.length === 0}>
                Select
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-56 w-48 overflow-y-auto p-1" sideOffset={6}>
                {presentations.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-gray-400">No presentations yet</div>
                ) : (
                  presentations.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onSelect={() => {
                        addCapturesToPresentation(p.id, selectedIds())
                      }}
                    >
                      {p.name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
