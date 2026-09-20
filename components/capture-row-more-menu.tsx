'use client'

// Hover ⋯ on a capture preview — go to capture, copy link, or delete the saved view

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Link, MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { copyCaptureLink, navigateToCapture, type CaptureLinkSource } from '@/lib/capture-link'
import { deleteCapture } from '@/lib/captures' // Remove the view, deck membership, and chat pill
import { cn } from '@/lib/utils'

type CaptureRowMoreMenuProps = {
  capture: CaptureLinkSource
  conversationId?: string // Current board — same-board nav skips route change
  className?: string // Absolute top-right chrome from the parent thumb
  onNavigate?: () => void // Close parent popover after go-to
}

/** Top-right ⋯ on a capture preview — same hover reveal as Layers / Sets thumbs. */
export function CaptureRowMoreMenu({
  capture,
  conversationId,
  className,
  onNavigate,
}: CaptureRowMoreMenuProps) {
  const router = useRouter()
  const [copied, setCopied] = useState(false)

  const onCopyLink = async () => {
    try {
      await copyCaptureLink(capture)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard denied — ignore
    }
  }

  const onGoToCapture = () => {
    navigateToCapture(capture, conversationId, router)
    onNavigate?.()
  }

  const onDelete = () => {
    deleteCapture(capture.id) // Thumbnail and any open preview of this id go away
  }

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
          title="Capture options"
          aria-label="Capture options"
          onPointerDown={(e) => e.stopPropagation()} // Don’t start a thumb drag
          onClick={(e) => e.stopPropagation()} // Don’t toggle select
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem
          onSelect={() => {
            onGoToCapture()
          }}
        >
          <ExternalLink className="mr-2 h-4 w-4" />
          Go to capture
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void onCopyLink()
          }}
        >
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Link className="mr-2 h-4 w-4" />}
          {copied ? 'Copied' : 'Copy link'}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
          onSelect={onDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
