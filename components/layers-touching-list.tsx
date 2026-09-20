'use client'

// Utility Layers body — reorderable preview list (top = front). Group headers share that order with loose rows.

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
import { Check, Folder, FolderOpen, List, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react' // Folder row, list mark, organize check, row ⋯, + Group, rename, delete
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useReactFlowContext } from '@/components/react-flow-context'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  UtilityFilterOption,
  UtilityMenuTitle,
  UtilitySearchHeader,
  UtilitySectionDivider,
} from '@/components/utility-search-header' // AI-chat-style search + filter + expanded-header hairline
import {
  EMPTY_LAYER_STACK,
  createLayerGroup,
  deleteLayerGroup,
  getLayerGroups,
  getLayerStack,
  groupStackToken,
  layerStackToken,
  moveLayerUnderGroup,
  renameLayerGroup,
  setLayerGroupCollapsed,
  setLayerGroupOrder,
  setLayerStack,
  subscribeLayerGroups,
  type LayerGroup,
} from '@/lib/layer-groups' // Per-board headers and their mixed order with loose layers
import {
  getLayersTouching,
  layerZIndexByOrder,
  reorderLayersTouching,
  setLayersPublishScope,
  subscribeLayersTouching,
  type LayersTouchingItem,
} from '@/lib/layers-touching'
import {
  readUtilityLayersFilter,
  writeUtilityLayersFilter,
  type UtilityLayersFilter,
} from '@/lib/utility-filter-prefs' // Remember All / touching / selected across tab switches

/** How the Layers list is arranged. By group is the default. */
type LayerOrganize = 'list' | 'group'

/** Loose list id — layers that are not under a group header. */
const UNGROUPED_SECTION = 'ungrouped'

/** Shared ⋯ chrome. Each caller adds the hover group that reveals it. */
const layerMoreButtonClass =
  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-black/[0.06] hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-200 [@media(hover:hover)]:opacity-0 data-[state=open]:opacity-100'

/** One visual section: a group header and its members, or the loose layers mixed among those headers. */
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

