'use client'

// Shared search chrome for utility Layers / Sets / Capture — matches AI chat thread picker

import type { ReactNode } from 'react'
import { ListFilter, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type UtilitySearchHeaderProps = {
  query: string // Live search string
  onQueryChange: (value: string) => void // Update search
  placeholder?: string // Default: Search anything…
  filterOpen: boolean // Filter menu visibility
  onFilterOpenChange: (open: boolean) => void // Toggle filter menu
  filterActive?: boolean // Highlight filter when a non-default filter is on
  filterMenu?: ReactNode // Dropdown rows under the filter button
  filterTitle?: string // Filter button tooltip
}

/**
 * Search (left) + filter (right) + hairline divider — same layout as the AI chat menu search.
 */
export function UtilitySearchHeader({
  query,
  onQueryChange,
  placeholder = 'Search anything...',
  filterOpen,
  onFilterOpenChange,
  filterActive = false,
  filterMenu,
  filterTitle = 'Filter',
}: UtilitySearchHeaderProps) {
  return (
    <div className="flex-shrink-0">
      <div className="px-3 pt-2 pb-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder={placeholder}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="h-8 rounded-lg border-0 bg-transparent pl-7 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
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
                'h-8 w-8 rounded-lg border-0 bg-transparent hover:bg-black/[0.04] dark:hover:bg-white/[0.06] group',
                (filterOpen || filterActive) &&
                  'bg-black/[0.06] dark:bg-white/[0.08] text-gray-900 dark:text-gray-100'
              )}
              title={filterTitle}
              aria-label={filterTitle}
              aria-expanded={filterOpen}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => onFilterOpenChange(!filterOpen)}
            >
              <ListFilter className="h-4 w-4 text-gray-500 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-gray-100" />
            </Button>
            {filterOpen && filterMenu ? (
              <div className="absolute right-0 top-full z-50 mt-0.5 min-w-[9.5rem] overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-md dark:border-[#2f2f2f] dark:bg-[#171717]">
                {filterMenu}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mx-3 h-px flex-shrink-0 bg-gray-200 dark:bg-[#2f2f2f]" aria-hidden />
    </div>
  )
}

/** One filter menu row — matches AI chat filter options. */
export function UtilityFilterOption({
  label,
  active,
  disabled,
  onSelect,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-[var(--nod-tab-hover)] disabled:opacity-40',
        active && 'font-medium text-gray-900 dark:text-gray-100'
      )}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onSelect}
    >
      <span className="flex-1">{label}</span>
    </button>
  )
}
