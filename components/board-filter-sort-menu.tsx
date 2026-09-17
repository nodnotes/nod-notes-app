'use client'

// Top-bar Filter / Sort — Notion-style criteria strip under the toolbar (above the mode pill).
// Scope: no selection → board-global; frame(s) selected → per-frame.
// + Filter opens a nod-style Filter by… picker (properties, or selected frames).

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import type { Node } from 'reactflow' // RF nodes for frame/property harvest
import {
  ArrowUpDown, // Sorts pill / toolbar Sort
  ChevronDown, // Pill dropdown chevron
  ListFilter, // Toolbar Filter + filter pills + Advanced filter
  MoreHorizontal, // Filter card … menu
  Plus, // + Filter
  Search, // Contains row glyph
  Trash2, // Delete filter
} from 'lucide-react'
import { Button } from '@/components/ui/button' // Ghost toolbar triggers
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu' // Anchored Filter by… panel
import { useReactFlowContext } from './react-flow-context' // Selection outside RF provider
import { usePhoneModeMenu } from './phone-mode-menu-context' // Desktop center vs phone left-align
import { ToolbarTitle } from './toolbar-title' // Animated icon-adjacent titles
import { newId, type DatabaseFilter, type DatabaseSort, type FilterOperator } from '@/lib/notion/database-view'
import {
  getBoardFilterSortUi,
  subscribeBoardFilterSortUi,
  toggleBoardFilterSort,
  type BoardFilterSortFocus,
} from '@/lib/board-filter-sort-ui'
import {
  propertyTypeIcon,
  propertyTypeLabel,
  readFramePropertyType,
  type PropertyTypeId,
} from '@/lib/blocks/property' // Property glyphs + labels
import { parsePropertyBlockTag } from '@/lib/tiptap/property-block-html' // Harvest cells from HTML
import { isStackCollapsedMeta } from './use-frame-nest-stack-drag' // Keep stack collapse when applying filters
import {
  appliedFilters,
  nodeMatchesBoardFilters,
  setLiveBoardFilters,
  isHiddenByLiveBoardFilter,
} from '@/lib/board-frame-filters' // Board-global hide non-matches
import { TOOLBAR_MENU_PLACEMENT } from '@/lib/menu-placement' // Under trigger, clear of path
import { cn } from '@/lib/utils'

export type { BoardFilterSortFocus }
export type FilterSortScope = 'board' | 'frame'

type BoardFilterSortTriggersProps = {
  showFilterLabel?: boolean
  showSortLabel?: boolean
  filterTriggerVisible?: boolean
  sortTriggerVisible?: boolean
}

/** One row in the Filter by… picker (property, Contains/Name, or a selected frame). */
type FilterPickItem = {
  id: string // Stable list key
  label: string // Row text
  kind: 'contains' | 'name' | 'property' | 'frame' // How picking seeds the chip
  propertyType?: PropertyTypeId // Glyph for harvested properties
  frameId?: string // Selected-frame row target
}

/** True when this RF node is a map frame (`metadata.isBlock`). */
function isBoardFrameNode(node: Node): boolean {
  if (node.type !== 'chatPanel') return false // Only chat panels hold frames
  const meta = (node.data?.promptMessage?.metadata || {}) as Record<string, unknown> // Frame metadata
  return meta.isBlock === true // Official frame flag
}

/** Plain label for a frame — title, else truncated body, else Frame. */
function framePickLabel(node: Node): string {
  const data = node.data as {
    promptMessage?: { content?: string; metadata?: Record<string, unknown> }
  } | undefined
  const meta = data?.promptMessage?.metadata // Title lives on metadata
  const title = typeof meta?.blockTitle === 'string' ? meta.blockTitle.trim() : '' // Named frame
  if (title) return title // Prefer blockTitle
  const html = data?.promptMessage?.content || '' // Fall back to body text
  const plain = html
    .replace(/<[^>]+>/g, ' ') // Strip tags
    .replace(/&nbsp;/gi, ' ') // Decode nbsp
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim()
  if (plain) return plain.length > 40 ? `${plain.slice(0, 40)}…` : plain // Truncate long bodies
  return 'Frame' // Empty untitled frame
}

/** Read propertyBlock cells from persisted frame HTML (type + optional name). */
function harvestPropertyCellsFromHtml(html: string): { type: PropertyTypeId; name: string }[] {
  if (!html || !html.includes('propertyBlock')) return [] // Fast out
  const out: { type: PropertyTypeId; name: string }[] = [] // Collected cells
  const re = /<div\b[^>]*data-type=["']propertyBlock["'][^>]*>/gi // Opening tags only
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const { type, propertyName } = parsePropertyBlockTag(m[0]) // Attr parse
    if (!type) continue // Unknown / missing type
    out.push({ type, name: propertyName }) // Keep name even when empty (label falls back to type)
  }
  return out
}