/** Map a droppable id (trailing gap, empty zone, or layer) to a section index. Folder rows (`g:`) are stack slots, not join targets. */
function resolveDropTarget(overId: string, sections: LayerSection[]) {
  if (overId.startsWith('g:')) return null // Handled as mixed-list reorder — do not treat as “first under header”
  const prefixed = /^(header|section|end):([\s\S]+)$/.exec(overId) // Synthetic ids, not RF node ids
  if (prefixed) {
    const sectionId = prefixed[2]
    const section = sections.find((s) => s.id === sectionId)
    if (!section) return null
    if (prefixed[1] === 'end') return { sectionId, index: section.items.length } // After the last thumb
    return { sectionId, index: 0 } // Empty zone → first slot under the header
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

/** Keep saved slots, drop deleted headers, and append layers the stack has never seen. */
function reconcileStack(stored: string[], groups: LayerGroup[], looseIds: string[]): string[] {
  const groupIds = new Set(groups.map((g) => g.id))
  const member = new Set(groups.flatMap((g) => g.layerIds))
  const out: string[] = []
  const seen = new Set<string>()
  for (const token of stored) {
    if (seen.has(token)) continue
    if (token.startsWith('g:')) {
      if (!groupIds.has(token.slice(2))) continue // Header was deleted
      seen.add(token)
      out.push(token)
      continue
    }
    if (!token.startsWith('l:')) continue
    if (member.has(token.slice(2))) continue // Renders under its header
    seen.add(token)
    out.push(token) // Loose row, or a layer outside this publish
  }
  const missing = groups.filter((g) => !seen.has(groupStackToken(g.id)))
  if (missing.length > 0) out.unshift(...missing.map((g) => groupStackToken(g.id))) // Unsaved headers stay newest-first at the top
  for (const id of looseIds) {
    const token = layerStackToken(id)
    if (seen.has(token)) continue
    seen.add(token)
    out.push(token) // New loose rows land at the back
  }
  return out
}

/** Front-to-back ids following the mixed list: a header's members travel with that header. */
function orderFromTokens(tokens: string[], groups: LayerGroup[], list: LayersTouchingItem[]): string[] {
  const byGroup = new Map(groups.map((g) => [g.id, g]))
  const present = new Set(list.map((item) => item.id))
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of tokens) {
    if (token.startsWith('g:')) {
      const group = byGroup.get(token.slice(2))
      if (!group) continue
      for (const id of group.layerIds) {
        if (!present.has(id) || seen.has(id)) continue
        seen.add(id)
        out.push(id)
      }
      continue
    }
    if (!token.startsWith('l:')) continue
    const id = token.slice(2)
    if (!present.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  for (const item of list) {
    if (!seen.has(item.id)) out.push(item.id) // Anything the stack missed stays at the back
  }
  return out
}

/** After a flat reorder, put each header just above its first member. */
function stackFromFlat(orderedIds: string[], groups: LayerGroup[], prev: string[]): string[] {
  const memberOf = new Map<string, string>()
  for (const group of groups) {
    for (const id of group.layerIds) memberOf.set(id, group.id)
  }
  const out: string[] = []
  const placed = new Set<string>()
  const known = new Set(orderedIds)
  for (const id of orderedIds) {
    const groupId = memberOf.get(id)
    if (groupId) {
      if (!placed.has(groupId)) {
        placed.add(groupId)
        out.push(groupStackToken(groupId)) // Header sits with its members in this flat order
      }
      continue
    }
    out.push(layerStackToken(id))
  }
  for (const group of groups) {
    if (!placed.has(group.id)) out.push(groupStackToken(group.id)) // Empty headers follow the list
  }
  for (const token of prev) {
    if (!token.startsWith('l:')) continue
    const id = token.slice(2)
    if (known.has(id) || memberOf.has(id)) continue
    out.push(token) // Layers outside this publish keep a slot
  }
  return out
}

/** Move one stack token onto another slot. `anchor` null appends. */
function shiftToken(tokens: string[], token: string, anchor: string | null): string[] {
  const from = tokens.indexOf(token)
  if (!anchor) {
    const without = from < 0 ? tokens : tokens.filter((t) => t !== token)
    return [...without, token] // Bottom of the mixed list
  }
  const to = tokens.indexOf(anchor)
  if (to < 0) return tokens
  if (from < 0) {
    const next = [...tokens]
    next.splice(to, 0, token) // Newly loose row takes the drop slot
    return next
  }
  if (from === to) return tokens
  return arrayMove(tokens, from, to)
}

/** Trailing gap is also a drop target so a layer can land at the end of a section. */
function TrailingDrop({ sectionId, children }: { sectionId: string; children?: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `end:${sectionId}` }) // Drop → append
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md',
        children == null && 'min-h-5', // Empty end-of-list keeps a hit strip; wrapping the section hairline stays flush under thumbs
        isOver && 'bg-blue-500/10'
      )}
    >
      {children}
    </div>
  )
}

