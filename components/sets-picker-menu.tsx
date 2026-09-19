'use client'

// Add-to-set flyout — list of sets + Add set. Not the utility sidebar.

import { useSyncExternalStore } from 'react'
import { Plus } from 'lucide-react' // Add set
import { createSet, getSets, subscribeSets } from '@/lib/sets-list'

/** Rows for the frame / block / text "Add to set" flyout. */
export function SetsPickerMenu({ onChoose }: { onChoose: (setId: string) => void }) {
  const sets = useSyncExternalStore(subscribeSets, getSets, () => []) // Oldest first

  return (
    <div data-tt-menu-scroll className="max-h-60 overflow-y-auto py-1">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
        onMouseDown={(e) => e.preventDefault()} // Keep a text selection alive
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onChoose(createSet().id) // New "Set N", then the caller adds the content
        }}
      >
        <Plus className="h-4 w-4 shrink-0 text-gray-500" />
        <span>Add set</span>
      </button>
      {sets.map((set) => (
        <button
          key={set.id}
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
          onMouseDown={(e) => e.preventDefault()} // Keep a text selection alive
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onChoose(set.id) // Caller adds the frame, block, or text
          }}
        >
          <span className="min-w-0 flex-1 truncate">{set.name}</span>
        </button>
      ))}
    </div>
  )
}
