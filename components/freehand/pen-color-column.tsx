'use client'

/**
 * Draw-bar ink column: swatches + “+”. Re-clicking the selected swatch toggles our
 * color menu (color well + transparency + remove). Parent passes `active` so the flyout
 * clears when the dropdown closes.
 */
import { useEffect, useState } from 'react'
import { Circle, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MAX_DRAW_PALETTE_LEN,
  inkAlpha,
  inkRgbHex,
  normalizeInkHex,
  withInkAlpha,
} from '@/components/freehand/ink'

/** Checkerboard behind translucent swatches. */
const ALPHA_CHECKER =
  'linear-gradient(45deg, #d1d5db 25%, transparent 25%), linear-gradient(-45deg, #d1d5db 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #d1d5db 75%), linear-gradient(-45deg, transparent 75%, #d1d5db 75%)'

/** Origin (rightmost) column: 2 swatches, with “+” occupying the 3rd row. */
const ORIGIN_COLUMN_LEN = 2
/** Every overflow column added to the left is a full 3 swatches tall. */
const OVERFLOW_COLUMN_LEN = 3

/**
 * Chunk palette indexes into columns: chunk 0 = origin column (2 + “+”), later chunks = 3 each.
 * Colors always pack from the front, so a delete pulls later swatches up while “+” stays put.
 */
function paletteColumns(length: number): number[][] {
  const columns: number[][] = [[]] // Origin column always exists so “+” has a home
  for (let index = 0; index < length; index += 1) {
    const cap = columns.length === 1 ? ORIGIN_COLUMN_LEN : OVERFLOW_COLUMN_LEN // First column reserves a row for “+”
    if (columns[columns.length - 1].length >= cap) columns.push([]) // Full → start a new column
    columns[columns.length - 1].push(index)
  }
  return columns
}

export type PenColorColumnProps = {
  palette: string[] // Row of ink hexes (`#rrggbb` / `#rrggbbaa`)
  selectedIndex: number // Which swatch is active
  onSelectIndex: (index: number) => void // Click a different swatch → select it
  onChangeAt: (index: number, hex: string) => void // Edit slot from the color menu
  onAdd: (hex: string) => void // “+” appends a new swatch (and selects it)
  onRemove: (index: number) => void // Drop the edited swatch (context keeps ≥1)
  active?: boolean // Parent dropdown open — clear the flyout when it closes
  showLabels?: boolean // Overflow menus show the hex label beside the circle
  className?: string
}

/**
 * Vertical pen swatch column used in Pen / Highlighter dropdowns.
 * Selected re-click toggles the frosted color menu (well + transparency + remove).
 */
