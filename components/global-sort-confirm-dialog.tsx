'use client'

// Confirm before opening Actions Sort with no table frame selected (board-wide / ambient).

import { useState } from 'react'
import { Globe } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { setGlobalSortSkipConfirm } from '@/lib/global-sort-confirm'
import { cn } from '@/lib/utils'

type GlobalSortConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void // User chose to proceed with global Sort
}

export function GlobalSortConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: GlobalSortConfirmDialogProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false) // Checkbox for this open

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setDontShowAgain(false) // Reset checkbox on close
        onOpenChange(next)
      }}
    >
      <DialogContent
        className={cn('max-w-sm gap-3 p-4 sm:rounded-xl', '[&>button]:hidden')}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-[#2a2a2a] dark:text-gray-300">
            <Globe className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 space-y-1">
            <DialogTitle className="text-base font-semibold">Global sort?</DialogTitle>
            <DialogDescription className="text-[13px] text-gray-600 dark:text-gray-400">
              No table frame is selected. This sort will apply to the table on this board. Are you
              sure?
            </DialogDescription>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 pt-1 text-[13px] text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
          />
          Don&apos;t show again
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
            onClick={() => {
              if (dontShowAgain) setGlobalSortSkipConfirm(true) // Persist opt-out
              setDontShowAgain(false)
              onOpenChange(false)
              onConfirm() // Open the Sort strip
            }}
          >
            Sort
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