/** Notion-style Aa glyph for the Name property row. */
function NamePropertyIcon({ className }: { className?: string }) {
  return (
    <span className={cn('text-[11px] font-semibold leading-none tracking-tight', className)} aria-hidden>
      Aa
    </span>
  )
}

/** Icon for a Filter by… row. */
function filterPickIcon(item: FilterPickItem): ReactNode {
  if (item.kind === 'contains') return <Search className="h-4 w-4" aria-hidden /> // Content contains
  if (item.kind === 'name') return <NamePropertyIcon className="text-gray-500" /> // Title / Name
  if (item.kind === 'property' && item.propertyType) {
    return propertyTypeIcon(item.propertyType, 'h-4 w-4') // Harvested property type
  }
  return <ListFilter className="h-4 w-4" aria-hidden /> // Frame rows share filter glyph
}

/** Build picker rows: board properties (+ Contains/Name when frames exist), or selected frames. */
function buildFilterPickItems(nodes: Node[], scope: FilterSortScope): FilterPickItem[] {
  const frames = nodes.filter(isBoardFrameNode) // All frames on the board
  if (scope === 'frame') {
    const selected = frames.filter((n) => n.selected) // Only the current selection
    return selected.map((n) => ({
      id: `frame:${n.id}`, // Stable id
      label: framePickLabel(n), // Title / body preview
      kind: 'frame' as const, // Frame-scoped pick
      frameId: n.id, // RF node id
    }))
  }

  const picks: FilterPickItem[] = [] // Board-global list
  if (frames.length > 0) {
    // Boards with frames always expose Contains, then Name (Aa)
    picks.push({ id: 'contains', label: 'Contains', kind: 'contains' })
    picks.push({ id: 'name', label: 'Name', kind: 'name' })
  }

  const seen = new Set<string>(['name', 'contains']) // Skip duplicates of builtins
  for (const node of frames) {
    const data = node.data as {
      promptMessage?: { content?: string; metadata?: Record<string, unknown> }
    } | undefined
    const html = data?.promptMessage?.content || '' // Persisted TipTap HTML
    for (const cell of harvestPropertyCellsFromHtml(html)) {
      const label = (cell.name.trim() || propertyTypeLabel(cell.type)).trim() // Named or type label
      const key = label.toLowerCase() // Dedupe key
      if (!label || seen.has(key)) continue // Skip empty / already listed
      seen.add(key)
      picks.push({
        id: `prop:${key}`,
        label,
        kind: 'property',
        propertyType: cell.type,
      })
    }
    const frameType = readFramePropertyType(data?.promptMessage?.metadata || null) // Top-strip only type
    if (frameType) {
      const label = propertyTypeLabel(frameType) // Type label when no cell name
      const key = label.toLowerCase()
      if (!seen.has(key)) {
        seen.add(key)
        picks.push({
          id: `prop:${key}`,
          label,
          kind: 'property',
          propertyType: frameType,
        })
      }
    }
  }
  return picks
}

/** Seed a DatabaseFilter from a picker row. */
function filterFromPick(item: FilterPickItem): DatabaseFilter {
  if (item.kind === 'contains') {
    return { id: newId('f'), property: 'Content', operator: 'contains', value: '' } // Body text contains
  }
  if (item.kind === 'name') {
    return { id: newId('f'), property: 'Name', operator: 'contains', value: '' } // Frame title contains
  }
  if (item.kind === 'frame') {
    return {
      id: newId('f'),
      property: item.label, // Frame title as the property label for now
      operator: 'is',
      value: item.frameId || '', // Store frame id in value until persistence exists
    }
  }
  return { id: newId('f'), property: item.label, operator: 'contains', value: '' } // Property contains …
}

/** Selected frames + all board frames — toolbar sits outside ReactFlowProvider. */
function useBoardFilterFrames(): { selectedCount: number; nodes: Node[] } {
  const { reactFlowInstance } = useReactFlowContext()
  const [nodes, setNodes] = useState<Node[]>([])
  const [selectedCount, setSelectedCount] = useState(0)

  useEffect(() => {
    const refresh = () => {
      if (!reactFlowInstance) {
        setNodes([])
        setSelectedCount(0)
        return
      }
      const all = reactFlowInstance.getNodes() // Live RF snapshot
      const frames = all.filter(isBoardFrameNode) // Frame-only
      setNodes(all) // Keep full list for harvest (filter inside builder)
      setSelectedCount(frames.filter((n) => n.selected).length) // Selection count
    }
    refresh()
    window.addEventListener('node-selected', refresh) // Selection events
    window.addEventListener('tt-selection-changed', refresh) // TipTap / multi-select
    return () => {
      window.removeEventListener('node-selected', refresh)
      window.removeEventListener('tt-selection-changed', refresh)
    }
  }, [reactFlowInstance])

  return { selectedCount, nodes }
}

