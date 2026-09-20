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
import { deleteCapture } from '@/lib/captures' // Remove the view, presentation membership, and chat pill
import { cn } from '@/lib/utils'

type CaptureRowMoreMenuProps = {
  capture: CaptureLinkSource
  conversationId?: string // Current board — same-board nav skips route change
  className?: string
  onNavigate?: () => void // Close parent popover after go-to
}

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
            'h-8 w-6 flex-shrink-0 hover:bg-transparent text-gray-500 hover:text-gray-700',
            className
          )}
          title="Capture options"
          aria-label="Capture options"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
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
          <ExternalLink className="h-4 w-4 mr-2" />
          Go to capture
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            void onCopyLink()
          }}
        >
          {copied ? <Check className="h-4 w-4 mr-2" /> : <Link className="h-4 w-4 mr-2" />}
          {copied ? 'Copied' : 'Copy link'}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400" // Same danger row as presentation Delete
          onSelect={onDelete}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
