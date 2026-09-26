'use client'

// Property icon click menu — Notion column menu chrome (Edit / Display as / insert / delete).

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react' // Place, flyouts, name draft
import { createPortal } from 'react-dom' // Escape RF isolate so the card can sit beside the icon
import {
  ArrowLeftToLine, // Insert left
  ArrowRightFromLine, // Unwrap content (arrow through a bar)
  ArrowRightToLine, // Insert right
  ArrowUpDown, // Sort
  Copy, // Duplicate
  Eye, // Display as
  EyeOff, // Hide
  Info, // Header info glyph
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
import { Button } from '@/components/ui/button' // Same ghost rows as other tt-menu-surface cards
import { cn } from '@/lib/utils' // Class merge
import { applyMenuPlacement, watchMenuSafeRect } from '@/lib/menu-placement' // Stay in the chrome-free lane
import { watchBoardViewportNav } from '@/lib/board-nav-menu' // Hide while the board pans; reveal when it stops
import {
  propertyTypeIcon, // Type glyph in the header + Edit flyout
  propertyTypeLabel, // Fallback title when the property has no name
  type PropertyTypeId,
} from '@/lib/blocks/property'

/** Screen box of the clicked property icon (top strip or in-frame). */
export type PropertyMenuAnchor = { left: number; top: number; width: number; height: number }

/** Wired rows; stubs omit a call so the card still matches the Notion list. */
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

type Row = {
  id: string // Stable key
  label: string // Visible copy
  icon: ReactNode // Leading glyph
  flyout?: Exclude<Flyout, null> // Opens a right pane instead of firing immediately
  badge?: string // Alpha / Now with agents
  trailing?: string // Display as current value
  muted?: boolean // Delete / disabled stubs
  stub?: boolean // Visible but not wired yet
}

/**
 * Property menu for a clicked type icon.
 * Header = name + type; Edit property changes name/type; Display as toggles strip vs in-frame.
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
  const nameRef = useRef<HTMLInputElement>(null) // Edit-property name field
  const [flyout, setFlyout] = useState<Flyout>(null) // Which right pane is open
  const [navHidden, setNavHidden] = useState(false) // Hide during pan/zoom
  const [nameDraft, setNameDraft] = useState(name) // Local rename until blur / type pick
  const title = name.trim() || propertyTypeLabel(type) // Header label
  const displayAs = inline ? 'In frame' : 'Icon' // Current Display as caption

  useEffect(() => {
    setNameDraft(name) // Re-seed when the host opens a different icon
  }, [name, open])

  useEffect(() => {
    if (!open) setFlyout(null) // Close flyouts when the host dismisses
  }, [open])

  useEffect(() => {
    if (!open) return // Closed — no nav watch
    return watchBoardViewportNav({
      onStart: () => setNavHidden(true), // Board is moving — hide the card
      onSettle: () => setNavHidden(false), // Re-place via layout effect, then show
    })
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
  }, [open, anchor, anchorX, anchorY, flyout, navHidden])

  if (!open || !anchor || typeof document === 'undefined') return null // SSR / closed

  const icon = 'h-4 w-4' // Same 16px as other menu rows
  const rows: Row[] = [
    { id: 'edit', label: 'Edit property', icon: <Settings2 className={icon} />, flyout: 'edit' },
    { id: 'access', label: 'Property access', icon: <Lock className={icon} />, badge: 'Alpha', stub: true },
    { id: 'autofill', label: 'AI Autofill', icon: <Sparkles className={icon} />, badge: 'Now with agents', flyout: 'autofill', stub: true },
    { id: 'filter', label: 'Filter', icon: <ListFilter className={icon} />, stub: true },
    { id: 'sort', label: 'Sort', icon: <ArrowUpDown className={icon} />, flyout: 'sort', stub: true },
    { id: 'group', label: 'Group', icon: <LayoutGrid className={icon} />, stub: true },
    { id: 'calc', label: 'Calculate', icon: <Sigma className={icon} />, flyout: 'calculate', stub: true },
    { id: 'freeze', label: 'Freeze', icon: <Pin className={icon} />, stub: true },
    { id: 'hide', label: 'Hide', icon: <EyeOff className={icon} />, stub: true },
    { id: 'unwrap', label: 'Unwrap content', icon: <ArrowRightFromLine className={icon} />, stub: true },
    {
      id: 'display',
      label: 'Display as',
      icon: <Eye className={icon} />,
      flyout: 'display',
      trailing: displayAs,
    },
    { id: 'insertLeft', label: 'Insert left', icon: <ArrowLeftToLine className={icon} /> },
    { id: 'insertRight', label: 'Insert right', icon: <ArrowRightToLine className={icon} /> },
    { id: 'duplicate', label: 'Duplicate property', icon: <Copy className={icon} /> },
    { id: 'delete', label: 'Delete property', icon: <Trash2 className={icon} />, muted: true },
  ]

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

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      data-tt-property-menu
      className={cn(
        'fixed z-[1002] w-[300px] tt-menu-surface rounded-[10px] shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-1.5 outline-none',
        navHidden && 'invisible pointer-events-none' // Stay mounted so placement is ready after nav
      )}
      onMouseDown={(e) => {
        e.stopPropagation()
        if ((e.target as HTMLElement | null)?.closest?.('input')) return // Let the name field take the caret
        e.preventDefault()
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="mb-1 flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 dark:border-[#3a3a3a] dark:bg-[#2a2a2a]">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-gray-500 dark:text-gray-400">
          {propertyTypeIcon(type, 'h-4 w-4')}
        </span>
        <input
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
          placeholder={title}
          aria-label="Property name"
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-900 outline-none dark:text-gray-100"
        />
        <Info className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
      </div>
      <div data-tt-menu-body className="flex min-h-0 max-h-[70vh] flex-col gap-0.5 overflow-y-auto px-0.5 pb-0.5">
        {rows.map((row) => {
          const subOpen = row.flyout != null && flyout === row.flyout
          const afterDisplay = row.id === 'insertLeft' // Hairline before insert / duplicate / delete
          const afterAutofill = row.id === 'filter'
          return (
            <div key={row.id} className="flex w-full flex-col">
              {(afterDisplay || afterAutofill) && (
                <div className="my-1 h-px bg-gray-100 dark:bg-[#2f2f2f] mx-1" />
              )}
              <Button
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
                  'h-8 w-full shrink-0 justify-start px-2 text-sm font-normal',
                  subOpen && 'bg-gray-100 dark:bg-[#2a2a2a]',
                  row.muted && 'text-gray-400'
                )}
              >
                <span className={cn('mr-2 text-gray-500 dark:text-gray-400', row.muted && 'text-gray-400')}>
                  {row.icon}
                </span>
                <span className="flex-1 text-left">{row.label}</span>
                {row.badge && (
                  <span
                    className={cn(
                      'ml-1 rounded-full px-1.5 py-px text-[10px] leading-4',
                      row.id === 'autofill'
                        ? 'bg-[#dbeafe] text-[#2563eb] dark:bg-[#1e3a5f] dark:text-[#93c5fd]'
                        : 'bg-gray-100 text-gray-500 dark:bg-[#2a2a2a]'
                    )}
                  >
                    {row.badge}
                  </span>
                )}
                {row.trailing && (
                  <span className="ml-2 text-[11px] text-gray-400">{row.trailing}</span>
                )}
                {row.flyout && <ChevronRight className="h-3.5 w-3.5 ml-1 text-gray-400" />}
              </Button>
            </div>
          )
        })}
      </div>

      {flyout === 'edit' && (
        <div
          data-tt-menu-flyout="main"
          data-tt-property-menu
          className="absolute z-[1003] w-[220px] tt-menu-surface rounded-lg shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-1"
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
            className="mb-1 h-8 w-full rounded-md border border-gray-200 bg-gray-50 px-2 text-sm outline-none dark:border-[#3a3a3a] dark:bg-[#2a2a2a] dark:text-gray-100"
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
          className="absolute z-[1003] min-w-[160px] tt-menu-surface rounded-lg shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-1"
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
          className="absolute z-[1003] min-w-[160px] tt-menu-surface rounded-lg shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-2 text-xs text-gray-500"
        >
          Coming soon
        </div>
      )}
    </div>,
    document.body
  )
}
