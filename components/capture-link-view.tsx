'use client'

// captureLink NodeView — Scan icon + capture name; click navigates to that camera (Go to capture).

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useRouter } from 'next/navigation'
import { Scan } from 'lucide-react'
import { captureSourceFromNodeAttrs, navigateToCapture } from '@/lib/capture-link'

export function CaptureLinkView({ node, editor }: NodeViewProps) {
  const router = useRouter()
  const title = (node.attrs.title as string) || 'Capture'
  const conversationId = (
    editor.storage as { frameHost?: { conversationId?: string | null } } | undefined
  )?.frameHost?.conversationId ?? undefined

  const onViewCapture = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigateToCapture(captureSourceFromNodeAttrs(node.attrs as Record<string, unknown>), conversationId, router)
  }

  return (
    <NodeViewWrapper
      as="span"
      className="tt-capture-link group inline-flex min-w-0 max-w-full items-center gap-1.5 nokey align-baseline"
      contentEditable={false}
      data-capture-id={node.attrs.captureId || undefined}
      data-board-id={node.attrs.boardId || undefined}
    >
      <Scan className="tt-capture-link-icon h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400" />
      <button
        type="button"
        className="tt-capture-link-label min-w-0 truncate text-left"
        title="View capture"
        onClick={onViewCapture}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {title}
      </button>
    </NodeViewWrapper>
  )
}
