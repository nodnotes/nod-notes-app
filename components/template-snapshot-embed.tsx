'use client'

// Frozen template snapshot as an embedded BoardFlow — host nav/toolbar apply; edits stay local.

import { useEffect, useRef, useState } from 'react' // Mint the in-memory clone
import { BoardFlow } from '@/components/board-flow' // Same RF board as frame preview
import { EditorProvider } from '@/components/editor-context' // TipTap host
import { ReactFlowContextProvider } from '@/components/react-flow-context'
import { SidebarContextProvider } from '@/components/sidebar-context' // Keep utility/chat closed
import { BoardAccessProvider } from '@/lib/share/board-access-context' // edit so the preview is writable
import {
  mintEphemeralSandboxAt,
  unregisterEphemeralSandbox,
} from '@/lib/ephemeral-sandbox' // In-memory clone keyed by template id
import {
  fetchBoardTemplateSnapshot,
  TEMPLATE_PREVIEW_EDIT_MESSAGE,
} from '@/lib/board-templates' // Session GET of snapshot JSON + first-edit ping
import { PREVIEW_HOST_TOOLS_MESSAGE } from '@/lib/preview-host-tools' // Draw-tool flag from the host

type TemplateSnapshotEmbedProps = {
  templateId: string // board_templates.id — also the sandbox / preview-frame id
}

/** Lean embed: load snapshot → sandbox at templateId → BoardFlow (embedded, editable, unsaved). */
export function TemplateSnapshotEmbed({ templateId }: TemplateSnapshotEmbedProps) {
  const [sandboxId, setSandboxId] = useState<string | null>(null) // Ephemeral conversation id
  const [failed, setFailed] = useState(false) // Missing snapshot / forbidden
  const warnedRef = useRef(false) // One first-edit ping per mount
  const drawingRef = useRef(false) // Host draw tool is armed

  useEffect(() => {
    let cancelled = false // Ignore late resolves
    let registeredId: string | null = null // Cleanup unregister
    setSandboxId(null) // Clear while reminting
    setFailed(false)
    warnedRef.current = false // New clone — allow the note again
    void fetchBoardTemplateSnapshot(templateId).then((snapshot) => {
      if (cancelled) return
      if (!snapshot) {
        setFailed(true) // Empty / 404
        return
      }
      const id = mintEphemeralSandboxAt(snapshot, templateId) // Host `[data-page-preview-frame]` matches
      registeredId = id
      if (cancelled) {
        unregisterEphemeralSandbox(id) // Minted after unmount
        return
      }
      setSandboxId(id) // Mount the playground
    })
    return () => {
      cancelled = true
      if (registeredId) unregisterEphemeralSandbox(registeredId) // Drop clone
      setSandboxId(null)
    }
  }, [templateId])

  // First local edit → host shows “won’t be saved” (snapshot stays frozen)
  useEffect(() => {
    if (!sandboxId || typeof window === 'undefined' || window.parent === window) return
    const notify = () => {
      if (warnedRef.current) return // Once per open
      warnedRef.current = true
      window.parent.postMessage(
        { type: TEMPLATE_PREVIEW_EDIT_MESSAGE, pageId: templateId },
        window.location.origin
      )
    }
    const onHostTools = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data as { type?: string; tools?: { isDrawing?: boolean } } | null
      if (!data || data.type !== PREVIEW_HOST_TOOLS_MESSAGE || !data.tools) return
      drawingRef.current = data.tools.isDrawing === true // Shape / ink on the pane
    }
    const onBeforeInput = () => notify() // TipTap typing
    const onPaste = () => notify() // Clipboard into a frame
    const onPointerDown = (event: PointerEvent) => {
      if (drawingRef.current) {
        notify() // Host draw tool on the pane
        return
      }
      const el = event.target instanceof Element ? event.target : null
      if (!el) return
      if (
        el.closest(
          '.react-flow__node, .react-flow__handle, .react-flow__edge, .freehand-overlay'
        )
      ) {
        notify() // Move / thread / ink on existing items
      }
    }
    window.addEventListener('message', onHostTools)
    document.addEventListener('beforeinput', onBeforeInput, true)
    document.addEventListener('paste', onPaste, true)
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('message', onHostTools)
      document.removeEventListener('beforeinput', onBeforeInput, true)
      document.removeEventListener('paste', onPaste, true)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [sandboxId, templateId])

  if (failed) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
        This template has no frozen board to preview.
      </div>
    )
  }
  if (!sandboxId) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
        Loading preview…
      </div>
    )
  }

  return (
    <div className="h-full w-full">
      <EditorProvider>
        <SidebarContextProvider>
          <ReactFlowContextProvider conversationId={sandboxId}>
            <BoardAccessProvider role="edit" boardId={sandboxId}>
              <BoardFlow conversationId={sandboxId} embedded />
            </BoardAccessProvider>
          </ReactFlowContextProvider>
        </SidebarContextProvider>
      </EditorProvider>
    </div>
  )
}
