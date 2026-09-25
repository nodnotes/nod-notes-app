'use client'

// Utility Changes body — named board saves with JPEG thumbs + live snapshot preview

import { useEffect, useMemo, useState } from 'react' // Filter persist + live search
import { useRouter } from 'next/navigation' // Go to the source board
import { useQuery, useQueryClient } from '@tanstack/react-query' // History list
import { ExternalLink, History, MoreHorizontal, Plus, Trash2 } from 'lucide-react' // + Save, empty thumb, row ⋯
import { Button } from '@/components/ui/button' // Ghost ⋯
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu' // Row options
import {
  UtilityFilterOption,
  UtilitySearchHeader,
  UtilitySectionDivider,
} from '@/components/utility-search-header' // Same chrome as Views / Templates
import {
  readUtilityThisBoardOnly,
  writeUtilityThisBoardOnly,
} from '@/lib/utility-filter-prefs' // Remember All / This board
import {
  boardChangesQueryKey,
  changeDayLabel,
  changeStampIso,
  deleteBoardChange,
  filterBoardChanges,
  listBoardChanges,
  saveBoardChange,
  type BoardChange,
} from '@/lib/board-changes' // Frozen saves + Docs-style grouping
import { captureBoardViewImage, formatCaptureTimestamp } from '@/lib/captures' // Cover JPEG + stamp
import { ChangePreviewPopup } from '@/components/change-preview-popup' // Click → host-tool preview (edits unsaved)
import { cn } from '@/lib/utils' // Class merge

const moreButtonClass =
  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-black/[0.06] hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-200 [@media(hover:hover)]:opacity-0 data-[state=open]:opacity-100' // Same ⋯ as Layers / Views

type ChangesPanelProps = {
  conversationId?: string // Current board — Save + This board filter
}

/** Top-right ⋯ — go to the live source board or delete this save. */
function ChangeRowMoreMenu({
  change,
  className,
  onChanged,
}: {
  change: BoardChange
  className?: string
  onChanged: () => void // Refresh the list
}) {
  const router = useRouter() // Open the live source board (not the frozen snapshot)
  const canGo = Boolean(change.conversation_id) // Board may have been deleted

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-8 w-6 flex-shrink-0 text-gray-500 hover:bg-white hover:text-gray-700 dark:hover:bg-[#1a1a1a]',
            className
          )}
          title="Change options"
          aria-label="Change options"
          onPointerDown={(e) => e.stopPropagation()} // Don’t select the thumb
          onClick={(e) => e.stopPropagation()} // Don’t open preview
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem
          disabled={!canGo}
          onSelect={() => {
            if (!change.conversation_id) return // Board gone
            router.push(`/board/${change.conversation_id}`) // Live board — edits won’t change this save
          }}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Go to board
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
          onSelect={() => {
            void deleteBoardChange(change.id).then(onChanged) // Drop this save
          }}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One change thumb — stamp bottom-right; click opens preview, click again closes. */
function ChangeRow({
  change,
  selected,
  onPreview,
  onChanged,
}: {
  change: BoardChange
  selected: boolean
  onPreview: () => void
  onChanged: () => void
}) {
  const stamp = formatCaptureTimestamp(changeStampIso(change)) // Session autos use last write

  return (
    <div className="group/change flex w-full shrink-0 flex-col">
      <div className="relative">
        <button
          type="button"
          className="w-full text-left"
          title={`${change.title} — ${stamp}`}
          aria-label={selected ? `Close preview ${stamp}` : `Preview ${stamp}`}
          aria-pressed={selected}
          onClick={onPreview}
        >
          <div
            className={cn(
              'relative aspect-[4/3] w-full overflow-hidden rounded-md bg-gray-50 dark:bg-[#1a1a1a]',
              selected
                ? 'border-2 border-blue-500'
                : 'border border-gray-200/80 dark:border-white/10'
            )}
          >
            {change.preview_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- stored JPEG data URL
              <img
                src={change.preview_data_url}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-gray-300">
                <History className="h-4 w-4" />
              </span>
            )}
            {change.kind === 'named' ? (
              <span className="pointer-events-none absolute left-1 top-1 rounded px-1 py-px text-[10px] font-medium bg-black/55 text-white">
                Saved
              </span>
            ) : null}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1 pt-5">
              <p className="truncate text-right text-[11px] font-medium text-white">
                {change.title}
              </p>
              <p className="truncate text-right text-[10px] text-white/85">{stamp}</p>
            </div>
          </div>
        </button>
        <ChangeRowMoreMenu
          change={change}
          onChanged={onChanged}
          className={cn(
            'absolute right-1.5 top-1.5 z-10 bg-white/90 shadow-sm hover:bg-white dark:bg-[#1a1a1a]/90 dark:hover:bg-[#1a1a1a]',
            moreButtonClass,
            'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/change:opacity-100'
          )}
        />
      </div>
    </div>
  )
}

