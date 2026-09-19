'use client'

// Utility Sets body — named sets, not the Add-to-set picker

import { useMemo, useState, useSyncExternalStore } from 'react'
import { getSetMembers, getSets, subscribeSets, type SetItemKind } from '@/lib/sets-list'
import {
  UtilityFilterOption,
  UtilitySearchHeader,
} from '@/components/utility-search-header'

/** Sets mode body — search + one row per set. */
export function SetsList() {
  const sets = useSyncExternalStore(subscribeSets, getSets, () => []) // Oldest first
  const members = useSyncExternalStore(subscribeSets, getSetMembers, () => []) // Newest first
  const [query, setQuery] = useState('') // Filter by set name
  const [filterOpen, setFilterOpen] = useState(false)
  const [kind, setKind] = useState<SetItemKind | 'all'>('all')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sets.filter((set) => {
      const rows = members.filter((m) => m.setId === set.id)
      if (kind !== 'all' && !rows.some((m) => m.kind === kind)) return false
      if (q && !set.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [sets, members, query, kind])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <UtilitySearchHeader
        query={query}
        onQueryChange={setQuery}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        filterActive={kind !== 'all'}
        filterTitle="Filter sets"
        filterMenu={
          <>
            <UtilityFilterOption
              label="All"
              active={kind === 'all'}
              onSelect={() => {
                setKind('all')
                setFilterOpen(false)
              }}
            />
            <UtilityFilterOption
              label="Frames"
              active={kind === 'frame'}
              onSelect={() => {
                setKind('frame')
                setFilterOpen(false)
              }}
            />
            <UtilityFilterOption
              label="Blocks"
              active={kind === 'block'}
              onSelect={() => {
                setKind('block')
                setFilterOpen(false)
              }}
            />
            <UtilityFilterOption
              label="Text"
              active={kind === 'text'}
              onSelect={() => {
                setKind('text')
                setFilterOpen(false)
              }}
            />
          </>
        }
      />

      {sets.length === 0 ? (
        <div className="flex flex-col gap-1 px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
          <p className="font-medium text-gray-700 dark:text-gray-200">Sets</p>
          <p className="leading-relaxed">
            Use Add to set on a frame, block, or text selection.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 py-2">
          <p className="px-1.5 pb-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            Sets · {visible.length}
          </p>
          {visible.length === 0 ? (
            <p className="px-1.5 py-6 text-center text-xs text-gray-400">No matching sets</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visible.map((set) => (
                <li key={set.id} className="rounded-md px-2 py-1.5">
                  <p className="truncate text-[13px] font-medium text-gray-800 dark:text-gray-100">
                    {set.name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
