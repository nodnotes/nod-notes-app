'use client'

// Add-to-set flyout — list of sets + Add set. Not the utility sidebar.
// Add set leaves the I-bar in the new name; the frame is stored when that edit ends.

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Plus } from 'lucide-react' // Add set
import { createSet, getSets, renameSet, subscribeSets } from '@/lib/sets-list'

/** Rows for the frame menu "Add to set" flyout. */
export function SetsPickerMenu({ onChoose }: { onChoose: (setId: string) => void }) {
  const sets = useSyncExternalStore(subscribeSets, getSets, () => []) // Oldest first
  const [namingId, setNamingId] = useState<string | null>(null) // Set whose name is open for the I-bar
  const nameRef = useRef<HTMLInputElement>(null) // Focus target for the new name
  const committed = useRef(false) // Enter and the following blur must not add the frame twice

  useLayoutEffect(() => {
    if (!namingId) return
    const el = nameRef.current
    if (!el) return
    el.focus() // I-bar in the new name (phone keyboard too)
    el.select() // Generated "Set N" is ready to replace
    el.scrollIntoView({ block: 'nearest' }) // New row is last — keep it on screen
  }, [namingId])

  const finish = (id: string, raw?: string) => {
    if (committed.current) return // Blur after Enter
    committed.current = true
    if (raw !== undefined) renameSet(id, raw) // Blank keeps "Set N"
    onChoose(id) // Caller stores the frame and closes the menu
  }

  return (
    <div data-tt-menu-scroll className="max-h-60 overflow-y-auto py-1">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
        onMouseDown={(e) => e.preventDefault()} // Keep a text selection alive
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          const created = createSet() // "Set N" — named here before the frame is stored
          setNamingId(created.id)
        }}
      >
        <Plus className="h-4 w-4 shrink-0 text-gray-500" />
        <span>Add set</span>
      </button>
      {sets.map((set) =>
        namingId === set.id ? (
          <input
            key={set.id}
            ref={nameRef}
            data-set-name // Frame menu must not swallow this field's I-bar
            defaultValue={set.name}
            aria-label="Set name"
            autoComplete="off"
            className="w-full rounded-md bg-gray-100 px-2 py-1.5 text-sm text-gray-900 outline-none caret-gray-900 dark:bg-[#2a2a2a] dark:text-gray-100 dark:caret-gray-100"
            onMouseDown={(e) => e.stopPropagation()} // Let the click place the I-bar
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation() // Backspace must edit the name, not delete the frame
              if (e.key === 'Enter') {
                e.preventDefault()
                finish(set.id, e.currentTarget.value)
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                finish(set.id) // Keep the generated name
              }
            }}
            onBlur={(e) => finish(set.id, e.currentTarget.value)}
          />
        ) : (
          <button
            key={set.id}
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
            onMouseDown={(e) => e.preventDefault()} // Keep a text selection alive
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onChoose(set.id) // Caller adds the frame
            }}
          >
            <span className="min-w-0 flex-1 truncate">{set.name}</span>
          </button>
        )
      )}
    </div>
  )
}