/** Group name row — drag it among loose layers; drop a loose thumb on it to park that thumb before the group. */
function GroupHeader({
  group,
  renaming,
  draggable,
  onRenameStart,
  onRenameEnd,
  onDelete,
}: {
  group: LayerGroup
  renaming: boolean
  draggable: boolean // Search and Selected stay put
  onRenameStart: () => void
  onRenameEnd: () => void
  onDelete: () => void
}) {
  const { setNodeRef, isOver, transform, transition, isDragging, listeners } = useSortable({
    id: groupStackToken(group.id), // Same token as the mixed list, so the header sorts with loose rows
    disabled: !draggable || renaming,
  })
  const skipBlur = useRef(false) // Escape blur must not save the in-progress edit
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform), // Move the header; don't scale it onto a thumb
    transition,
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.9 : 1,
  }

  useEffect(() => {
    if (!renaming) return
    document.getElementById(`layer-group-${group.id}`)?.scrollIntoView({ block: 'nearest' })
  }, [renaming, group.id])

  const toggleCollapsed = () => {
    if (renaming) return // The name field owns the click while it is open
    setLayerGroupCollapsed(group.id, !group.collapsed)
  }

  return (
    <div
      ref={setNodeRef}
      id={`layer-group-${group.id}`}
      style={style}
      className={cn(
        'relative mt-0.5 flex h-7 items-center gap-1.5 rounded-md pl-[3px]', // Folder ink lines up with the Layers toggle icon
        isOver && 'bg-blue-500/10'
      )}
    >
      {renaming ? (
        <>
          <FolderOpen className="h-4 w-4 flex-shrink-0 text-gray-800 dark:text-gray-200" />
          <input
            autoFocus // New header opens ready to name
            defaultValue={group.name}
            aria-label="Group name"
            className="min-w-0 flex-1 bg-transparent text-xs text-gray-900 outline-none dark:text-gray-100"
            onFocus={(e) => e.currentTarget.select()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()} // Don't collapse while naming
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
        </>
      ) : (
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-gray-800 dark:text-gray-200"
          title={group.collapsed ? 'Expand group' : 'Collapse group'}
          aria-label={group.collapsed ? 'Expand group' : 'Collapse group'}
          aria-expanded={!group.collapsed}
          onPointerDown={(e) => {
            listeners?.onPointerDown?.(e) // Drag the header among loose layers; a click still toggles
            e.preventDefault() // Don't steal focus from the board
          }}
          onClick={toggleCollapsed} // Name and folder are one control
          onDoubleClick={onRenameStart} // Rename stays off the single click
        >
          {group.collapsed ? <Folder className="h-4 w-4 flex-shrink-0" /> : <FolderOpen className="h-4 w-4 flex-shrink-0" />}
          <span className="min-w-0 flex-1 truncate text-xs text-gray-900 dark:text-gray-100">{group.name}</span>
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(layerMoreButtonClass, '[@media(hover:hover)]:group-hover/layer-group:opacity-100')}
            title="Group options"
            aria-label={`${group.name} options`}
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

/** One sortable layer row — drag to reorder or drop into a group; click selects; ⋯ like Captures. */
function SortableLayerRow({
  item,
  onSelect,
  canReorder,
  onRemoveFromGroup,
}: {
  item: LayersTouchingItem
  onSelect: (id: string) => void
  canReorder: boolean // Off while search / Selected filter
  onRemoveFromGroup?: () => void // Only when this thumb sits under a folder
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canReorder, // Search and Selected stay put
  })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform), // Move only — scale would shrink the thumb onto a shorter row
    transition: transition || 'transform 200ms ease',
    zIndex: isDragging ? 2 : undefined,
    opacity: isDragging ? 0.9 : 1,
  }

  return (
    <li ref={setNodeRef} style={style} className="group/layer-preview w-full shrink-0"> {/* Hover reveals top-right ⋯ */}
      <div className="relative">
        <button
          type="button"
          {...(canReorder ? { ...attributes, ...listeners } : {})}
          onClick={() => onSelect(item.id)}
          className={cn('w-full text-left', canReorder && 'cursor-grab active:cursor-grabbing')}
          title={canReorder ? `${item.label} — drag to reorder` : item.label}
          aria-label={item.selected ? `Deselect ${item.label}` : item.label}
          aria-pressed={item.selected}
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'absolute right-1.5 top-1.5 z-10 h-8 w-6 flex-shrink-0 bg-white/90 text-gray-500 shadow-sm hover:bg-white hover:text-gray-700 dark:bg-[#1a1a1a]/90 dark:hover:bg-[#1a1a1a]',
                'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/layer-preview:opacity-100'
              )}
              title="Layer options"
              aria-label={`${item.label} options`}
              onPointerDown={(e) => e.stopPropagation()} // Don’t start a thumb drag
              onClick={(e) => e.stopPropagation()} // Don’t select via the ⋯
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              disabled={!onRemoveFromGroup}
              onSelect={() => onRemoveFromGroup?.()}
            >
              <Folder className="mr-2 h-4 w-4" />
              Remove from group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

