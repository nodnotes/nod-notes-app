'use client'

// Hover ⋯ on a capture row — go to capture in-tab; copy link for sharing

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Link, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { copyCaptureLink, navigateToCapture, type CaptureLinkSource } from '@/lib/capture-link'
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
