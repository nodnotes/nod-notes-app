'use client'

// Board right-click menu — empty pane context menu (same Notion chrome as frame/thread menus).

import { useEffect, useLayoutEffect, useRef } from 'react' // Escape close + autofocus + in-window place
import {
  EyeOff, // Hide large overlapping frames toggle
  Scan, // Capture — 4 disconnected rounded corners
  ClipboardPaste,
  LayoutTemplate, // Create public template — same glyph Add template used
  Link2,
  Maximize2,
  Plus,
  Redo2,
  SquareMousePointer,
  Undo2,
  ZoomIn,
} from 'lucide-react' // Row icons
import { Button } from '@/components/ui/button' // Ghost row buttons
import { cn } from '@/lib/utils' // Class merge
import { applyMenuPlacement, watchMenuSafeRect } from '@/lib/menu-placement' // Stay in-window, miss top bar / chat

/** Actions the board menu can emit (wired + stubs). */
export type BoardActionId =
  | 'addFrame'
  | 'createPublicTemplate' // Are you sure? then /board/{id}/template
  | 'paste'
  | 'selectAll'
  | 'undo'
  | 'redo'
  | 'zoomToFit'
  | 'zoomTo100'
  | 'copyLink'
  | 'capture' // Capture the current board view

export type BoardActionsMenuProps = {
  x: number // Viewport clientX (click) — menu is portaled fixed so it clears the board stacking context
  y: number // Viewport clientY (click)
  canUndo?: boolean // Enables Undo when history exists
  canRedo?: boolean // Enables Redo when history exists
  canPaste?: boolean // Enables Paste when a frame clipboard exists
  hideLargeOverlapEnabled?: boolean // Ghost big-on-view frames that overlap another
  onHideLargeOverlapChange?: (on: boolean) => void // Persist board-menu toggle
  onAction: (action: BoardActionId) => void // Parent wires create / zoom / undo
  onClose: () => void // Dismiss on Escape / outside
  className?: string
}

type RowDef =
  | {
      kind: 'action'
      id: BoardActionId
      label: string
      shortcut?: string
      icon: React.ReactNode
      disabled?: boolean
    }
  | { kind: 'separator' }
  | {
      kind: 'toggle'
      id: 'hideLargeOverlap'
      label: string
      icon: React.ReactNode
      on: boolean
    }

/** Notion-style switch parked on the right of a toggle row. */
function MenuToggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'ml-auto relative h-4 w-7 shrink-0 rounded-full transition-colors',
        on ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-[left]',
          on ? 'left-3.5' : 'left-0.5'
        )}
      />
    </span>
  )
}