/** Utility Changes list — own saves, JPEG thumbs, live snapshot preview. */
export function ChangesPanel({ conversationId }: ChangesPanelProps) {
  const queryClient = useQueryClient() // Invalidate after save / delete
  const [query, setQuery] = useState('') // Live search
  const [filterOpen, setFilterOpen] = useState(false) // Filter menu
  const [thisBoardOnly, setThisBoardOnly] = useState(() => readUtilityThisBoardOnly('changes')) // All / This board
  const [previewId, setPreviewId] = useState<string | null>(null) // Navigable snapshot popup
  const [saving, setSaving] = useState(false) // + Save in flight

  useEffect(() => {
    writeUtilityThisBoardOnly('changes', thisBoardOnly) // Remember across tab switches
  }, [thisBoardOnly])

  useEffect(() => {
    const onSaved = () => {
      void queryClient.invalidateQueries({ queryKey: boardChangesQueryKey() }) // Idle session landed
    }
    window.addEventListener('nodnotes-board-change-saved', onSaved)
    return () => window.removeEventListener('nodnotes-board-change-saved', onSaved)
  }, [queryClient])

  const { data: changes = [] } = useQuery({
    queryKey: boardChangesQueryKey(), // Shared with save / delete
    queryFn: listBoardChanges, // Own saves, newest first
  })

  const visible = useMemo(
    () => filterBoardChanges(changes, query, { boardId: conversationId, thisBoardOnly }),
    [changes, query, conversationId, thisBoardOnly]
  )
  const dayGroups = useMemo(() => {
    const groups: { label: string; items: BoardChange[] }[] = []
    for (const change of visible) {
      const label = changeDayLabel(changeStampIso(change)) // Today / Yesterday / date
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(change) // Same day
      else groups.push({ label, items: [change] })
    }
    return groups
  }, [visible])
  const nothingToShow = visible.length === 0 // Empty copy under + Save
  const previewItem = previewId ? changes.find((c) => c.id === previewId) : undefined // Overlay

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: boardChangesQueryKey() }) // Reload list
  }

  const onSave = () => {
    if (!conversationId || saving) return // Need a board
    setSaving(true) // Lock + Save while the JPEG + snapshot land
    void (async () => {
      try {
        const preview = await captureBoardViewImage() // Cover for the thumb
        const row = await saveBoardChange({
          conversationId,
          previewDataUrl: preview ?? undefined, // Fall back to a second capture inside save
        })
        refresh()
        setPreviewId(row.id) // Open the live snapshot like Templates
      } catch (err) {
        console.error('Save change failed', err) // Keep the empty / prior list
      } finally {
        setSaving(false) // Unlock + Save
      }
    })()
  }

  const emptyCopy = query.trim()
    ? 'No changes match.'
    : 'Edits appear here after you pause. + Save pins a named version.'

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <UtilitySearchHeader
        query={query}
        onQueryChange={setQuery}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        filterActive={thisBoardOnly} // Blue when limited to this board
        filterTitle="Filter changes"
        filterMenu={
          <>
            <UtilityFilterOption
              label="All boards"
              active={!thisBoardOnly}
              onSelect={() => {
                setThisBoardOnly(false) // Show every save
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
      <div className="flex h-8 flex-shrink-0 items-center gap-1 pl-[3px] pr-1.5 pt-1"> {/* Plus ink lines up with the Layers toggle icon */}
        <button
          type="button"
          className="flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-[13px] font-medium text-gray-900 disabled:opacity-40 dark:text-gray-100" // No hover wash — ink stays flat
          title="New save"
          aria-label="New save"
          disabled={!conversationId || saving} // Checkpoint still needs a board
          onPointerDown={(e) => e.preventDefault()} // Don’t steal board focus
          onClick={() => void onSave()}
        >
          <Plus className="h-4 w-4 flex-shrink-0" /> {/* Same hit target as the word */}
          Save
        </button>
      </div>
      {nothingToShow ? (
        <div className="px-3 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {emptyCopy}
        </div>
      ) : null}
      <div className="utility-body-scroll relative min-h-0 flex-1 px-2 pb-1">
        {!nothingToShow ? (
          <div className="flex flex-col">
            {dayGroups.map((group, index) => (
              <div key={group.label}>
                {index > 0 ? <UtilitySectionDivider /> : null}
                <p className="px-0.5 pb-1 pt-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  {group.label}
                </p>
                <ul className="flex flex-col gap-1">
                  {group.items.map((change) => (
                    <li key={change.id}>
                      <ChangeRow
                        change={change}
                        selected={previewId === change.id}
                        onPreview={() =>
                          setPreviewId((id) => (id === change.id ? null : change.id))
                        }
                        onChanged={refresh}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {previewItem ? (
        <ChangePreviewPopup change={previewItem} onClose={() => setPreviewId(null)} />
      ) : null}
    </div>
  )
}