function useFilterSortUi() {
  return useSyncExternalStore(subscribeBoardFilterSortUi, getBoardFilterSortUi, getBoardFilterSortUi)
}

/** Text operators shown when clicking the contains pill (Name / text properties). */
const TEXT_FILTER_OPERATORS: Array<{ id: FilterOperator; label: string }> = [
  { id: 'is', label: 'Is' },
  { id: 'is_not', label: 'Is not' },
  { id: 'contains', label: 'Contains' },
  { id: 'does_not_contain', label: 'Does not contain' },
  { id: 'starts_with', label: 'Starts with' },
  { id: 'ends_with', label: 'Ends with' },
  { id: 'is_empty', label: 'Is empty' },
  { id: 'is_not_empty', label: 'Is not empty' },
]

/** True when the operator has no value field. */
function operatorNeedsValue(op: FilterOperator): boolean {
  return op !== 'is_empty' && op !== 'is_not_empty'
}

/** Lowercase label on the operator pill inside the editor card. */
function operatorTriggerLabel(op: FilterOperator): string {
  switch (op) {
    case 'is':
      return 'is'
    case 'is_not':
      return 'is not'
    case 'contains':
      return 'contains'
    case 'does_not_contain':
      return 'does not contain'
    case 'starts_with':
      return 'starts with'
    case 'ends_with':
      return 'ends with'
    case 'is_empty':
      return 'is empty'
    case 'is_not_empty':
      return 'is not empty'
    case 'gt':
      return '>'
    case 'lt':
      return '<'
    default:
      return op
  }
}

/** Capitalized operator for the applied chip (matches the operator menu). */
function operatorChipLabel(op: FilterOperator): string {
  const row = TEXT_FILTER_OPERATORS.find((o) => o.id === op)
  if (row) return row.label
  const lower = operatorTriggerLabel(op)
  return lower ? lower.charAt(0).toUpperCase() + lower.slice(1) : op
}

/** Format one filter as Notion chip text: "Name: Contains test". */
function filterChipLabel(f: DatabaseFilter): string {
  const op = operatorChipLabel(f.operator) // Capitalized (Contains)
  if (f.operator === 'is_empty' || f.operator === 'is_not_empty') {
    return `${f.property}: ${op}`
  }
  if (f.operator === 'is') {
    return `${f.property}: ${f.value.trim() || '…'}`
  }
  return `${f.property}: ${op} ${f.value.trim() || '…'}` // Name: Contains test
}

/** True when the filter has enough to show the blue applied chip. */
function isFilterApplied(f: DatabaseFilter): boolean {
  if (!operatorNeedsValue(f.operator)) return true // Is empty / Is not empty
  return f.value.trim().length > 0 // Typed a value
}

/** Glyph for a strip chip — Name → Aa, Content → search, else text bars. */
function filterPropertyIcon(property: string, className = 'h-3.5 w-3.5'): ReactNode {
  const key = property.trim().toLowerCase()
  if (key === 'name') return <NamePropertyIcon className={className} />
  if (key === 'content') return <Search className={className} aria-hidden />
  return propertyTypeIcon('text', className)
}

/** Blue Notion-style criteria pill (Sort). */
function CriteriaPill({
  icon,
  label,
  onClick,
  title,
  rounded = 'md',
}: {
  icon: ReactNode
  label: string
  onClick?: () => void
  title?: string
  rounded?: 'md' | 'full' // Sort uses full pill; filter chips stay md
}) {
  return (
    <button
      type="button"
      title={title || label}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 max-w-[220px] items-center gap-1 px-2 text-[13px]',
        rounded === 'full' ? 'rounded-full' : 'rounded-md',
        'bg-[#e7f3f8] text-[#0b6e99] hover:bg-[#d3edf6]',
        'dark:bg-[#1a3a4a] dark:text-[#6ec3e0] dark:hover:bg-[#214a5e]'
      )}
    >
      <span className="flex-shrink-0 opacity-80">{icon}</span>
      <span className="truncate font-medium">{label}</span>
      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
    </button>
  )
}

/**
 * Filter chip + editor card. Draft = gray property name; applied = blue Notion pill
 * ("Aa Name: Contains test"). Enter or click-outside closes and applies the typed value.
 */