/** Layers mode body for the utility sidebar. */
export function LayersTouchingList({ conversationId }: { conversationId?: string }) {
  const items = useSyncExternalStore(subscribeLayersTouching, getLayersTouching, () => [])
  const groups = useSyncExternalStore(subscribeLayerGroups, getLayerGroups, () => [])
  const stack = useSyncExternalStore(
    subscribeLayerGroups, // Same notify as membership — a header move publishes here too
    () => (conversationId ? getLayerStack(conversationId) : EMPTY_LAYER_STACK),
    () => EMPTY_LAYER_STACK
  )
  const { reactFlowInstance, getSetNodes } = useReactFlowContext()
  const [query, setQuery] = useState('') // Filter thumbs by label
  const [filterOpen, setFilterOpen] = useState(false) // Filter menu
  const [filter, setFilter] = useState<UtilityLayersFilter>(readUtilityLayersFilter) // Restore last All / touching / selected
  const [renamingId, setRenamingId] = useState<string | null>(null) // Header whose name is being edited
  const [organize, setOrganize] = useState<LayerOrganize>('group') // ⋯ menu: one list, or file rows
  const [organizeOpen, setOrganizeOpen] = useState(false) // Organize layers menu
  const organizeRef = useRef<HTMLDivElement>(null) // + Group row + ⋯ menu, so outside clicks can close it
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }) // Click selects; drag reorders
  )

  useEffect(() => {
    writeUtilityLayersFilter(filter) // Tab switch unmounts this list — keep the choice for next open
    setLayersPublishScope(filter === 'all' ? 'all' : 'touching') // All loads every layer; the rest use the cluster
    return () => setLayersPublishScope('touching') // Leaving Layers stops the whole-board publish
  }, [filter])

  useEffect(() => {
    if (!organizeOpen) return // Listener only while the ⋯ menu is up
    const onDown = (event: PointerEvent) => {
      if (organizeRef.current?.contains(event.target as globalThis.Node)) return // DOM Node — the file also imports React Flow's Node
      setOrganizeOpen(false) // Click outside closes In one list / By group
    }
    window.addEventListener('pointerdown', onDown, true) // Capture so the board does not eat the click first
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [organizeOpen])

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

  const loose = sections.all[sections.all.length - 1] // Layers not under a header
  const rows = useMemo(() => {
    const sectionById = new Map(sections.grouped.map((section) => [section.id, section]))
    const looseById = new Map(loose.items.map((item) => [item.id, item]))
    const member = new Set(boardGroups.flatMap((g) => g.layerIds))
    const looseIds = items.map((item) => item.id).filter((id) => !member.has(id))
    const tokens = reconcileStack(stack, boardGroups, looseIds) // Saved order, plus anything new
    const out: Array<{ kind: 'group'; section: LayerSection } | { kind: 'layer'; item: LayersTouchingItem }> = []
    for (const token of tokens) {
      if (token.startsWith('g:')) {
        const section = sectionById.get(token.slice(2))
        if (section) out.push({ kind: 'group', section }) // Skip headers hidden by search
        continue
      }
      const item = token.startsWith('l:') ? looseById.get(token.slice(2)) : undefined
      if (item) out.push({ kind: 'layer', item })
    }
    return out
  }, [sections.grouped, loose.items, boardGroups, items, stack])
  const topIds = rows.map((row) => (row.kind === 'group' ? groupStackToken(row.section.id) : row.item.id))
  const listEmpty = visible.length === 0 && (organize === 'list' || sections.grouped.length === 0) // No thumbs — the line under + follows the filter

  const selectItem = (id: string) => {
    const already = !!reactFlowInstance?.getNodes().find((n) => n.id === id)?.selected // Second click clears
    const setNodes = getSetNodes()
    const apply = (nds: Node[]) => nds.map((n) => ({ ...n, selected: already ? false : n.id === id }))
    if (setNodes) setNodes(apply)
    else reactFlowInstance?.setNodes(apply)
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
    setOrganize('group') // The new row only shows under By group
    const created = createLayerGroup(conversationId) // Empty header at the top
    setRenamingId(created.id) // Name it immediately
  }

  const onListDragEnd = (event: DragEndEvent) => {
    if (!canReorder) return // Search and Selected only stay put
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = visible.map((item) => item.id) // Flat stack, groups ignored
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0 || !conversationId) return
    const next = arrayMove(ids, from, to)
    applyOrder(next)
    const groupsNow = getLayerGroups().filter((g) => g.boardId === conversationId)
    for (const group of groupsNow) {
      const ordered = next.filter((id) => group.layerIds.includes(id))
      if (ordered.length !== group.layerIds.length) continue // Hidden members stay in their slots
      if (ordered.every((id, index) => id === group.layerIds[index])) continue
      setLayerGroupOrder(group.id, ordered) // Members follow the flat order
    }
    setLayerStack(conversationId, stackFromFlat(next, groupsNow, getLayerStack(conversationId)))
  }

  const looseIdsOf = (groupsNow: LayerGroup[]) => {
    const member = new Set(groupsNow.flatMap((g) => g.layerIds))
    return items.map((item) => item.id).filter((id) => !member.has(id))
  }

  const onDragEnd = (event: DragEndEvent) => {
    if (!canReorder || !conversationId) return
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return
    const groupsNow = () => getLayerGroups().filter((g) => g.boardId === conversationId)

    if (activeId.startsWith('g:')) {
      const groups = groupsNow()
      const tokens = reconcileStack(getLayerStack(conversationId), groups, looseIdsOf(groups))
      let anchor: string | null = null // null = after the last slot
      if (overId === 'end:stack') anchor = null
      else if (overId.startsWith('g:')) anchor = overId
      else if (overId.startsWith('end:')) anchor = groupStackToken(overId.slice(4)) // Gap under a header → that header's slot
      else {
        const hit = findLayerSection(overId, sections.all)
        if (!hit) return
        anchor = hit.sectionId === UNGROUPED_SECTION ? layerStackToken(overId) : groupStackToken(hit.sectionId)
      }
      if (anchor === activeId) return // Dropped on its own members
      const next = shiftToken(tokens, activeId, anchor)
      if (next === tokens) return
      setLayerStack(conversationId, next)
      applyOrder(orderFromTokens(next, groups, items)) // Members move with the header
      return
    }

    if (overId === 'end:stack') {
      const from = findLayerSection(activeId, sections.all)
      if (!from) return
      if (from.sectionId !== UNGROUPED_SECTION) moveLayerUnderGroup(activeId, null, 0, conversationId)
      const groups = groupsNow()
      const tokens = reconcileStack(getLayerStack(conversationId), groups, looseIdsOf(groups))
      const next = shiftToken(tokens, layerStackToken(activeId), null) // Loose row at the bottom
      setLayerStack(conversationId, next)
      applyOrder(orderFromTokens(next, groups, items))
      return
    }

    // A folder row is a mixed-list slot — dropping a thumb on it parks that thumb before the group
    // (join still happens by dropping on a member or the end gap under the header).
    if (overId.startsWith('g:')) {
      const from = findLayerSection(activeId, sections.all)
      if (!from) return
      if (from.sectionId !== UNGROUPED_SECTION) {
        moveLayerUnderGroup(activeId, null, 0, conversationId) // Peel out; the stack owns this thumb now
      }
      const groups = groupsNow()
      const tokens = reconcileStack(getLayerStack(conversationId), groups, looseIdsOf(groups))
      const next = shiftToken(tokens, layerStackToken(activeId), overId) // Same slot as the header — loose can sit above it
      if (next === tokens) return
      setLayerStack(conversationId, next)
      applyOrder(orderFromTokens(next, groups, items))
      return
    }

    const from = findLayerSection(activeId, sections.all)
    const to = resolveDropTarget(overId, sections.all)
    if (!from || !to) return
    const board = groupsNow()

    if (from.sectionId === to.sectionId) {
      const newIndex = to.index >= from.ids.length ? from.ids.length - 1 : to.index // End-cap → last slot
      if (from.index < 0 || from.index === newIndex) return
      if (from.sectionId === UNGROUPED_SECTION) {
        const tokens = reconcileStack(getLayerStack(conversationId), board, looseIdsOf(board))
        const next = shiftToken(tokens, layerStackToken(activeId), layerStackToken(overId)) // Can pass a header
        if (next === tokens) return
        setLayerStack(conversationId, next)
        applyOrder(orderFromTokens(next, board, items))
        return
      }
      const group = board.find((g) => g.id === from.sectionId)
      if (!group) return
      setLayerGroupOrder(group.id, reorderVisibleMembers(group.layerIds, from.ids, from.index, newIndex))
      const after = groupsNow()
      applyOrder(orderFromTokens(reconcileStack(getLayerStack(conversationId), after, looseIdsOf(after)), after, items))
      return
    }

    const target = board.find((g) => g.id === to.sectionId) ?? null // Null = land among loose rows
    if (!target) {
      moveLayerUnderGroup(activeId, null, 0, conversationId) // Leave the header
      const after = groupsNow()
      const tokens = reconcileStack(getLayerStack(conversationId), after, looseIdsOf(after))
      const next = shiftToken(tokens, layerStackToken(activeId), layerStackToken(overId))
      setLayerStack(conversationId, next)
      applyOrder(orderFromTokens(next, after, items))
      return
    }
    const visibleTarget = sections.all.find((s) => s.id === to.sectionId)?.items.map((item) => item.id) ?? []
    moveLayerUnderGroup(activeId, target.id, storedInsertIndex(target, visibleTarget, to.index), conversationId)
    if (target.collapsed) setLayerGroupCollapsed(target.id, false) // A drop opens a closed folder
    const after = groupsNow()
    applyOrder(orderFromTokens(reconcileStack(getLayerStack(conversationId), after, looseIdsOf(after)), after, items))
  }

  const peelFromGroup = (layerId: string) => {
    if (!conversationId) return
    moveLayerUnderGroup(layerId, null, 0, conversationId) // Membership only — stack picks the thumb up as loose
    const after = getLayerGroups().filter((g) => g.boardId === conversationId)
    const tokens = reconcileStack(getLayerStack(conversationId), after, looseIdsOf(after))
    setLayerStack(conversationId, tokens)
    applyOrder(orderFromTokens(tokens, after, items))
  }

  const renderSection = (section: LayerSection) =>
    section.items.length === 0 ? null : (
      <SortableContext items={section.items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-1"> {/* Full-width thumbs — section hairline marks the group */}
          {section.items.map((item) => (
            <SortableLayerRow
              key={item.id}
              item={item}
              onSelect={selectItem}
              canReorder={canReorder}
              onRemoveFromGroup={section.group ? () => peelFromGroup(item.id) : undefined}
            />
          ))}
        </ul>
      </SortableContext>
    )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <UtilitySearchHeader
        query={query}
        onQueryChange={setQuery}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        filterActive={filter !== 'all'} // Blue unless every layerable node is showing
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

      <UtilityMenuTitle>Layers</UtilityMenuTitle>
      <div ref={organizeRef} className="group/layer-row relative flex h-8 flex-shrink-0 items-center gap-1 pl-[3px] pr-1.5 pt-1"> {/* Plus ink lines up with the Layers toggle icon */}
        <button
          type="button"
          className="flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-[13px] font-medium text-gray-900 disabled:opacity-40 dark:text-gray-100" // No hover wash — ink stays flat
          title="New group"
          aria-label="New group"
          disabled={!conversationId} // Empty header still needs a board
          onPointerDown={(e) => e.preventDefault()}
          onClick={onNewGroup}
        >
          <Plus className="h-4 w-4 flex-shrink-0" /> {/* Same hit target as the word */}
          Group
        </button>
        <button
          type="button"
          className={cn(
            layerMoreButtonClass,
            'ml-auto [@media(hover:hover)]:group-hover/layer-row:opacity-100',
            organizeOpen && 'opacity-100'
          )}
          title="Organize layers"
          aria-label="Organize layers"
          aria-expanded={organizeOpen}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setOrganizeOpen((open) => !open)}
        >
          <MoreHorizontal className="h-4 w-4" /> {/* Far right of + Group */}
        </button>
        {organizeOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-[var(--nod-chat-prompt)] py-1.5 shadow-lg dark:border-[#2f2f2f]"> {/* Same chrome grey as the utility body */}
            <p className="px-3 pb-1 pt-1 text-xs text-gray-400">Organize layers</p>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-900 hover:bg-[var(--nod-on-chrome)] dark:text-gray-100"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setOrganize('list') // Flat thumbs, no file rows
                setOrganizeOpen(false)
              }}
            >
              <List className="h-4 w-4 flex-shrink-0" />
              <span className="min-w-0 flex-1">In one list</span>
              {organize === 'list' && <Check className="h-4 w-4 flex-shrink-0" />}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-900 hover:bg-[var(--nod-on-chrome)] dark:text-gray-100"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setOrganize('group') // Folder rows under + Group
                setOrganizeOpen(false)
              }}
            >
              <Folder className="h-4 w-4 flex-shrink-0" />
              <span className="min-w-0 flex-1">By group</span>
              {organize === 'group' && <Check className="h-4 w-4 flex-shrink-0" />}
            </button>
          </div>
        )}
      </div>

      {listEmpty ? (
        <div className="px-3 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {query.trim()
            ? 'No layers match.'
            : filter === 'all'
              ? 'No layers yet.'
              : filter === 'selected'
                ? 'See selected board contents.'
                : 'Select board contents to see layers touching them.'}
        </div>
      ) : (
        <div className="utility-body-scroll min-h-0 flex-1 px-2 py-1"> {/* px-2: left gap matches the right; not a flex column — that compresses thumbs while a drag reorders */}
            {organize === 'list' ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onListDragEnd}>
                  <SortableContext items={visible.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                    <ul className="flex flex-col gap-1">
                      {visible.map((item) => {
                        const groupId = boardGroups.find((g) => g.layerIds.includes(item.id))?.id
                        return (
                          <SortableLayerRow
                            key={item.id}
                            item={item}
                            onSelect={selectItem}
                            canReorder={canReorder}
                            onRemoveFromGroup={groupId ? () => peelFromGroup(item.id) : undefined}
                          />
                        )
                      })}
                    </ul>
                  </SortableContext>
                </DndContext>
            ) : (
            <DndContext sensors={sensors} collisionDetection={layerCollision} onDragEnd={onDragEnd}>
              <ul className="flex flex-col gap-1">
                <SortableContext items={topIds} strategy={verticalListSortingStrategy}>
                  {rows.map((row) =>
                    row.kind === 'layer' ? (
                      <SortableLayerRow
                        key={row.item.id}
                        item={row.item}
                        onSelect={selectItem}
                        canReorder={canReorder}
                      />
                    ) : (
                      <li key={row.section.id} className="group/layer-group list-none w-full shrink-0">
                        {row.section.group && (
                          <GroupHeader
                            group={row.section.group}
                            draggable={canReorder}
                            renaming={renamingId === row.section.id}
                            onRenameStart={() => setRenamingId(row.section.id)}
                            onRenameEnd={() =>
                              setRenamingId((current) => (current === row.section.id ? null : current))
                            }
                            onDelete={() => deleteLayerGroup(row.section.id)}
                          />
                        )}
                        {row.section.group && !row.section.group.collapsed && (
                          <>
                            {renderSection(row.section)}
                            {canReorder ? (
                              <TrailingDrop sectionId={row.section.id}>
                                <UtilitySectionDivider /> {/* Drop-at-end hit sits on the hairline — no extra strip above it */}
                              </TrailingDrop>
                            ) : (
                              <UtilitySectionDivider />
                            )}
                          </>
                        )}
                      </li>
                    )
                  )}
                </SortableContext>
              </ul>
              {canReorder && rows.length > 0 && <TrailingDrop sectionId="stack">{null}</TrailingDrop>}
            </DndContext>
          )}
        </div>
      )}
    </div>
  )
}
