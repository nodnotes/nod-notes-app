'use client'

// Utility Layers body — reorderable preview list (top = front, bottom = back) plus group headers

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import type { Node } from 'reactflow' // RF v11 node — setNodes updater must return this, not a zIndex stub
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
} from '@dnd-kit/core' // Reorder + drop under a group header
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Folder, MoreHorizontal, Plus, Trash2 } from 'lucide-react' // + Group, header, delete
import { cn } from '@/lib/utils'
import { useReactFlowContext } from '@/components/react-flow-context'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  UtilityFilterOption,
  UtilitySearchHeader,
} from '@/components/utility-search-header' // AI-chat-style search + filter
import {
  createLayerGroup,
  deleteLayerGroup,
  getLayerGroups,
  moveLayerUnderGroup,
  renameLayerGroup,
  setLayerGroupOrder,
  subscribeLayerGroups,
  type LayerGroup,
} from '@/lib/layer-groups' // Per-board headers
import {
  getLayersTouching,
  layerZIndexByOrder,
  reorderLayersTouching,
  setLayersPublishScope,
  subscribeLayersTouching,
  type LayersTouchingItem,
} from '@/lib/layers-touching'

/** Filter rows in the Layers utility menu. */
type LayersFilter = 'all' | 'touching' | 'selected'

/** Loose list id — layers that are not under a group header. */
const UNGROUPED_SECTION = 'ungrouped'

/** One visual section: a group header, or the loose list under all headers. */
type LayerSection = {
  id: string
  group: LayerGroup | null
  items: LayersTouchingItem[]
}

/** Prefer the row under the pointer; fall back to closest center for gaps. */
const layerCollision: CollisionDetection = (args) => {
  const hits = pointerWithin(args) // Header / empty zone / thumb the pointer is inside
  if (hits.length > 0) return hits
  return closestCenter(args)
}

/** Which section a layer currently renders in. */
function findLayerSection(layerId: string, sections: LayerSection[]) {
  for (const section of sections) {
    const index = section.items.findIndex((item) => item.id === layerId) // Visible index under that header
    if (index >= 0) return { sectionId: section.id, index, ids: section.items.map((item) => item.id) }
  }
  return null
}

/** Map a droppable id (header, empty zone, trailing gap, or layer) to a section index. */
function resolveDropTarget(overId: string, sections: LayerSection[]) {
  const prefixed = /^(header|section|end):([\s\S]+)$/.exec(overId) // Synthetic ids, not RF node ids
  if (prefixed) {
    const sectionId = prefixed[2]
    const section = sections.find((s) => s.id === sectionId)
    if (!section) return null
    if (prefixed[1] === 'end') return { sectionId, index: section.items.length } // After the last thumb
    return { sectionId, index: 0 } // Header or empty zone → first slot under the header
  }
  const hit = findLayerSection(overId, sections)
  if (!hit) return null
  return { sectionId: hit.sectionId, index: hit.index }
}

/** Visible drop index → index in the header's stored ids (hidden members stay put). */
function storedInsertIndex(group: LayerGroup, visibleIds: string[], visibleIndex: number): number {
  if (visibleIds.length === 0) return group.layerIds.length // Empty header → append
  if (visibleIndex >= visibleIds.length) {
    const last = visibleIds[visibleIds.length - 1]
    const at = group.layerIds.indexOf(last)
    return at < 0 ? group.layerIds.length : at + 1 // After the last thumb that is on screen
  }
  const at = group.layerIds.indexOf(visibleIds[visibleIndex])
  return at < 0 ? group.layerIds.length : at // Before that visible member
}

/** Reorder only the visible members; ids not in this list keep their slots. */
function reorderVisibleMembers(layerIds: string[], visibleIds: string[], from: number, to: number): string[] {
  const nextVisible = arrayMove(visibleIds, from, to)
  const queue = [...nextVisible]
  return layerIds.map((id) => (visibleIds.includes(id) ? (queue.shift() ?? id) : id))
}

/** Front-to-back ids: each header's members, then loose rows, limited to the published list. */
function visualLayerIds(groups: LayerGroup[], list: LayersTouchingItem[]): string[] {
  const present = new Set(list.map((item) => item.id)) // Only layers the publisher handed us
  const claimed = new Set<string>()
  const out: string[] = []
  for (const group of groups) {
    for (const id of group.layerIds) {
      if (!present.has(id) || claimed.has(id)) continue
      claimed.add(id)
      out.push(id) // Header order wins over the snapshot
    }
  }
  for (const item of list) {
    if (!claimed.has(item.id)) out.push(item.id) // Loose rows keep snapshot order
  }
  return out
}

