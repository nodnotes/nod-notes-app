'use client'

// Shared search chrome for utility Layers / Sets / Views — matches AI chat thread picker

import type { ReactNode } from 'react'
import { ListFilter, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type UtilitySearchHeaderProps = {
  query: string // Live search string
  onQueryChange: (value: string) => void // Update search
  placeholder?: string // Empty by default (icon-only search cue)
  leadingAction?: ReactNode // Optional control left of search
  trailingAction?: ReactNode // Optional control after filter
  filterOpen: boolean // Filter menu visibility
  onFilterOpenChange: (open: boolean) => void // Toggle filter menu
  filterActive?: boolean // Highlight filter when a non-default filter is on
  filterMenu?: ReactNode // Dropdown rows under the filter button
  filterTitle?: string // Filter button tooltip
}

/**
 * Optional leading + search + filter (right) + optional trailing + hairline divider.
 */
export function UtilitySearchHeader({
  query,
  onQueryChange,
  placeholder = '',
  leadingAction,
  trailingAction,
  filterOpen,
  onFilterOpenChange,
  filterActive = false,
  filterMenu,
  filterTitle = 'Filter',
}: UtilitySearchHeaderProps) {
  return (
    <div className="flex-shrink-0">
      {/* pl-1 matches mode-pill px-1; pr-1.5 keeps filter with list ⋯ */}
      <div className="pl-1 pr-1.5 pt-2 pb-2">
        <div className="flex items-center gap-0">
          {leadingAction}
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-[6px] top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /> {/* Ink lines up with the Layers icon in the mode toggle */}
            <Input
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="h-7 rounded-lg border-0 bg-transparent pl-7 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
          <div className="relative flex-shrink-0">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(
                'h-7 w-7 rounded-lg border-0 bg-transparent group',
                filterActive
                  ? 'hover:bg-transparent dark:hover:bg-transparent' // Blue icon stays on a clear button
                  : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
                filterOpen && !filterActive && 'bg-black/[0.06] dark:bg-white/[0.08] text-gray-900 dark:text-gray-100'
              )}
              title={filterTitle}
              aria-label={filterTitle}
              aria-expanded={filterOpen}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onFilterOpenChange(!filterOpen)}
            >
              <ListFilter
                className={cn(
                  'h-4 w-4 transition-colors',
                  filterActive
                    ? 'text-blue-500' // Filter is not All — icon stays blue
                    : 'text-gray-500 group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-gray-100'
                )}
              />
            </Button>
            {filterOpen && filterMenu ? (
              <div className="absolute right-0 top-full z-50 mt-0.5 min-w-[9.5rem] overflow-hidden rounded-md border border-gray-200 bg-[var(--nod-chat-prompt)] py-1 shadow-md dark:border-[#2f2f2f]"> {/* Same chrome grey as the utility body */}
                {filterMenu}
              </div>
            ) : null}
          </div>
          {trailingAction}
        </div>
      </div>
      <div className="mx-1.5 h-px flex-shrink-0 bg-gray-200 dark:bg-[#2f2f2f]" aria-hidden /> {/* Same inset both sides */}
    </div>
  )
}

/** Hairline in a filter menu — organize rows sit under the filter rows. */
export function UtilityFilterDivider() {
  return <div className="mx-2 my-1 h-px bg-gray-200 dark:bg-[#2f2f2f]" role="separator" /> // Same hairline as the search divider
}

/** Hairline under an expanded group / set / deck’s previews — closes the open section before the next header. */
export function UtilitySectionDivider() {
  return (
    <div
      className="mx-1.5 mt-1.5 mb-0.5 h-px flex-shrink-0 bg-gray-200 dark:bg-[#2f2f2f]" // mt + list gap below keep even air; a touch more than a plain gap-1
      role="separator"
      aria-hidden
    />
  )
}

/** Permanent menu name under search, above + Group / + Set / + Deck. Same type as the old empty Layers title. */
export function UtilityMenuTitle({ children }: { children: string }) {
  return (
    <p className="flex-shrink-0 px-3 pt-2 text-xs font-medium text-gray-500 dark:text-gray-400"> {/* Grey title; + row under it is black */}
      {children}
    </p>
  )
}

/** One filter menu row — matches AI chat filter options. Optional icon is the old ⋯ glyph, left of the words. */
export function UtilityFilterOption({
  label,
  icon,
  active,
  disabled,
  onSelect,
}: {
  label: string
  icon?: ReactNode // Leading mark from the old organize ⋯ menu
  active?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-[var(--nod-on-chrome)] disabled:opacity-40', // Wash darker than the utility grey so the row still reads
        active && 'font-medium text-gray-900 dark:text-gray-100'
      )}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      {icon}
      <span className="flex-1">{label}</span>
    </button>
  )
}
