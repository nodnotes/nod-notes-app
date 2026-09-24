'use client'

// Confirm before leaving the board for the public-template creation page.

import { LayoutTemplate } from 'lucide-react' // Same glyph as Create public template
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type CreatePublicTemplateConfirmDialogProps = {
  open: boolean
  busy?: boolean // Capture + navigate after Yes
  onOpenChange: (open: boolean) => void
  onConfirm: () => void // User chose Yes
}

/** Are-you-sure popup for Create public template. */
export function CreatePublicTemplateConfirmDialog({
  open,
  busy = false,
  onOpenChange,
  onConfirm,
}: CreatePublicTemplateConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return // Don’t dismiss mid-capture
        onOpenChange(next)
      }}
    >
      <DialogContent
        className={cn('max-w-sm gap-3 p-4 sm:rounded-xl', '[&>button]:hidden')}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-[#2a2a2a] dark:text-gray-300">
            <LayoutTemplate className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-base font-semibold">Create public template?</DialogTitle>
            <DialogDescription className="text-[13px] text-gray-600 dark:text-gray-400">
              This board will be public. Anyone signed in can use it as a template. Are you sure?
            </DialogDescription>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-100 disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            onClick={() => {
              onConfirm() // Parent captures the view, then opens the creation page
            }}
          >
            {busy ? 'Opening…' : 'Yes'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