function FilterChipEditor({
  filter,
  open,
  onOpenChange,
  onChange,
  onDelete,
  onAddToAdvanced,
}: {
  filter: DatabaseFilter
  open: boolean
  onOpenChange: (open: boolean) => void
  onChange: (next: DatabaseFilter) => void
  onDelete: () => void
  onAddToAdvanced: () => void
}) {
  const [opOpen, setOpOpen] = useState(false) // Operator list under "contains"
  const [moreOpen, setMoreOpen] = useState(false) // … menu to the right
  const valueRef = useRef<HTMLInputElement>(null) // Autofocus value on open
  const applied = isFilterApplied(filter) // Blue pill once a value (or empty-op) is set

  useEffect(() => {
    if (!open) {
      setOpOpen(false) // Close nested menus with the card
      setMoreOpen(false)
      return
    }
    if (!operatorNeedsValue(filter.operator)) return // Empty ops have no field
    const t = window.setTimeout(() => valueRef.current?.focus(), 0) // After Radix mounts
    return () => window.clearTimeout(t)
  }, [open, filter.operator])

  const applyAndClose = () => {
    setOpOpen(false)
    setMoreOpen(false)
    onOpenChange(false) // Value already live via onChange while typing
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setOpOpen(false)
          setMoreOpen(false)
        }
        onOpenChange(next) // Click-outside applies whatever was typed
      }}
      modal={false} // Allow typing in the value field without trapping the board
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={applied ? filterChipLabel(filter) : filter.property}
          className={cn(
            'inline-flex h-7 max-w-[220px] items-center gap-1 px-2 text-[13px]',
            applied
              ? cn(
                  'rounded-full bg-[#e7f3f8] text-[#0b6e99] hover:bg-[#d3edf6]',
                  'dark:bg-[#1a3a4a] dark:text-[#6ec3e0] dark:hover:bg-[#214a5e]',
                  open && 'bg-[#d3edf6] dark:bg-[#214a5e]'
                )
              : cn(
                  'rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200/80',
                  'dark:bg-[#2a2a2a] dark:text-gray-200 dark:hover:bg-[#333]',
                  open && 'bg-gray-200/90 dark:bg-[#333]'
                )
          )}
        >
          <span
            className={cn(
              'flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center',
              applied ? 'opacity-90' : 'opacity-80 text-gray-500'
            )}
          >
            {filterPropertyIcon(filter.property)}
          </span>
          <span className="truncate font-medium">
            {applied ? filterChipLabel(filter) : filter.property}
          </span>
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        {...TOOLBAR_MENU_PLACEMENT}
        className={cn(
          'tt-menu-surface z-[1000] w-[280px] overflow-visible rounded-lg border border-gray-200 p-0 shadow-lg',
          'dark:border-[#2f2f2f] bg-transparent'
        )}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onKeyDown={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => {
          // Keep open while using nested operator / more menus (portaled siblings)
          const t = e.target as HTMLElement | null
          if (t?.closest('[data-filter-editor-flyout]')) e.preventDefault()
        }}
      >
        <div className="relative z-0 p-2.5">
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-sm text-gray-600 dark:text-gray-300">{filter.property}</span>
            <div className="relative">
              <button
                type="button"
                className={cn(
                  'inline-flex h-6 items-center gap-0.5 rounded-md px-1.5 text-[13px] font-medium',
                  'text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-[#2a2a2a]',
                  opOpen && 'bg-gray-100 dark:bg-[#2a2a2a]'
                )}
                onPointerDown={(e) => e.preventDefault()} // Don't dismiss the parent menu
                onClick={() => {
                  setMoreOpen(false)
                  setOpOpen((v) => !v)
                }}
              >
                <span>{operatorTriggerLabel(filter.operator)}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-70" />
              </button>
              {opOpen ? (
                <div
                  data-filter-editor-flyout="operator"
                  className={cn(
                    'tt-menu-surface absolute left-0 top-full z-[1001] mt-1 min-w-[180px]',
                    'rounded-lg border border-gray-200 p-1 shadow-lg dark:border-[#2f2f2f] bg-transparent'
                  )}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div data-tt-menu-scroll className="max-h-[min(70vh,280px)] overflow-y-auto">
                    {TEXT_FILTER_OPERATORS.map((row) => (
                      <button
                        key={row.id}
                        type="button"
                        className={cn(
                          'flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-gray-700',
                          'hover:bg-[var(--nod-tab-hover)] dark:text-gray-200',
                          filter.operator === row.id && 'bg-gray-100 dark:bg-[#2a2a2a]'
                        )}
                        onClick={() => {
                          const nextOp = row.id
                          onChange({
                            ...filter,
                            operator: nextOp,
                            value: operatorNeedsValue(nextOp) ? filter.value : '',
                          })
                          setOpOpen(false)
                        }}
                      >
                        {row.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="relative ml-auto">
              <button
                type="button"
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-gray-500',
                  'hover:bg-gray-100 dark:hover:bg-[#2a2a2a]',
                  moreOpen && 'bg-gray-100 dark:bg-[#2a2a2a]'
                )}
                aria-label="Filter options"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpOpen(false)
                  setMoreOpen((v) => !v)
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {moreOpen ? (
                <div
                  data-filter-editor-flyout="more"
                  className={cn(
                    'tt-menu-surface absolute left-full top-0 z-[1001] ml-1 min-w-[200px]',
                    'rounded-lg border border-gray-200 p-1 shadow-lg dark:border-[#2f2f2f] bg-transparent'
                  )}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-[var(--nod-tab-hover)] dark:text-gray-200"
                    onClick={() => {
                      setMoreOpen(false)
                      onDelete()
                    }}
                  >
                    <Trash2 className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden />
                    <span>Delete filter</span>
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-[var(--nod-tab-hover)] dark:text-gray-200"
                    onClick={() => {
                      setMoreOpen(false)
                      onAddToAdvanced()
                      onOpenChange(false)
                    }}
                  >
                    <ListFilter className="h-4 w-4 flex-shrink-0 text-gray-500" aria-hidden />
                    <span>Add to advanced filter</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {operatorNeedsValue(filter.operator) ? (
            <input
              ref={valueRef}
              type="text"
              value={filter.value}
              onChange={(e) => onChange({ ...filter, value: e.target.value })}
              placeholder="Type a value..."
              className={cn(
                'h-9 w-full rounded-md border border-gray-200 bg-white/80 px-2.5 text-sm text-gray-900',
                'placeholder:text-gray-400 outline-none',
                'focus:border-gray-300 dark:border-[#3a3a3a] dark:bg-black/20 dark:text-gray-100',
                'dark:placeholder:text-gray-500 dark:focus:border-[#555]'
              )}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyAndClose() // Apply typed value → blue chip
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  applyAndClose() // Same as click-out — keep what was typed
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Nod-style Filter by… menu — search, icon+label rows, Advanced filter footer.
 * Board (no selection): Contains + Name + harvested properties.
 * Frame selection: selected frames only.
 */
function FilterByMenu({
  open,
  onOpenChange,
  items,
  ruleCount,
  onPick,
  onAdvanced,
  focusEmpty,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: FilterPickItem[]
  ruleCount: number
  onPick: (item: FilterPickItem) => void
  onAdvanced: () => void
  focusEmpty?: boolean // Soft highlight + Filter when no chips yet
}) {
  const [query, setQuery] = useState('') // Live filter of the list
  const inputRef = useRef<HTMLInputElement>(null) // Autofocus search on open

  useEffect(() => {
    if (!open) {
      setQuery('') // Fresh search next open
      return
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0) // After Radix mounts
    return () => window.clearTimeout(t)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase() // Empty → all
    if (!q) return items
    return items.filter((item) => item.label.toLowerCase().includes(q)) // Substring match
  }, [items, query])

  const ruleLabel = ruleCount === 1 ? '1 rule' : `${ruleCount} rules` // Footer meta

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-7 items-center gap-0.5 rounded-md px-1.5 text-[13px]',
            'text-gray-400 hover:bg-gray-100 hover:text-gray-600',
            'dark:hover:bg-[#2a2a2a] dark:hover:text-gray-300',
            focusEmpty && 'text-gray-500',
            open && 'bg-gray-100 text-gray-600 dark:bg-[#2a2a2a] dark:text-gray-300'
          )}
          aria-label="Add filter"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
          <span>Filter</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        {...TOOLBAR_MENU_PLACEMENT} // Under the + Filter chip
        className={cn(
          'tt-menu-surface z-[1000] w-[280px] overflow-hidden rounded-lg border border-gray-200 p-0 shadow-lg',
          'dark:border-[#2f2f2f]',
          'bg-transparent' // Let .tt-menu-surface wash show through (override popover fill)
        )}
        onCloseAutoFocus={(e) => e.preventDefault()} // Don't yank focus onto + Filter
        onKeyDown={(e) => e.stopPropagation()} // Keep board shortcuts out of the search field
      >
        <div className="relative z-0 flex max-h-[min(70vh,360px)] flex-col overflow-visible">
          <div className="flex-shrink-0 px-2 pt-2 pb-1.5"> {/* Search chrome stays fixed */}
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)} // Live filter
              placeholder="Filter by..."
              className={cn(
                'h-8 w-full rounded-md border border-gray-200 bg-white/80 px-2.5 text-sm text-gray-900',
                'placeholder:text-gray-400 outline-none',
                'focus:border-[#91caff] focus:ring-1 focus:ring-[#91caff]/40', // Notion-like focus
                'dark:border-[#3a3a3a] dark:bg-black/20 dark:text-gray-100 dark:placeholder:text-gray-500',
                'dark:focus:border-[#5a9fd4] dark:focus:ring-[#5a9fd4]/30'
              )}
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>

          <div
            data-tt-menu-body
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1 touch-pan-y"
          >
            {filtered.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-gray-400">No matches</div>
            ) : (
              filtered.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700',
                    'hover:bg-[var(--nod-tab-hover)] dark:text-gray-200',
                    index === 0 && !query && 'bg-gray-100/80 dark:bg-[#2a2a2a]/80' // First-row idle wash like Notion
                  )}
                  onPointerDown={(e) => e.preventDefault()} // Keep menu until click settles
                  onClick={() => {
                    onPick(item) // Seed criteria chip
                    onOpenChange(false) // Close picker
                  }}
                >
                  <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-gray-500 dark:text-gray-400">
                    {filterPickIcon(item)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              ))
            )}
          </div>

          <div className="mx-2 h-px flex-shrink-0 bg-gray-200 dark:bg-[#2f2f2f]" aria-hidden /> {/* Footer divider */}

          <div className="flex-shrink-0 p-1.5">
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700',
                'hover:bg-[var(--nod-tab-hover)] dark:text-gray-200'
              )}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                onAdvanced() // Stub until advanced UI
                onOpenChange(false)
              }}
            >
              <ListFilter className="h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
              <span className="flex-1">Advanced filter</span>
              <span className="text-xs text-gray-400 tabular-nums">{ruleLabel}</span>
            </button>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Actions-bar Filter + Sort buttons — toggle the under-toolbar criteria strip (not a dropdown).
 */
