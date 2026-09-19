'use client'

// Utility Layers body — reorderable preview list (top = front, bottom = back)

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react'
import type { Node } from 'reactflow' // RF v11 node — setNodes updater must return this, not a zIndex stub
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/utils'
import { useReactFlowContext } from '@/components/react-flow-context'
import {
  UtilityFilterOption,
  UtilitySearchHeader,
} from '@/components/utility-search-header' // AI-chat-style search + filter
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

/** One sortable layer row — drag anywhere to reorder; click selects. */
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
export function LayersTouchingList() {
  const items = useSyncExternalStore(subscribeLayersTouching, getLayersTouching, () => [])
  const { reactFlowInstance, getSetNodes } = useReactFlowContext()
  const [query, setQuery] = useState('') // Filter thumbs by label
  const [filterOpen, setFilterOpen] = useState(false) // Filter menu
  const [filter, setFilter] = useState<LayersFilter>('touching') // Default stays the touching cluster
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }) // Click selects; drag reorders
  )

  useEffect(() => {
    setLayersPublishScope(filter === 'all' ? 'all' : 'touching') // All loads every layer; the rest use the cluster
    return () => setLayersPublishScope('touching') // Leaving Layers stops the whole-board publish
  }, [filter])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((item) => {
      if (filter === 'selected' && !item.selected) return false // Selected only
      if (q && !item.label.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, query, filter])

  const canReorder = !query.trim() && filter !== 'selected' // Reorder the full All or touching list
  const heading = filter === 'all' ? 'All' : filter === 'selected' ? 'Selected' : 'Touching'

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

  const onDragEnd = (event: DragEndEvent) => {
    if (!canReorder) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = items.map((i) => i.id) // Reorder against full cluster, not filtered view
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    applyOrder(arrayMove(ids, from, to))
  }

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

      {items.length === 0 ? (
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
          {visible.length === 0 ? (
            <p className="px-1.5 py-6 text-center text-xs text-gray-400">No matching layers</p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={visible.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul className="flex flex-col gap-1">
                  {visible.map((item) => (
                    <SortableLayerRow key={item.id} item={item} onSelect={selectItem} />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  )
}