export function PenColorColumn({
  palette,
  selectedIndex,
  onSelectIndex,
  onChangeAt,
  onAdd,
  onRemove,
  active = true,
  showLabels = false,
  className,
}: PenColorColumnProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null) // Open color menu for this slot

  // Parent dropdown closed → drop the flyout so the next open starts clean
  useEffect(() => {
    if (!active) setEditingIndex(null)
  }, [active])

  // Drop the editor if the palette shrunk past the open index (allow index === length briefly for “+”)
  useEffect(() => {
    if (editingIndex == null) return
    if (editingIndex < 0 || editingIndex > palette.length) {
      setEditingIndex(null)
      return
    }
    if (editingIndex === palette.length && palette.length > 0) {
      setEditingIndex(palette.length - 1) // Snap to the new last slot after “+”
    }
  }, [editingIndex, palette.length])

  const canAdd = palette.length < MAX_DRAW_PALETTE_LEN
  const canRemove = palette.length > 1 // Always keep at least one ink swatch
  const resolvedEditIndex =
    editingIndex == null
      ? selectedIndex
      : editingIndex >= palette.length
        ? Math.max(0, palette.length - 1)
        : editingIndex
  const editHex = palette[resolvedEditIndex] ?? '#111827'
  const pickerRgb = inkRgbHex(editHex, '#111827')
  const pickerAlpha = inkAlpha(editHex) // 0–1 for the transparency slider
  const menuOpen = active && editingIndex != null

  const applyColor = (hex: string) => {
    const index =
      editingIndex != null && editingIndex < palette.length
        ? editingIndex
        : editingIndex === palette.length
          ? Math.max(0, palette.length - 1)
          : selectedIndex
    onChangeAt(index, hex)
    onSelectIndex(index)
  }

  // Label mode (overflow menus) stays one full-width list; the draw bar chunks into columns
  const columns = showLabels ? [palette.map((_, index) => index)] : paletteColumns(palette.length)
  // Render reversed so chunk 0 (the origin column with “+”) sits rightmost and new columns grow left
  const orderedColumns = [...columns].reverse()

  /** One palette swatch row. */
  const renderSwatch = (hex: string, index: number) => {
    const selected = index === selectedIndex
    const rgb = inkRgbHex(hex, '#111827')
    const alpha = inkAlpha(hex)
    const faded = alpha < 0.999
    return (
          <button
            key={`ink-${index}-${hex || 'transparent'}`}
            type="button"
            title={selected ? (editingIndex === index ? 'Close color' : 'Change color') : 'Select color'}
            className={cn(
              'flex items-center gap-2 rounded-md text-left text-sm outline-none hover:bg-gray-100 dark:hover:bg-gray-800',
              showLabels ? 'w-full px-2 py-1.5' : 'justify-center px-2 py-2', // Draw bar: roomier hit target around bigger dots
              selected && 'bg-gray-100 dark:bg-gray-800'
            )}
            // Do NOT preventDefault — that suppresses click and blocks toggle-close
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (selected) {
                setEditingIndex((prev) => (prev === index ? null : index)) // Re-click closes
                return
              }
              onSelectIndex(index) // Different swatch → select only
              setEditingIndex(null)
            }}
          >
            <span
              className={cn(
                'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-gray-300 dark:border-gray-600',
                showLabels ? 'h-4 w-4' : 'h-6 w-6' // Draw bar swatches are larger; labeled overflow keeps compact
              )}
              style={
                faded
                  ? {
                      backgroundImage: ALPHA_CHECKER,
                      backgroundSize: showLabels ? '6px 6px' : '8px 8px',
                      backgroundPosition: showLabels
                        ? '0 0, 0 3px, 3px -3px, -3px 0'
                        : '0 0, 0 4px, 4px -4px, -4px 0',
                    }
                  : undefined
              }
              aria-hidden
            >
              <Circle
                className={showLabels ? 'h-4 w-4' : 'h-6 w-6'}
                style={{ color: rgb, fill: rgb, opacity: alpha }}
              />
            </span>
            {showLabels ? (
              <span className="truncate font-mono text-[11px] text-gray-500">
                {normalizeInkHex(hex, rgb)}
              </span>
            ) : null}
          </button>
    )
  }

  /* “+” lives in the last row of the origin column, so its position never shifts */
  const addButton = (
    <button
      type="button"
      title="Add color"
      disabled={!canAdd}
      className={cn(
        'flex items-center justify-center rounded-md text-gray-600 outline-none hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100',
        showLabels ? 'w-full justify-start gap-2 px-2 py-1.5' : 'px-2 py-2' // Match bigger swatch row height in the draw bar
      )}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (!canAdd) return
        const seed = palette[selectedIndex] || '#111827'
        onAdd(normalizeInkHex(seed, '#111827') || '#111827') // Append + select in context
        setEditingIndex(palette.length) // Open menu on the new slot (snaps when palette grows)
      }}
    >
      <Plus className={cn('shrink-0', showLabels ? 'h-4 w-4' : 'h-6 w-6')} strokeWidth={2.25} />
      {showLabels ? <span className="text-sm">Add color</span> : null}
    </button>
  )

  return (
    <div
      className={cn(
        'relative flex gap-0.5',
        showLabels ? 'flex-col' : 'items-start', // Columns sit side by side, each packed from the top
        className
      )}
    >
      {orderedColumns.map((indexes, position) => {
        const chunk = orderedColumns.length - 1 - position // 0 = origin column (rendered rightmost)
        return (
          <div
            key={`ink-col-${chunk}`}
            className={cn('flex flex-col gap-0.5', showLabels && 'w-full')}
          >
            {indexes.map((index) => renderSwatch(palette[index] ?? '', index))}
            {chunk === 0 ? addButton : null}
          </div>
        )
      })}

      {menuOpen ? (
        <div
          data-tt-menu-flyout="pen-color"
          className="absolute left-full top-0 z-[1002] ml-1 w-[12rem] overflow-visible tt-menu-surface rounded-lg border border-gray-200 shadow-lg dark:border-[#2f2f2f]"
          onPointerDown={(e) => e.stopPropagation()} // Keep parent dropdown open; don’t cancel clicks
        >
          <div className="flex flex-col gap-2 px-2 py-2">
            <input
              type="color"
              value={pickerRgb}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                e.stopPropagation()
                applyColor(withInkAlpha(e.target.value, pickerAlpha)) // Keep transparency
              }}
              className="h-8 w-full shrink-0 cursor-pointer rounded border border-gray-300 dark:border-gray-600"
              title="Color"
              aria-label="Color"
            />
            <label className="block shrink-0">
              <span className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                <span>Transparency</span>
                <span className="tabular-nums">{Math.round((1 - pickerAlpha) * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round((1 - pickerAlpha) * 100)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation()
                  const transparency = Number(e.target.value) / 100 // 0 = opaque
                  applyColor(withInkAlpha(pickerRgb, 1 - transparency))
                }}
                className="h-1.5 w-full cursor-pointer accent-gray-700 dark:accent-gray-300"
                title="Transparency"
                aria-label="Transparency"
              />
            </label>
            <button
              type="button"
              title={canRemove ? 'Remove color' : 'Keep at least one color'}
              disabled={!canRemove}
              className="w-full rounded-sm px-2 py-1.5 text-left text-sm text-red-600 outline-none hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!canRemove) return
                onRemove(resolvedEditIndex) // Drop this swatch; context picks a neighbor
                setEditingIndex(null) // Close flyout after remove
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
