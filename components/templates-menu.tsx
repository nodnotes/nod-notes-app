'use client'

// Utility Templates body — All (approved) + Submissions (pending review)

import { useEffect, useMemo, useState } from 'react' // Filter persist + live search
import { useRouter } from 'next/navigation' // Go to the source board
import { useQuery, useQueryClient } from '@tanstack/react-query' // Gallery list
import { Check, ExternalLink, LayoutTemplate, MoreHorizontal, Trash2, X } from 'lucide-react' // Toggle glyph + review + row ⋯
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
} from '@/components/utility-search-header' // Same chrome as Layers / Sets / Views
import {
  readUtilityTemplatesFilter,
  writeUtilityTemplatesFilter,
  type UtilityTemplatesFilter,
} from '@/lib/utility-filter-prefs' // Remember All / Submissions; set Submissions after submit
import { createClient } from '@/lib/supabase/client' // Current user + reviewer email
import {
  boardTemplatesQueryKey,
  deleteBoardTemplate,
  filterBoardTemplates,
  isTemplateReviewerEmail,
  listBoardTemplates,
  reviewBoardTemplate,
  stashTemplatePreview,
  type BoardTemplate,
} from '@/lib/board-templates' // Frozen gallery + review
import { captureBoardViewImage } from '@/lib/captures' // Cover for /board/{id}/template
import { CreatePublicTemplateConfirmDialog } from '@/components/create-public-template-confirm-dialog' // Are you sure?
import { TemplatePreviewPopup } from '@/components/template-preview-popup' // Click → host-tool preview (edits unsaved)
import { cn } from '@/lib/utils' // Class merge

const moreButtonClass =
  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-black/[0.06] hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-200 [@media(hover:hover)]:opacity-0 data-[state=open]:opacity-100' // Same ⋯ as Layers / Views

type TemplatesPanelProps = {
  conversationId?: string // Current board — Create public template
}

