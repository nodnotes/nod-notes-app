'use client'

// Property icon click menu — same chrome as the frame menu (search + rows + flyouts).

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react' // Search, place, flyouts
import { createPortal } from 'react-dom' // Escape RF isolate so the card sits beside the icon
import {
  ArrowLeftToLine, // Insert left
  ArrowRightFromLine, // Unwrap content
  ArrowRightToLine, // Insert right
  ArrowUpDown, // Sort
  Copy, // Duplicate
  Eye, // Display as
  EyeOff, // Hide
  LayoutGrid, // Group
  ListFilter, // Filter
  Lock, // Property access
  Pin, // Freeze
  Settings2, // Edit property
  Sigma, // Calculate
  Sparkles, // AI Autofill
  Trash2, // Delete
  ChevronRight, // Flyout chevron
} from 'lucide-react'
import { Button } from '@/components/ui/button' // Same ghost rows as BlockActionsMenu
import { cn } from '@/lib/utils' // Class merge
import { applyMenuPlacement, watchMenuSafeRect } from '@/lib/menu-placement' // Stay in the chrome-free lane
import { watchBoardViewportNav } from '@/lib/board-nav-menu' // Hide while the board pans; reveal when it stops
import {
  propertyTypeIcon, // Type glyph in the Edit flyout
  propertyTypeLabel, // Context header + name fallback
  type PropertyTypeId,
} from '@/lib/blocks/property'

/** Screen box of the clicked property icon (top strip or in-frame). */
export type PropertyMenuAnchor = { left: number; top: number; width: number; height: number }

/** Wired rows; stubs omit a call so the card still lists every Notion column option. */
export type PropertyMenuAction =
  | 'editType'
  | 'editName'
  | 'displayIcon'
  | 'displayInline'
  | 'insertLeft'
  | 'insertRight'
  | 'duplicate'
  | 'delete'

type Flyout = 'edit' | 'autofill' | 'sort' | 'calculate' | 'display' | null // Right-side panes

/** Types shown in Edit property — same set as Turn into → Property. */
const EDIT_TYPES: PropertyTypeId[] = [
  'text',
  'number',
  'select',
  'multiSelect',
  'status',
  'date',
  'person',
  'files',
  'checkbox',
  'url',
  'phone',
  'email',
  'relation',
  'rollup',
  'formula',
  'button',
  'uniqueId',
  'place',
  'createdTime',
  'lastEditedTime',
  'createdBy',
  'lastEditedBy',
]

type ActionRow = {
  kind: 'action' // Clickable row
  id: string // Stable key
  label: string // Visible copy
  icon: ReactNode // Leading glyph
  flyout?: Exclude<Flyout, null> // Opens a right pane
  badge?: string // Alpha / Now with agents
  trailing?: string // Display as current value
  danger?: boolean // Delete — red like the frame menu
  stub?: boolean // Visible but not wired yet
}

type MenuRow = ActionRow | { kind: 'separator' } // Hairline between bands

/**
 * Property menu — frame-menu chrome (Search + context label + ghost rows).
 * Edit property changes name/type; Display as toggles strip vs in-frame.
 */