export function BoardFilterSortTriggers({
  showFilterLabel = true,
  showSortLabel = true,
  filterTriggerVisible = true,
  sortTriggerVisible = true,
}: BoardFilterSortTriggersProps) {
  const { openFilter, openSort } = useFilterSortUi()

  const triggerClass = (pressed: boolean, showLabel: boolean) =>
    cn(
      'h-7 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-[#1f1f1f] flex-shrink-0 flex items-center',
      'transition-[padding,gap] duration-200 ease-out',
      showLabel ? 'px-2 gap-1.5' : 'px-1.5 gap-0',
      pressed && 'bg-gray-100 dark:bg-[#1f1f1f] text-gray-900 dark:text-gray-100'
    )

  if (!filterTriggerVisible && !sortTriggerVisible) return null

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0">
      {filterTriggerVisible ? (
        <Button
          variant="ghost"
          size="sm"
          className={triggerClass(openFilter, showFilterLabel)}
          title="Filter"
          aria-label="Filter"
          aria-pressed={openFilter}
          onClick={() => toggleBoardFilterSort('filter')}
        >
          <ListFilter className="h-4 w-4 flex-shrink-0" />
          <ToolbarTitle show={showFilterLabel}>Filter</ToolbarTitle>
        </Button>
      ) : null}
      {sortTriggerVisible ? (
        <Button
          variant="ghost"
          size="sm"
          className={triggerClass(openSort, showSortLabel)}
          title="Sort"
          aria-label="Sort"
          aria-pressed={openSort}
          onClick={() => toggleBoardFilterSort('sort')}
        >
          <ArrowUpDown className="h-4 w-4 flex-shrink-0" />
          <ToolbarTitle show={showSortLabel}>Sort</ToolbarTitle>
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Criteria strip under the Actions/Layout/Draw mode pill (no divider).
 * Board-colored rounded plate hugs the chips. Desktop: left-align to the pill while
 * narrower than it; once wider than the pill’s L/R edges, center on the pill; wrap at a
 * max width with rows left-aligned to the plate. Phone (tools in pill): stay left-aligned.
 */
export function BoardFilterSortBar() {
  const { open, openFilter, openSort, focus } = useFilterSortUi()
  const { editMenuPillMode, reactFlowInstance } = useReactFlowContext() // Place + hide frames
  const { phoneTools } = usePhoneModeMenu() // Desktop centering vs phone left-align
  const { selectedCount, nodes } = useBoardFilterFrames() // Frames for picker + scope
  const scope: FilterSortScope = selectedCount === 0 ? 'board' : 'frame'
  const barRef = useRef<HTMLDivElement>(null) // Hug-content plate (board fill)
  const chipsRef = useRef<HTMLDivElement>(null) // Natural width measure target
  const [place, setPlace] = useState<{ left: number; maxWidth: number; width: number } | null>(null)
  const [filterMenuOpen, setFilterMenuOpen] = useState(false) // + Filter picker
  const [editingFilterId, setEditingFilterId] = useState<string | null>(null) // Open filter editor card

  const [boardFilters, setBoardFilters] = useState<DatabaseFilter[]>([])
  const [boardSorts, setBoardSorts] = useState<DatabaseSort[]>([])
  const [frameFilters, setFrameFilters] = useState<DatabaseFilter[]>([])
  const [frameSorts, setFrameSorts] = useState<DatabaseSort[]>([])

  const filters = scope === 'board' ? boardFilters : frameFilters
  const sorts = scope === 'board' ? boardSorts : frameSorts
  const setFilters = scope === 'board' ? setBoardFilters : setFrameFilters
  const setSorts = scope === 'board' ? setBoardSorts : setFrameSorts

  const pickItems = useMemo(() => buildFilterPickItems(nodes, scope), [nodes, scope])

  // Re-read RF nodes when opening the picker so new property cells show up without a reselect
  useEffect(() => {
    if (!filterMenuOpen) return
    window.dispatchEvent(new Event('tt-selection-changed')) // Reuse the frames hook listener
  }, [filterMenuOpen])

  // Drop the editor if the open filter was deleted / scope swapped
  useEffect(() => {
    if (!editingFilterId) return
    if (!filters.some((f) => f.id === editingFilterId)) setEditingFilterId(null)
  }, [filters, editingFilterId])

  // Board scope: publish + hide non-matching frames (Notion AND). Selection → show all again.
  useEffect(() => {
    const active = scope === 'board' ? appliedFilters(filters) : []
    setLiveBoardFilters(active) // board-flow node rebuilds also read this
    if (!reactFlowInstance) return
    reactFlowInstance.setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== 'chatPanel') return n
        const meta = (n.data?.promptMessage?.metadata || {}) as Record<string, unknown>
        if (meta.isBlock !== true) return n
        const stackHidden = isStackCollapsedMeta(meta)
        const filterHidden = active.length > 0 && !nodeMatchesBoardFilters(n, active)
        const hidden = stackHidden || filterHidden
        if (n.hidden === hidden) return n
        return { ...n, hidden }
      })
    )
  }, [filters, scope, reactFlowInstance])

  // Place plate vs mode pill: left while ≤ pill width, else center; wrap at maxWidth
  useLayoutEffect(() => {
    if (!open) {
      setPlace(null)
      return
    }

    const EDGE = 8 // Air from the strip’s L/R edges
    const GAP = 8 // chips row `gap-2`
    const PAD_X = 8 // chips row `px-2`

    const sync = () => {
      const pill = document.querySelector('[data-edit-menu-pill]') as HTMLElement | null
      const bar = barRef.current
      const chips = chipsRef.current
      if (!pill || !bar || !chips) return

      const parent = bar.offsetParent as HTMLElement | null // data-edit-menu-context (absolute)
      const parentR = (parent || bar.parentElement)?.getBoundingClientRect()
      if (!parentR || parentR.width < 1) return

      const pillR = pill.getBoundingClientRect()
      const pillLeft = pillR.left - parentR.left // Pill left in parent space
      const pillWidth = pillR.width
      const pillCenter = pillLeft + pillWidth / 2

      // Cap: grow from the pill center, but wrap well before the strip edges
      const maxCentered = Math.max(
        pillWidth,
        2 * Math.min(Math.max(0, pillCenter - EDGE), Math.max(0, parentR.width - pillCenter - EDGE))
      )
      // Wrap soon after outgrowing the toggle (~1.5× pill) on desktop; phone → redo edge
      const wrapCap = Math.max(pillWidth, pillWidth * 1.5)
      const undo = phoneTools
        ? (document.querySelector('[data-phone-undo]') as HTMLElement | null)
        : null
      const undoR = undo && undo.offsetWidth > 0 ? undo.getBoundingClientRect() : null
      const maxWidth = phoneTools
        ? Math.max(
            0,
            // Grow from the mode pill’s left to the redo cluster’s right edge
            (undoR ? undoR.right : parentR.right - EDGE) - pillR.left
          )
        : Math.min(maxCentered, wrapCap)

      // Unwrapped natural width = sum of visible chip boxes + gaps + horizontal pad
      let content = 0
      let count = 0
      for (const child of Array.from(chips.children)) {
        const el = child as HTMLElement
        if (el.classList.contains('sr-only')) continue // A11y label
        content += el.offsetWidth
        count += 1
      }
      const natural = content + Math.max(0, count - 1) * GAP + PAD_X * 2

      // Constrain for wrap, then measure the real painted width (flex+fit-content
      // otherwise stays at maxWidth and leaves empty board fill on the right)
      bar.style.maxWidth = `${maxWidth}px`
      bar.style.width = 'fit-content'
      void bar.offsetWidth // Force layout with the wrap cap

      const chipsR = chips.getBoundingClientRect()
      let maxChildRight = chipsR.left
      for (const child of Array.from(chips.children)) {
        const el = child as HTMLElement
        if (el.classList.contains('sr-only')) continue
        maxChildRight = Math.max(maxChildRight, el.getBoundingClientRect().right)
      }
      const usedWidth = Math.min(
        maxWidth,
        Math.max(0, Math.ceil(maxChildRight - chipsR.left + PAD_X)) // Right pad after farthest chip
      )

      let left = pillLeft // Default: flush with the mode pill’s left edge
      if (!phoneTools && natural > pillWidth + 0.5) {
        // Wider than the toggle’s L/R edges → center on the pill using hugged width
        left = pillCenter - usedWidth / 2
        left = Math.max(EDGE, Math.min(left, parentR.width - EDGE - usedWidth)) // Stay in the strip
      }

      const next = { left, maxWidth, width: usedWidth }
      setPlace((prev) =>
        prev &&
        Math.abs(prev.left - next.left) < 0.5 &&
        Math.abs(prev.maxWidth - next.maxWidth) < 0.5 &&
        Math.abs(prev.width - next.width) < 0.5
          ? prev
          : next
      )
    }

    sync()
    const pill = document.querySelector('[data-edit-menu-pill]') as HTMLElement | null
    const undo = document.querySelector('[data-phone-undo]') as HTMLElement | null
    const ro = new ResizeObserver(sync)
    if (pill) ro.observe(pill)
    if (undo) ro.observe(undo) // Phone: max width tracks undo/redo cluster
    if (barRef.current?.offsetParent) ro.observe(barRef.current.offsetParent as Element)
    if (barRef.current) ro.observe(barRef.current)
    if (chipsRef.current) ro.observe(chipsRef.current)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [
    open,
    openFilter,
    openSort,
    filters,
    sorts,
    scope,
    editMenuPillMode,
    filterMenuOpen,
    editingFilterId,
    phoneTools,
  ])

  const scopeLabel = useMemo(() => {
    if (scope === 'board') return 'Board'
    if (selectedCount === 1) return 'Frame'
    return `${selectedCount} frames`
  }, [scope, selectedCount])

  const sortPillLabel =
    sorts.length === 0 ? 'Sort' : sorts.length === 1 ? '1 sort' : `${sorts.length} sorts`

  const addSort = () => {
    setSorts((prev) => [
      ...prev,
      { id: newId('s'), property: 'Property', direction: 'asc' },
    ])
  }

  const onPickFilter = (item: FilterPickItem) => {
    const next = filterFromPick(item) // Seed chip from picker row
    setFilters((prev) => [...prev, next])
    setEditingFilterId(next.id) // Open the Name / contains editor immediately
    setFilterMenuOpen(false)
  }

  const onAdvancedFilter = () => {
    // Stub: advanced builder later — for now seed an empty Content contains rule when none exist
    if (filters.length === 0) {
      const next = { id: newId('f'), property: 'Content', operator: 'contains' as const, value: '' }
      setFilters([next])
      setEditingFilterId(next.id)
    }
  }

  const updateFilter = (id: string, next: DatabaseFilter) => {
    setFilters((prev) => prev.map((f) => (f.id === id ? next : f)))
  }

  const deleteFilter = (id: string) => {
    setFilters((prev) => prev.filter((f) => f.id !== id))
    if (editingFilterId === id) setEditingFilterId(null)
  }

  if (!open) return null

  const showSorts = openSort
  const showFilters = openFilter

  return (
    <div
      ref={barRef}
      data-filter-sort-bar
      className={cn(
        // Board fill hugs measured chip width (not leftover maxWidth after wrap)
        'pointer-events-auto mt-1 rounded-xl',
        'bg-gray-50 dark:bg-[#0f0f0f]'
      )}
      style={
        place
          ? {
              marginLeft: place.left,
              maxWidth: place.maxWidth,
              width: place.width,
            }
          : { width: 'fit-content' }
      }
    >
      <div
        ref={chipsRef}
        className="flex flex-wrap items-center justify-start gap-2 px-2 py-1.5 min-h-[36px]"
      >
        <span className="sr-only">
          {scope === 'board' ? 'Board filters and sorts' : 'Frame filters and sorts'} ({scopeLabel})
        </span>

        {showSorts ? (
          <CriteriaPill
            icon={<ArrowUpDown className="h-3.5 w-3.5" />}
            label={sortPillLabel}
            title={sorts.length ? 'Edit sorts' : 'Add a sort'}
            onClick={addSort}
            rounded="full"
          />
        ) : null}

        {showSorts && showFilters ? (
          <span
            className="mx-0.5 h-5 w-px flex-shrink-0 bg-gray-200 dark:bg-gray-600"
            aria-hidden
          />
        ) : null}

        {showFilters ? (
          <>
            {filters.map((f) => (
              <FilterChipEditor
                key={f.id}
                filter={f}
                open={editingFilterId === f.id}
                onOpenChange={(next) => setEditingFilterId(next ? f.id : null)}
                onChange={(next) => updateFilter(f.id, next)}
                onDelete={() => deleteFilter(f.id)}
                onAddToAdvanced={() => {
                  // Stub until advanced filter UI — keep the rule in the strip
                }}
              />
            ))}

            <FilterByMenu
              open={filterMenuOpen}
              onOpenChange={setFilterMenuOpen}
              items={pickItems}
              ruleCount={filters.length}
              onPick={onPickFilter}
              onAdvanced={onAdvancedFilter}
              focusEmpty={focus === 'filter' && filters.length === 0}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