/** Top-right ⋯ — go to the live source board, withdraw pending, or review. */
function TemplateRowMoreMenu({
  template,
  isOwn,
  isReviewer,
  className,
  onChanged,
}: {
  template: BoardTemplate
  isOwn: boolean
  isReviewer: boolean
  className?: string
  onChanged: () => void // Refresh the gallery
}) {
  const router = useRouter() // Open the live source board (not the frozen snapshot)
  const canGo = Boolean(template.conversation_id) // Board may have been deleted
  const canWithdraw = isOwn && template.status === 'pending' // Frozen once approved
  const canReview = isReviewer && template.status === 'pending' // Approve / reject queue

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
          title="Template options"
          aria-label="Template options"
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
            if (!template.conversation_id) return // Board gone
            router.push(`/board/${template.conversation_id}`) // Live board — edits won’t change this template
          }}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Go to board
        </DropdownMenuItem>
        {canReview ? (
          <>
            <DropdownMenuItem
              onSelect={() => {
                void reviewBoardTemplate(template.id, 'approved').then(onChanged) // Public All
              }}
            >
              <Check className="mr-2 h-4 w-4" />
              Approve
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void reviewBoardTemplate(template.id, 'rejected').then(onChanged) // Stay out of All
              }}
            >
              <X className="mr-2 h-4 w-4" />
              Reject
            </DropdownMenuItem>
          </>
        ) : null}
        {canWithdraw || isReviewer ? (
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
            onSelect={() => {
              void deleteBoardTemplate(template.id).then(onChanged) // Withdraw pending
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One template thumb — name bottom-right; click opens preview, click again closes. */
function TemplateRow({
  template,
  selected,
  isOwn,
  isReviewer,
  onPreview,
  onChanged,
}: {
  template: BoardTemplate
  selected: boolean
  isOwn: boolean
  isReviewer: boolean
  onPreview: () => void
  onChanged: () => void
}) {
  return (
    <div className="group/template flex w-full shrink-0 flex-col">
      <div className="relative">
        <button
          type="button"
          className="w-full text-left"
          title={template.title}
          aria-label={selected ? `Close preview ${template.title}` : `Preview ${template.title}`}
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
            {template.preview_data_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- stored JPEG data URL
              <img
                src={template.preview_data_url}
                alt=""
                className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-gray-300">
                <LayoutTemplate className="h-4 w-4" />
              </span>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-1.5 pb-1 pt-5">
              <p className="truncate text-right text-[11px] font-medium text-white">
                {template.title}
              </p>
            </div>
            {template.status === 'pending' || template.status === 'rejected' ? (
              <span
                className={cn(
                  'pointer-events-none absolute left-1 top-1 rounded px-1 py-px text-[10px] font-medium',
                  template.status === 'rejected'
                    ? 'bg-red-500/90 text-white'
                    : 'bg-black/55 text-white'
                )}
              >
                {template.status === 'rejected' ? 'Rejected' : 'In review'}
              </span>
            ) : null}
          </div>
        </button>
        {isOwn || isReviewer ? (
          <TemplateRowMoreMenu
            template={template}
            isOwn={isOwn}
            isReviewer={isReviewer}
            onChanged={onChanged}
            className={cn(
              'absolute right-1.5 top-1.5 z-10 bg-white/90 shadow-sm hover:bg-white dark:bg-[#1a1a1a]/90 dark:hover:bg-[#1a1a1a]',
              moreButtonClass,
              'opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/template:opacity-100'
            )}
          />
        ) : null}
      </div>
    </div>
  )
}

/** Utility Templates list — All approved + Submissions pending review. */
export function TemplatesPanel({ conversationId }: TemplatesPanelProps) {
  const router = useRouter() // Open the Miro-style creation page
  const queryClient = useQueryClient() // Invalidate after submit / review / delete
  const [query, setQuery] = useState('') // Live search
  const [filterOpen, setFilterOpen] = useState(false) // Filter menu
  const [scope, setScope] = useState<UtilityTemplatesFilter>(() => readUtilityTemplatesFilter()) // All / Submissions
  const [previewId, setPreviewId] = useState<string | null>(null) // Navigable snapshot popup
  const [publishing, setPublishing] = useState(false) // Create public template in flight
  const [confirmOpen, setConfirmOpen] = useState(false) // Are you sure?
  const [userId, setUserId] = useState<string | null>(null) // Own submissions
  const [isReviewer, setIsReviewer] = useState(false) // easayani@goalfish.io

  useEffect(() => {
    writeUtilityTemplatesFilter(scope) // Remember across tab switches
  }, [scope])

  useEffect(() => {
    const supabase = createClient() // Shared client
    void supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null) // Who is looking at the gallery
      setIsReviewer(isTemplateReviewerEmail(data.user?.email)) // Review queue
    })
  }, [])

  const { data: templates = [] } = useQuery({
    queryKey: boardTemplatesQueryKey(), // Shared with submit / review
    queryFn: listBoardTemplates, // Approved + own + reviewer queue
  })

  const visible = useMemo(
    () => filterBoardTemplates(templates, query, { userId, isReviewer, scope }),
    [templates, query, userId, isReviewer, scope]
  )
  const nothingToShow = visible.length === 0 // Empty copy under + Template
  const previewItem = previewId ? templates.find((t) => t.id === previewId) : undefined // Overlay

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: boardTemplatesQueryKey() }) // Reload gallery
  }

  const onPublish = () => {
    if (!conversationId || publishing) return // Need a board
    setConfirmOpen(true) // Are you sure? then the creation page
  }

  const emptyCopy =
    query.trim()
      ? 'No templates match.'
      : scope === 'submissions'
        ? isReviewer
          ? 'No templates waiting for review.'
          : 'Submit this board from + Template. It stays here until it’s approved.'
        : 'Approved public templates appear here. Your submits sit under Submissions until review.'

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <UtilitySearchHeader
        query={query}
        onQueryChange={setQuery}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        filterActive={scope !== 'all'} // Blue unless All
        filterTitle="Filter templates"
        filterMenu={
          <>
            <UtilityFilterOption
              label="All"
              active={scope === 'all'}
              onSelect={() => {
                setScope('all')
                setFilterOpen(false)
              }}
            />
            <UtilityFilterOption
              label="Submissions"
              active={scope === 'submissions'}
              onSelect={() => {
                setScope('submissions')
                setFilterOpen(false)
              }}
            />
          </>
        }
      />
      <div className="flex h-8 flex-shrink-0 items-center gap-1 pl-[3px] pr-1.5 pt-1">
        <button
          type="button"
          className="flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-[13px] font-medium text-gray-900 disabled:opacity-40 dark:text-gray-100"
          title="Create public template"
          aria-label="Create public template"
          disabled={!conversationId || publishing}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => void onPublish()}
        >
          <LayoutTemplate className="h-4 w-4 flex-shrink-0" />
          Template
        </button>
      </div>
      {nothingToShow ? (
        <div className="px-3 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          {emptyCopy}
        </div>
      ) : null}
      <div className="utility-body-scroll relative min-h-0 flex-1 px-2 pb-1">
        {!nothingToShow ? (
          <ul className="flex flex-col gap-1">
            {visible.map((template) => (
              <li key={template.id}>
                <TemplateRow
                  template={template}
                  selected={previewId === template.id}
                  isOwn={template.user_id === userId}
                  isReviewer={isReviewer}
                  onPreview={() =>
                    setPreviewId((id) => (id === template.id ? null : template.id))
                  }
                  onChanged={refresh}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {previewItem ? (
        <TemplatePreviewPopup template={previewItem} onClose={() => setPreviewId(null)} />
      ) : null}
      <CreatePublicTemplateConfirmDialog
        open={confirmOpen}
        busy={publishing}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          if (!conversationId || publishing) return // Need a board; ignore double Yes
          setPublishing(true) // Lock Yes while the JPEG lands
          void (async () => {
            try {
              const preview = await captureBoardViewImage() // Cover for the creation page
              stashTemplatePreview(conversationId, preview ?? null) // sessionStorage → /template
            } catch (err) {
              console.error('Create public template preview failed', err) // Still open the editor
              stashTemplatePreview(conversationId, null) // Fall back to the live embed
            }
            router.push(`/board/${conversationId}/template`) // Miro-style listing page
          })()
        }}
      />
    </div>
  )
}