/** Notion-style floating menu for empty-board right-click. */
export function BoardActionsMenu({
  x,
  y,
  canUndo = false,
  canRedo = false,
  canPaste = false,
  hideLargeOverlapEnabled = false,
  onHideLargeOverlapChange,
  onAction,
  onClose,
  className,
}: BoardActionsMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null) // Root for Escape focus

  useEffect(() => {
    rootRef.current?.focus() // Keyboard Escape works immediately
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current // Menu shell
    if (!root) return // Not mounted
    const place = () => applyMenuPlacement(root, { anchorX: x, anchorY: y, openLeft: false, fromExisting: true }) // Keep above-click, then clamp
    place()
    return watchMenuSafeRect(place)
  }, [x, y])

  const rows: RowDef[] = [
    {
      kind: 'action',
      id: 'addFrame',
      label: 'Add frame',
      icon: <Plus className="h-4 w-4" />,
    },
    {
      kind: 'action',
      id: 'createPublicTemplate', // Under Add frame — save this board; opens utility Templates
      label: 'Create public template',
      icon: <LayoutTemplate className="h-4 w-4" />,
    },
    {
      kind: 'action',
      id: 'paste',
      label: 'Paste',
      shortcut: '⌘V',
      icon: <ClipboardPaste className="h-4 w-4" />,
      disabled: !canPaste,
    },
    { kind: 'separator' },
    {
      kind: 'action',
      id: 'selectAll',
      label: 'Select all',
      shortcut: '⌘A',
      icon: <SquareMousePointer className="h-4 w-4" />,
    },
    { kind: 'separator' },
    {
      kind: 'action',
      id: 'undo',
      label: 'Undo',
      shortcut: '⌘Z',
      icon: <Undo2 className="h-4 w-4" />,
      disabled: !canUndo,
    },
    {
      kind: 'action',
      id: 'redo',
      label: 'Redo',
      shortcut: '⌘⇧Z',
      icon: <Redo2 className="h-4 w-4" />,
      disabled: !canRedo,
    },
    { kind: 'separator' },
    {
      kind: 'action',
      id: 'zoomToFit',
      label: 'Zoom to fit',
      shortcut: '⇧1',
      icon: <Maximize2 className="h-4 w-4" />,
    },
    {
      kind: 'action',
      id: 'zoomTo100',
      label: 'Zoom to 100%',
      shortcut: '⇧0',
      icon: <ZoomIn className="h-4 w-4" />,
    },
    { kind: 'separator' },
    {
      kind: 'toggle',
      id: 'hideLargeOverlap',
      label: 'Hide large overlapping',
      icon: <EyeOff className="h-4 w-4" />,
      on: hideLargeOverlapEnabled,
    },
    { kind: 'separator' },
    {
      kind: 'action',
      id: 'copyLink',
      label: 'Copy link',
      icon: <Link2 className="h-4 w-4" />,
    },
    {
      kind: 'action',
      id: 'capture',
      label: 'Capture',
      icon: <Scan className="h-4 w-4" />,
    },
  ]

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={cn(
        'board-actions-menu node-popup z-[1000] tt-menu-surface rounded-lg shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-1 outline-none',
        className
      )}
      data-tt-menu-width="240"
      style={{
        position: 'fixed', // Body portal — absolute was trapped under the welcome overlay by board `isolate`
        left: `${x}px`,
        top: `${y}px`,
        right: 'auto',
        width: 240,
        maxWidth: 'min(240px, calc(100vw - 24px))',
        boxSizing: 'border-box',
        transform: 'translate(-50%, -100%)', // Anchor above click
        transformOrigin: 'center bottom',
        marginTop: '-8px',
      }}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onMouseDown={(e) => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="px-2.5 pt-1.5 pb-1 text-xs text-gray-500 dark:text-gray-400">Board</div>

      <div data-tt-menu-body className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-0.5 pb-0.5">
        {rows.map((row, index) => {
          if (row.kind === 'separator') {
            return (
              <div
                key={`sep-${index}`}
                className="my-1 h-px bg-black/10 dark:bg-white/10 mx-1" // Hairline that still reads on the frosted menu
              />
            )
          }
          if (row.kind === 'toggle') {
            return (
              <Button
                key={row.id}
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onHideLargeOverlapChange?.(!row.on) // Flip + keep menu open
                }}
                className="h-8 w-full min-w-0 shrink-0 justify-start gap-0 px-2 text-sm font-normal"
              >
                <span className="mr-2 shrink-0 text-gray-500 dark:text-gray-400">{row.icon}</span>
                <span className="min-w-0 flex-1 truncate text-left">{row.label}</span>
                <MenuToggle on={row.on} />
              </Button>
            )
          }
          return (
            <Button
              key={`${row.id}-${row.label}`}
              variant="ghost"
              size="sm"
              disabled={row.disabled}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (row.disabled) return
                onAction(row.id)
              }}
              className={cn(
                'h-8 w-full min-w-0 shrink-0 justify-start px-2 text-sm font-normal',
                row.disabled && 'opacity-40 pointer-events-none'
              )}
            >
              <span className="mr-2 shrink-0 text-gray-500 dark:text-gray-400">{row.icon}</span>
              <span className="min-w-0 flex-1 truncate text-left">{row.label}</span>
              {row.shortcut && (
                <span className="ml-2 shrink-0 text-[11px] text-gray-400 tabular-nums">{row.shortcut}</span>
              )}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
