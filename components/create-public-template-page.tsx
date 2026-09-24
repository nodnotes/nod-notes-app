'use client'

// Miro-style public template editor — preview + listing form, then publish.

import { useEffect, useState } from 'react' // Prefill + publish busy
import { useRouter } from 'next/navigation' // Exit / return to board
import { useQueryClient } from '@tanstack/react-query' // Refresh utility Templates
import { LayoutTemplate } from 'lucide-react' // Same glyph as the board-menu row
import { Button } from '@/components/ui/button' // Exit + Publish
import { Input } from '@/components/ui/input' // Template name
import { Textarea } from '@/components/ui/textarea' // What the template is for
import {
  boardTemplatesQueryKey,
  publishBoardTemplate,
  readStashedTemplatePreview,
} from '@/lib/board-templates' // Submit frozen snapshot + JPEG from Yes
import { writeUtilityTemplatesFilter } from '@/lib/utility-filter-prefs' // Open Submissions after submit
import { boardTitleOrDefault } from '@/lib/board-title' // Empty name → New board
import { cn } from '@/lib/utils'

type CreatePublicTemplatePageProps = {
  conversationId: string // Source board
  initialTitle: string // conversations.title (or existing template name)
}

/** Full-page Create public template editor (preview left, details right). */
export function CreatePublicTemplatePage({
  conversationId,
  initialTitle,
}: CreatePublicTemplatePageProps) {
  const router = useRouter() // Back to the board after Exit / Publish
  const queryClient = useQueryClient() // Gallery invalidate
  const [title, setTitle] = useState(initialTitle) // Public listing name
  const [description, setDescription] = useState('') // What the template is for (listing copy)
  const [preview, setPreview] = useState<string | null>(null) // JPEG from the live board
  const [publishing, setPublishing] = useState(false) // Disable Publish twice
  const [error, setError] = useState<string | null>(null) // Inline publish failure

  useEffect(() => {
    setPreview(readStashedTemplatePreview(conversationId)) // Cover captured on Yes
  }, [conversationId])

  const goBackToBoard = (templatesOpen = false) => {
    const q = templatesOpen ? '?templates=1' : '' // Open utility Templates after publish
    router.push(`/board/${conversationId}${q}`) // Leave the editor
  }

  const onPublish = async () => {
    if (publishing) return // Already in flight
    setPublishing(true) // Lock the header button
    setError(null) // Clear a prior failure
    try {
      await publishBoardTemplate({
        conversationId, // Source board — stays editable; this snapshot is frozen
        title: boardTitleOrDefault(title), // Listing name
        description, // What the template is for
        previewDataUrl: preview ?? undefined, // Stashed JPEG (skip a second capture)
      })
      writeUtilityTemplatesFilter('submissions') // Show the pending row
      void queryClient.invalidateQueries({ queryKey: boardTemplatesQueryKey() }) // Show the new thumb
      goBackToBoard(true) // Board + Templates tab
    } catch (err) {
      console.error('Create public template failed', err) // Stay on the editor
      setError(err instanceof Error ? err.message : 'Could not create public template')
      setPublishing(false) // Re-enable Publish
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--nod-chat-prompt)]">
      <header
        className="flex h-[52px] shrink-0 items-center gap-3 border-b border-black/10 px-3 dark:border-white/10"
        data-edit-top-bar
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-[13px]"
          onClick={() => goBackToBoard(false)}
        >
          Exit
        </Button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <LayoutTemplate className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
          <h1 className="truncate text-sm font-medium">Create public template</h1>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          disabled={publishing}
          onClick={() => void onPublish()}
        >
          {publishing ? 'Submitting…' : 'Submit'}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <section className="relative min-h-[220px] flex-1 bg-muted/30 p-4 md:min-h-0 md:p-6">
          <div
            className={cn(
              'relative h-full w-full overflow-hidden rounded-xl border border-black/10 bg-background shadow-sm dark:border-white/10'
            )}
            aria-label="Board preview"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <iframe
                title="Board preview"
                src={`/embed/${conversationId}`}
                className="h-full w-full border-0"
                tabIndex={-1}
              />
            )}
          </div>
        </section>

        <aside className="flex w-full shrink-0 flex-col gap-4 overflow-y-auto border-t border-black/10 bg-background p-5 dark:border-white/10 md:w-[360px] md:border-l md:border-t-0">
          <div className="space-y-1.5">
            <label htmlFor="template-name" className="text-[13px] font-medium">
              Template name
            </label>
            <Input
              id="template-name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name this template"
              maxLength={120}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="template-about" className="text-[13px] font-medium">
              Description
            </label>
            <Textarea
              id="template-about"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this template for?"
              rows={5}
              maxLength={800}
            />
          </div>
          <p className="text-[12px] leading-5 text-gray-500 dark:text-gray-400">
            Submit sends a frozen copy for review. Your board stays editable — later changes do not
            update this template. It appears under Submissions until it is approved.
          </p>
          {error ? <p className="text-[13px] text-red-600 dark:text-red-400">{error}</p> : null}
        </aside>
      </div>
    </div>
  )
}