/** Empty group (or empty loose list) — the drop target under a new header. */
function EmptySectionDrop({ id, label }: { id: string; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${id}` }) // Drop → index 0
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mx-1 my-1 flex min-h-8 items-center justify-center rounded-md border border-dashed px-1 text-center text-[10px] text-gray-400',
        isOver ? 'border-blue-400 bg-blue-500/10 text-blue-600' : 'border-gray-200 dark:border-white/15'
      )}
    >
      {label}
    </div>
  )
}

/** Trailing gap is also a drop target so a layer can land at the end of a section. */
function TrailingDrop({ sectionId, children }: { sectionId: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `end:${sectionId}` }) // Drop → append
  return (
    <div ref={setNodeRef} className={cn('min-h-5 rounded-md', isOver && 'bg-blue-500/10')}>
      {children}
    </div>
  )
}

/** Group name row — drop on it to put a layer first under the header. */
function GroupHeader({
  group,
  renaming,
  onRenameStart,
  onRenameEnd,
  onDelete,
}: {
  group: LayerGroup
  renaming: boolean
  onRenameStart: () => void
  onRenameEnd: () => void
  onDelete: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `header:${group.id}` }) // Drop → index 0
  const skipBlur = useRef(false) // Escape blur must not save the in-progress edit

  useEffect(() => {
    if (!renaming) return
    document.getElementById(`layer-group-${group.id}`)?.scrollIntoView({ block: 'nearest' })
  }, [renaming, group.id])

  return (
    <div
      ref={setNodeRef}
      id={`layer-group-${group.id}`}
      className={cn(
        'group/header mt-1 flex h-7 items-center gap-1 rounded-md px-1.5',
        isOver && 'bg-blue-500/10'
      )}
    >
      <Folder className="h-3 w-3 flex-shrink-0 text-gray-400" />
      {renaming ? (
        <input
          autoFocus // New header opens ready to name
          defaultValue={group.name}
          aria-label="Group name"
          className="min-w-0 flex-1 bg-transparent text-[11px] font-medium text-gray-800 outline-none dark:text-gray-100"
          onFocus={(e) => e.currentTarget.select()}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation() // Don't let the board steal Enter / Escape
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              skipBlur.current = true
              e.currentTarget.blur()
            }
          }}
          onBlur={(e) => {
            if (!skipBlur.current) renameLayerGroup(group.id, e.currentTarget.value)
            skipBlur.current = false
            onRenameEnd()
          }}
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-[11px] font-medium text-gray-700 dark:text-gray-200"
          title="Rename group"
          onPointerDown={(e) => e.preventDefault()}
          onClick={onRenameStart}
        >
          {group.name}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 flex-shrink-0 text-gray-400 opacity-100 hover:bg-black/[0.04] hover:text-gray-700 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/header:opacity-100 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            title="Group options"
            aria-label={`${group.name} options`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40" onClick={(e) => e.stopPropagation()}>
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

/** One sortable layer row — drag anywhere to reorder or drop into a group; click selects. */
function SortableLayerRow({
  item,
  onSelect,
}: {
  item: LayersTouchingItem
  onSelect: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.9 : 1,
  }

  return (
    <li ref={setNodeRef} style={style}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        onClick={() => onSelect(item.id)}
        className="w-full text-left cursor-grab active:cursor-grabbing"
        title={item.label}
        aria-label={item.label}
      >
        <div
          className={cn(
            'relative w-full aspect-[4/3] overflow-hidden rounded-md bg-gray-50 dark:bg-[#1a1a1a]',
            item.selected
              ? 'border-2 border-blue-500'
              : 'border border-gray-200/80 dark:border-white/10'
          )}
        >
          {item.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- local data URL
            <img
              src={item.previewUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-contain pointer-events-none"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 animate-pulse bg-gray-100 dark:bg-white/[0.06]" />
          )}
        </div>
      </button>
    </li>
  )
}

/** Layers mode body for the utility sidebar. */
export function LayersTouchingList({ conversationId }: { conversationId?: string }) {
  const items = useSyncExternalStore(subscribeLayersTouching, getLayersTouching, () => [])
  const groups = useSyncExternalStore(subscribeLayerGroups, getLayerGroups, () => [])
  const { reactFlowInstance, getSetNodes } = useReactFlowContext()
  const [query, setQuery] = useState('') // Filter thumbs by label
  const [filterOpen, setFilterOpen] = useState(false) // Filter menu
  const [filter, setFilter] = useState<LayersFilter>('touching') // Default stays the touching cluster
  const [renamingId, setRenamingId] = useState<string | null>(null) // Header whose name is being edited
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }) // Click selects; drag reorders
  )

  useEffect(() => {
    setLayersPublishScope(filter === 'all' ? 'all' : 'touching') // All loads every layer; the rest use the cluster
    return () => setLayersPublishScope('touching') // Leaving Layers stops the whole-board publish
  }, [filter])

  const boardGroups = useMemo(
    () => (conversationId ? groups.filter((g) => g.boardId === conversationId) : []), // This board only
    [groups, conversationId]
  )

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (filter === 'selected' && !item.selected) return false // Selected only
      if (q && !item.label.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, query, filter])

  const canReorder = !query.trim() && filter !== 'selected' // Reorder the full All or touching list

  const sections = useMemo(() => {
    const byId = new Map(visible.map((item) => [item.id, item])) // Visible layers only
    const claimed = new Set<string>() // A layer renders under its first header
    const grouped: LayerSection[] = []
    const nameQuery = query.trim().toLowerCase()
    for (const group of boardGroups) {
      const rows: LayersTouchingItem[] = []
      for (const id of group.layerIds) {
        if (claimed.has(id)) continue
        const row = byId.get(id)
        if (!row) continue // Filtered out, or not in this publish
        claimed.add(id)
        rows.push(row)
      }
      const nameHit = Boolean(nameQuery) && group.name.toLowerCase().includes(nameQuery)
      if (!canReorder && rows.length === 0 && !nameHit) continue // Hide empty headers while searching
      grouped.push({ id: group.id, group, items: rows })
    }
    const memberIds = new Set(boardGroups.flatMap((g) => g.layerIds))
    const ungrouped = visible.filter((item) => !memberIds.has(item.id)) // Not under any header
    const loose: LayerSection = { id: UNGROUPED_SECTION, group: null, items: ungrouped }
    return { grouped, all: [...grouped, loose] }
  }, [visible, boardGroups, canReorder, query])

  const heading = filter === 'all' ? 'All' : filter === 'selected' ? 'Selected' : 'Touching'
  const loose = sections.all[sections.all.length - 1] // Layers not under a header
  const nothingToShow = sections.grouped.length === 0 && loose.items.length === 0 && items.length === 0

  const selectItem = (id: string) => {
    const setNodes = getSetNodes()
    if (setNodes) {
      setNodes((nds: Array<{ id: string; selected?: boolean }>) =>
        nds.map((n) => ({ ...n, selected: n.id === id }))
      )
    } else {
      reactFlowInstance?.setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === id })))
    }
    reactFlowInstance?.setEdges((eds) => eds.map((e) => ({ ...e, selected: false })))
  }

  const applyOrder = (orderedIds: string[]) => {
    reorderLayersTouching(orderedIds) // Optimistic list order (top = front)
    const getNodes = () => reactFlowInstance?.getNodes() ?? []
    const zById = layerZIndexByOrder(orderedIds, getNodes())
    const setNodes = getSetNodes()
    const patch = (nds: Node[]) => {
      let changed = false
      const next = nds.map((n) => {
        const z = zById.get(n.id)
        if (z == null || n.zIndex === z) return n
        changed = true
        return { ...n, zIndex: z } // zIndex only — never reorder the nodes array
      })
      return changed ? next : nds
    }
    if (setNodes) setNodes(patch)
    else reactFlowInstance?.setNodes(patch)
  }

  const onNewGroup = () => {
    if (!conversationId) return
    const created = createLayerGroup(conversationId) // Empty header at the top
    setRenamingId(created.id) // Name it immediately
  }

  const onDragEnd = (event: DragEndEvent) => {
    if (!canReorder || !conversationId) return
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return
    const from = findLayerSection(activeId, sections.all)
    const to = resolveDropTarget(overId, sections.all)
    if (!from || !to) return
    const board = getLayerGroups().filter((g) => g.boardId === conversationId)

    if (from.sectionId === to.sectionId) {
      const newIndex = to.index >= from.ids.length ? from.ids.length - 1 : to.index // End-cap → last slot
      if (from.index < 0 || from.index === newIndex) return
      if (from.sectionId === UNGROUPED_SECTION) {
        const nextLoose = arrayMove(from.ids, from.index, newIndex) // Loose rows only
        const front = visualLayerIds(board, items).filter((id) => !from.ids.includes(id)) // Headers stay above
        applyOrder([...front, ...nextLoose])
        return
      }
      const group = board.find((g) => g.id === from.sectionId)
      if (!group) return
      setLayerGroupOrder(group.id, reorderVisibleMembers(group.layerIds, from.ids, from.index, newIndex))
      applyOrder(visualLayerIds(getLayerGroups().filter((g) => g.boardId === conversationId), items))
      return
    }

    const target = board.find((g) => g.id === to.sectionId) ?? null // Null = loose list
    const visibleTarget = sections.all.find((s) => s.id === to.sectionId)?.items.map((item) => item.id) ?? []
    const storedIndex = target ? storedInsertIndex(target, visibleTarget, to.index) : to.index
    moveLayerUnderGroup(activeId, target ? target.id : null, storedIndex, conversationId)
    const after = getLayerGroups().filter((g) => g.boardId === conversationId)
    if (target) {
      applyOrder(visualLayerIds(after, items)) // Header order is the front of the list
      return
    }
    const memberIds = new Set(after.flatMap((g) => g.layerIds))
    const looseIds = items.map((item) => item.id).filter((id) => !memberIds.has(id) && id !== activeId)
    looseIds.splice(Math.max(0, Math.min(to.index, looseIds.length)), 0, activeId) // Land among loose rows
    const front = visualLayerIds(after, items).filter((id) => memberIds.has(id)) // Grouped thumbs stay above
    applyOrder([...front, ...looseIds])
  }

  const renderSection = (section: LayerSection) => (
    <>
      {section.items.length === 0 && canReorder ? (
        <EmptySectionDrop
          id={section.id}
          label={section.group ? 'Drag layers here' : 'Not in a group'}
        />
      ) : (
        <SortableContext items={section.items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1">
            {section.items.map((item) => (
              <SortableLayerRow key={item.id} item={item} onSelect={selectItem} />
            ))}
          </ul>
        </SortableContext>
      )}
      {canReorder && section.items.length > 0 && <TrailingDrop sectionId={section.id}>{null}</TrailingDrop>}
    </>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <UtilitySearchHeader
        query={query}
        onQueryChange={setQuery}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        filterActive={filter !== 'touching'}
        filterTitle="Filter layers"
        filterMenu={
          <>
            <UtilityFilterOption
              label="All"
              active={filter === 'all'}
              onSelect={() => {
                setFilter('all') // Every frame, drawing, and shape on the board
                setFilterOpen(false)
              }}
            />
            <UtilityFilterOption
              label="All touching"
              active={filter === 'touching'}
              onSelect={() => {
                setFilter('touching')
                setFilterOpen(false)
              }}
            />
            <UtilityFilterOption
              label="Selected only"
              active={filter === 'selected'}
              onSelect={() => {
                setFilter('selected')
                setFilterOpen(false)
              }}
            />
          </>
        }
      />

      <div className="flex flex-shrink-0 px-2 pb-1.5 pt-2">
        <button
          type="button"
          className="flex h-8 w-full flex-shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium text-gray-700 hover:bg-black/[0.04] disabled:opacity-40 dark:text-gray-200 dark:hover:bg-white/[0.06]"
          title="New group"
          aria-label="New group"
          disabled={!conversationId}
          onPointerDown={(e) => e.preventDefault()}
          onClick={onNewGroup}
        >
          <Plus className="h-3.5 w-3.5" />
          Group
        </button>
      </div>

      {nothingToShow ? (
        <div className="flex flex-col gap-1 px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
          <p className="font-medium text-gray-700 dark:text-gray-200">Layers</p>
          <p className="leading-relaxed">
            {filter === 'all'
              ? 'No frames, drawings, or shapes on this board.'
              : 'Select a frame, drawing, or thread to see everything touching it.'}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 py-2">
          <p className="px-1.5 pb-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            {heading} · {visible.length}
            <span className="font-normal text-gray-400"> · top front</span>
          </p>
          {visible.length === 0 && sections.grouped.length === 0 ? (
            <p className="px-1.5 py-6 text-center text-xs text-gray-400">No matching layers</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={layerCollision} onDragEnd={onDragEnd}>
              {sections.grouped.map((section) => (
                <div key={section.id}>
                  {section.group && (
                    <GroupHeader
                      group={section.group}
                      renaming={renamingId === section.id}
                      onRenameStart={() => setRenamingId(section.id)}
                      onRenameEnd={() => setRenamingId((current) => (current === section.id ? null : current))}
                      onDelete={() => deleteLayerGroup(section.id)}
                    />
                  )}
                  {renderSection(section)}
                </div>
              ))}
              {(loose.items.length > 0 || sections.grouped.length > 0) && (
                <div>
                  {sections.grouped.length > 0 && loose.items.length > 0 && (
                    <div className="mt-2 px-1.5 pb-0.5 text-[10px] font-medium text-gray-400">
                      Not in a group
                    </div>
                  )}
                  {renderSection(loose)}
                </div>
              )}
            </DndContext>
          )}
        </div>
      )}
    </div>
  )
}
