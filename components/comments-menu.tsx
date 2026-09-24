'use client'

// Utility Comments body — board comments list (shell until threads land here)

import { useState } from 'react' // Live search + filter popover
import {
  UtilityFilterOption,
  UtilitySearchHeader,
} from '@/components/utility-search-header' // Same chrome as Views / Templates

type CommentsPanelProps = {
  conversationId?: string // Current board — This board filter needs an id
}

/** Comments menu — search + All / This board; empty until comments are listed here. */
export function CommentsPanel({ conversationId }: CommentsPanelProps) {
  const [query, setQuery] = useState('') // Search string (no list yet)
  const [filterOpen, setFilterOpen] = useState(false) // Filter popover
  const [thisBoardOnly, setThisBoardOnly] = useState(false) // All boards unless scoped

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <UtilitySearchHeader
        query={query}
        onQueryChange={setQuery}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        filterActive={thisBoardOnly} // Blue when limited to this board
        filterTitle="Filter comments"
        filterMenu={
          <>
            <UtilityFilterOption
              label="All boards"
              active={!thisBoardOnly}
              onSelect={() => {
                setThisBoardOnly(false) // Show every board
                setFilterOpen(false)
              }}
            />
            <UtilityFilterOption
              label="This board"
              active={thisBoardOnly}
              disabled={!conversationId} // No board yet — nothing to scope to
              onSelect={() => {
                if (!conversationId) return
                setThisBoardOnly(true) // Limit to the open board
                setFilterOpen(false)
              }}
            />
          </>
        }
      />
      <div className="px-3 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        {query.trim()
          ? 'No comments match.'
          : 'Comments on frames appear here.'}
      </div>
    </div>
  )
}
