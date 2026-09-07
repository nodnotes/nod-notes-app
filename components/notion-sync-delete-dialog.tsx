'use client'

// Confirm delete for synced Notion database rows — Thinktable-only vs archive in Notion.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export type NotionSyncDeleteStep = 'choose' | 'confirm-notion'

type NotionSyncDeleteDialogProps = {
  open: boolean
  step: NotionSyncDeleteStep
  rowTitle?: string
  busy?: boolean
  onOpenChange: (open: boolean) => void
  onThinktableOnly: () => void
  onChooseNotion: () => void
  onConfirmNotion: () => void
}

export function NotionSyncDeleteDialog({
  open,
  step,
  rowTitle,
  busy = false,
  onOpenChange,
  onThinktableOnly,
  onChooseNotion,
  onConfirmNotion,
}: NotionSyncDeleteDialogProps) {
  const label = rowTitle?.trim() || 'this row'

  return (
    <Dialog open={open} onOpenChange={busy ? undefined : onOpenChange}>
      <DialogContent
        className={cn(
          'max-w-sm gap-3 p-4 sm:rounded-xl',
          '[&>button]:hidden'
        )}
        onPointerDownOutside={(e) => busy && e.preventDefault()}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
      >
        {step === 'choose' ? (
          <>
            <DialogTitle className="text-base font-semibold">Remove row?</DialogTitle>
            <DialogDescription className="text-[13px] text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span> is synced
              with Notion. Choose what to delete.
            </DialogDescription>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-[13px] font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                onClick={onThinktableOnly}
              >
                Delete only in Thinktable
                <span className="mt-0.5 block text-[11px] font-normal text-gray-500">
                  Hides the row here. Notion is unchanged.
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-left text-[13px] font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
                onClick={onChooseNotion}
              >
                Delete in Notion too
                <span className="mt-0.5 block text-[11px] font-normal text-red-600/80 dark:text-red-400/80">
                  Archives the page in Notion (recoverable from Trash).
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                className="mt-1 text-center text-[12px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <DialogTitle className="text-base font-semibold">Delete in Notion?</DialogTitle>
            <DialogDescription className="text-[13px] text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-800 dark:text-gray-200">{label}</span> will be
              archived in Notion. You can restore it from Notion&apos;s Trash.
            </DialogDescription>
            <p className="text-[12px] text-gray-500">Are you sure?</p>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={busy}
                className="rounded-md px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-md bg-red-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                onClick={onConfirmNotion}
              >
                {busy ? 'Deleting…' : 'Delete in Notion'}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
