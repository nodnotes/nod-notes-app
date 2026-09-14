'use client'

// Bottom-of-page edit review bar (AI rainbow + Notion sync grey)
import { Eye, EyeOff, Trash2, Check, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useAiEditSession } from '@/lib/ai/edit-session'
import { cn } from '@/lib/utils'

export function AiEditReviewBar() {
  const {
    pendingEdits,
    previewOriginal,
    setPreviewOriginal,
    saveAll,
    discardAll,
    focusedEditId,
    saveEdit,
    discardEdit,
    setFocusedEditId,
  } = useAiEditSession()
  const [busy, setBusy] = useState(false)

  if (pendingEdits.length === 0) return null

  const focused = focusedEditId
    ? pendingEdits.find((e) => e.id === focusedEditId)
    : null

  const notionCount = pendingEdits.filter((e) => e.source === 'notion').length
  const aiCount = pendingEdits.length - notionCount
  const notionOnly = notionCount > 0 && aiCount === 0
  const label = notionOnly
    ? `${notionCount} Notion sync${notionCount === 1 ? '' : 's'}`
    : aiCount > 0 && notionCount > 0
      ? `${pendingEdits.length} changes`
      : `${pendingEdits.length} AI edit${pendingEdits.length === 1 ? '' : 's'}`

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'absolute bottom-4 left-1/2 -translate-x-1/2 z-30',
        'flex flex-col items-center gap-2 pointer-events-auto'
      )}
    >
      {focused && (
        <div
          className={cn(
            'flex items-center gap-1 rounded-full bg-white/95 dark:bg-[#1a1a1a]/95 border shadow-lg px-2 py-1.5 text-xs',
            focused.source === 'notion'
              ? 'border-gray-300 dark:border-gray-600'
              : 'border-black/10 dark:border-white/10'
          )}
        >
          <span className="px-2 text-gray-600 dark:text-gray-300 max-w-[200px] truncate">
            {focused.summary || (focused.source === 'notion' ? 'Notion sync' : 'Edit')}
          </span>
          <button
            type="button"
            className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-black/[0.06]"
            title={previewOriginal ? 'Show proposed' : 'Show original'}
            onClick={() => setPreviewOriginal(!previewOriginal)}
          >
            {previewOriginal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            disabled={busy}
            className="h-7 px-2 rounded-full flex items-center gap-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            title={focused.source === 'notion' ? 'Keep my version' : 'Remove this change'}
            onClick={() => void run(() => discardEdit(focused.id))}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {focused.source === 'notion' ? 'Keep mine' : 'Remove'}
          </button>
          <button
            type="button"
            disabled={busy}
            className={cn(
              'h-7 px-2 rounded-full flex items-center gap-1 hover:bg-emerald-50 dark:hover:bg-emerald-950/40',
              focused.source === 'notion' ? 'text-gray-800' : 'text-emerald-700'
            )}
            title={focused.source === 'notion' ? 'Accept Notion version' : 'Save this change'}
            onClick={() => void run(() => saveEdit(focused.id))}
          >
            <Check className="h-3.5 w-3.5" />
            {focused.source === 'notion' ? 'Accept' : 'Save'}
          </button>
          <button
            type="button"
            className="h-7 px-2 rounded-full text-gray-500 hover:bg-black/[0.06]"
            onClick={() => setFocusedEditId(null)}
          >
            Done
          </button>
        </div>
      )}

      <div
        className={cn(
          'flex items-center gap-1 rounded-full',
          'bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur',
          'shadow-xl px-2 py-1.5',
          notionOnly
            ? 'border border-gray-300 dark:border-gray-600'
            : 'border border-black/10 dark:border-white/10'
        )}
      >
        <span className="px-2 text-xs font-medium text-gray-700 dark:text-gray-200">{label}</span>
        <button
          type="button"
          className={cn(
            'h-8 w-8 rounded-full flex items-center justify-center transition-colors',
            previewOriginal
              ? 'bg-black/[0.08] dark:bg-white/[0.12]'
              : 'hover:bg-black/[0.06] dark:hover:bg-white/[0.08]'
          )}
          title={previewOriginal ? 'Showing original — click to see edits' : 'Preview original before edits'}
          onClick={() => setPreviewOriginal(!previewOriginal)}
        >
          {previewOriginal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <button
          type="button"
          disabled={busy}
          className="h-8 px-3 rounded-full text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
          title={notionOnly ? 'Keep all local versions' : 'Remove all AI changes'}
          onClick={() => void run(() => discardAll())}
        >
          {notionOnly ? 'Keep mine' : 'Remove changes'}
        </button>
        <button
          type="button"
          disabled={busy}
          className={cn(
            'h-8 px-3 rounded-full text-xs font-medium text-white disabled:opacity-50 flex items-center gap-1.5',
            notionOnly
              ? 'bg-gray-700 hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500'
              : 'bg-[#2383e2] hover:bg-[#1a6fc9]'
          )}
          title={notionOnly ? 'Accept all Notion updates' : 'Save all AI changes'}
          onClick={() => void run(() => saveAll())}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {notionOnly ? 'Accept all' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}