export function PropertyMenu({
  open,
  anchor,
  type,
  name,
  inline,
  onAction,
  onClose,
}: {
  open: boolean // Host keeps the card mounted only while true
  anchor: PropertyMenuAnchor | null // Icon screen box
  type: PropertyTypeId // Current property type
  name: string // Notion column name (may be empty)
  inline: boolean // true = in-frame cell; false + empty = top-strip icon
  onAction: (action: PropertyMenuAction, payload?: { type?: PropertyTypeId; name?: string }) => void
  onClose: () => void // Click-away / Escape / after a mutating action
}) {
  const rootRef = useRef<HTMLDivElement>(null) // Placement root
  const searchRef = useRef<HTMLInputElement>(null) // Search actions — desktop autofocus
  const nameRef = useRef<HTMLInputElement>(null) // Edit-property name field
  const [query, setQuery] = useState('') // Filters rows like the frame menu
  const [flyout, setFlyout] = useState<Flyout>(null) // Which right pane is open
  const [hideForBoardNav, setHideForBoardNav] = useState(false) // Same hide as the frame menu
  const [nameDraft, setNameDraft] = useState(name) // Local rename until blur / type pick
  const title = name.trim() || propertyTypeLabel(type) // Context label under Search
  const displayAs = inline ? 'In frame' : 'Icon' // Current Display as caption

  useEffect(() => {
    setNameDraft(name) // Re-seed when the host opens a different icon
    setQuery('') // Fresh search each open
  }, [name, open])

  useEffect(() => {
    if (!open) setFlyout(null) // Close flyouts when the host dismisses
  }, [open])

  useEffect(() => {
    if (!open) return // Closed — no nav watch
    return watchBoardViewportNav({
      onStart: () => setHideForBoardNav(true), // Board is moving — hide the card
      onSettle: () => setHideForBoardNav(false), // Re-place via layout effect, then show
    })
  }, [open])

  useEffect(() => {
    if (!open) return // Closed — skip autofocus
    if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return
    searchRef.current?.focus() // Desktop: caret in Search like the frame menu
  }, [open])

  useEffect(() => {
    if (!open) return // Closed — ignore outside clicks
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('[data-tt-property-menu]')) return // Inside the card / flyout
      if (t?.closest('[data-tt-property-icon]')) return // Host owns icon press (click vs drag)
      onClose() // Anywhere else dismisses
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      if (flyout) setFlyout(null) // Escape closes the flyout first
      else onClose()
    }
    document.addEventListener('pointerdown', onDown, true) // Capture so RF / TipTap don't steal
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open, flyout, onClose])

  const anchorX = anchor ? anchor.left : 0 // Park under the icon's left edge
  const anchorY = anchor ? anchor.top + anchor.height + 4 : 0 // Gap below the glyph

  useLayoutEffect(() => {
    if (!open || !anchor) return // Nothing to place
    const root = rootRef.current
    if (!root) return
    const place = () =>
      applyMenuPlacement(root, {
        anchorX,
        anchorY,
        openLeft: false, // Prefer right of the icon; clamp if the lane is short
        fromExisting: flyout != null, // Keep the card put while a flyout is open
      })
    place()
    const raf = requestAnimationFrame(place) // Chrome/selection boxes land in the same commit
    const stop = watchMenuSafeRect(place)
    return () => {
      cancelAnimationFrame(raf)
      stop()
    }
  }, [open, anchor, anchorX, anchorY, flyout, hideForBoardNav])

  const icon = 'h-4 w-4' // Same 16px as frame-menu rows
  const allRows: MenuRow[] = useMemo(
    () => [
      { kind: 'action', id: 'edit', label: 'Edit property', icon: <Settings2 className={icon} />, flyout: 'edit' },
      { kind: 'action', id: 'access', label: 'Property access', icon: <Lock className={icon} />, badge: 'Alpha', stub: true },
      { kind: 'action', id: 'autofill', label: 'AI Autofill', icon: <Sparkles className={icon} />, badge: 'Now with agents', flyout: 'autofill', stub: true },
      { kind: 'separator' },
      { kind: 'action', id: 'filter', label: 'Filter', icon: <ListFilter className={icon} />, stub: true },
      { kind: 'action', id: 'sort', label: 'Sort', icon: <ArrowUpDown className={icon} />, flyout: 'sort', stub: true },
      { kind: 'action', id: 'group', label: 'Group', icon: <LayoutGrid className={icon} />, stub: true },
      { kind: 'action', id: 'calc', label: 'Calculate', icon: <Sigma className={icon} />, flyout: 'calculate', stub: true },
      { kind: 'action', id: 'freeze', label: 'Freeze', icon: <Pin className={icon} />, stub: true },
      { kind: 'action', id: 'hide', label: 'Hide', icon: <EyeOff className={icon} />, stub: true },
      { kind: 'action', id: 'unwrap', label: 'Unwrap content', icon: <ArrowRightFromLine className={icon} />, stub: true },
      { kind: 'action', id: 'display', label: 'Display as', icon: <Eye className={icon} />, flyout: 'display', trailing: displayAs },
      { kind: 'separator' },
      { kind: 'action', id: 'insertLeft', label: 'Insert left', icon: <ArrowLeftToLine className={icon} /> },
      { kind: 'action', id: 'insertRight', label: 'Insert right', icon: <ArrowRightToLine className={icon} /> },
      { kind: 'action', id: 'duplicate', label: 'Duplicate property', icon: <Copy className={icon} /> },
      { kind: 'action', id: 'delete', label: 'Delete property', icon: <Trash2 className={icon} />, danger: true },
    ],
    [displayAs]
  )

  const q = query.trim().toLowerCase() // Empty = show every row
  const rows = q
    ? allRows.filter((row) => row.kind === 'action' && row.label.toLowerCase().includes(q))
    : allRows

  const commitName = () => {
    const next = nameDraft.trim()
    if (next === name.trim()) return // Unchanged
    onAction('editName', { name: next })
  }

  const run = (id: string) => {
    if (id === 'insertLeft') onAction('insertLeft')
    else if (id === 'insertRight') onAction('insertRight')
    else if (id === 'duplicate') onAction('duplicate')
    else if (id === 'delete') onAction('delete')
    else return
    onClose() // Mutating rows dismiss the card
  }

  if (!open || !anchor || typeof document === 'undefined') return null // SSR / closed

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      data-tt-property-menu
      className="block-actions-menu node-popup fixed z-[1000] min-w-[240px] overflow-visible rounded-lg border border-gray-200 p-1 shadow-lg outline-none tt-menu-surface dark:border-[#2f2f2f]"
      style={{
        visibility: hideForBoardNav ? 'hidden' : 'visible', // Stay mounted so settle can re-place
        pointerEvents: hideForBoardNav ? 'none' : 'auto',
      }}
      onClick={(e) => {
        e.stopPropagation()
        if ((e.target as HTMLElement | null)?.closest?.('input')) return // Name / search need the click
        e.preventDefault()
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        if ((e.target as HTMLElement | null)?.closest?.('input')) return // Let the field take the caret
        e.preventDefault()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          if (flyout) setFlyout(null)
          else onClose()
        }
      }}
    >
      <div className="px-1.5 pt-1 pb-1">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actions..."
          className="h-8 w-full rounded-md border border-gray-200 bg-gray-50 px-2 text-sm text-gray-900 outline-none dark:border-[#3a3a3a] dark:bg-[#2a2a2a] dark:text-gray-100"
        />
      </div>
      <div className="px-2.5 pb-1 text-xs text-gray-500 dark:text-gray-400">
        Property · {title}
      </div>

      <div data-tt-menu-body className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-0.5 pb-0.5">
        {rows.length === 0 && (
          <div className="px-2 py-2 text-xs text-gray-400">No matching actions</div>
        )}
        {rows.map((row, index) => {
          if (row.kind === 'separator') {
            return <div key={`sep-${index}`} className="mx-1 my-1 h-px bg-gray-100 dark:bg-[#2f2f2f]" />
          }
          const subOpen = row.flyout != null && flyout === row.flyout
          return (
            <Button
              key={row.id}
              variant="ghost"
              size="sm"
              onMouseEnter={() => setFlyout(row.flyout ?? null)}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (row.stub && !row.flyout) return // Visible stub — no mutation
                if (row.flyout) {
                  setFlyout((s) => (s === row.flyout ? null : row.flyout!))
                  return
                }
                run(row.id)
              }}
              className={cn(
                'h-8 shrink-0 justify-start px-2 text-sm font-normal',
                subOpen && 'bg-gray-100 dark:bg-[#2a2a2a]',
                row.danger && 'text-red-600 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950'
              )}
            >
              <span className={cn('mr-2 text-gray-500 dark:text-gray-400', row.danger && 'text-red-600')}>
                {row.icon}
              </span>
              <span className="flex-1 text-left">{row.label}</span>
              {row.badge && (
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-[#2a2a2a]">
                  {row.badge}
                </span>
              )}
              {row.trailing && <span className="ml-3 text-[11px] text-gray-400">{row.trailing}</span>}
              {row.flyout && <ChevronRight className="ml-1 h-3.5 w-3.5 text-gray-400" />}
            </Button>
          )
        })}
      </div>

      {flyout === 'edit' && (
        <div
          data-tt-menu-flyout="main"
          data-tt-property-menu
          className="absolute z-[1001] w-[220px] rounded-lg border border-gray-200 p-1 shadow-lg tt-menu-surface dark:border-[#2f2f2f]"
        >
          <input
            ref={nameRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commitName()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            placeholder={propertyTypeLabel(type)}
            className="mb-1 h-8 w-full rounded-md border border-gray-200 bg-gray-50 px-2 text-sm text-gray-900 outline-none dark:border-[#3a3a3a] dark:bg-[#2a2a2a] dark:text-gray-100"
            aria-label="Property name"
          />
          <div data-tt-menu-body className="flex max-h-[240px] flex-col gap-0.5 overflow-y-auto">
            {EDIT_TYPES.map((id) => (
              <Button
                key={id}
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  commitName()
                  onAction('editType', { type: id })
                  onClose()
                }}
                className={cn(
                  'h-8 w-full justify-start px-2 text-sm font-normal',
                  id === type && 'tt-selected'
                )}
              >
                <span className="mr-2 text-gray-500">{propertyTypeIcon(id, 'h-4 w-4')}</span>
                <span className="flex-1 text-left">{propertyTypeLabel(id)}</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {flyout === 'display' && (
        <div
          data-tt-menu-flyout="main"
          data-tt-property-menu
          className="absolute z-[1001] min-w-[160px] rounded-lg border border-gray-200 p-1 shadow-lg tt-menu-surface dark:border-[#2f2f2f]"
        >
          {(
            [
              { id: 'displayIcon' as const, label: 'Icon' },
              { id: 'displayInline' as const, label: 'In frame' },
            ] as const
          ).map((opt) => (
            <Button
              key={opt.id}
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onAction(opt.id)
                onClose()
              }}
              className={cn(
                'h-8 w-full justify-start px-2 text-sm font-normal',
                (opt.id === 'displayInline') === inline && 'tt-selected'
              )}
            >
              <span className="flex-1 text-left">{opt.label}</span>
            </Button>
          ))}
        </div>
      )}

      {(flyout === 'sort' || flyout === 'calculate' || flyout === 'autofill') && (
        <div
          data-tt-menu-flyout="main"
          data-tt-property-menu
          className="absolute z-[1001] min-w-[160px] rounded-lg border border-gray-200 p-2 text-xs text-gray-500 shadow-lg tt-menu-surface dark:border-[#2f2f2f]"
        >
          Coming soon
        </div>
      )}
    </div>,
    document.body
  )
}
