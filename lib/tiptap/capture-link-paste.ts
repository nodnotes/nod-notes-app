// Paste a capture URL → captureLink inline chip (display name, not raw URL).

import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { formatCaptureTimestamp, getCaptures } from '@/lib/captures'
import {
  captureLinkNodeAttrs,
  extractCaptureUrlFromClipboard,
  parseCaptureUrl,
} from '@/lib/capture-link'

/** Insert a captureLink at the selection when clipboard text is a capture URL. */
export function tryPasteCaptureLink(view: EditorView, textOrUrl: string): boolean {
  const parsed = parseCaptureUrl(textOrUrl)
  if (!parsed) return false
  const captureLink = view.state.schema.nodes.captureLink
  if (!captureLink) return false
  const stored = getCaptures().find((c) => c.id === parsed.id && c.boardId === parsed.boardId)
  const urlHasCamera = /[?&]x=/.test(textOrUrl) && /[?&]y=/.test(textOrUrl) && /[?&]z=/.test(textOrUrl)
  if (!stored && !urlHasCamera) return false
  const source = stored ?? parsed
  const title = stored ? formatCaptureTimestamp(stored.createdAt) : 'Capture'
  const node = captureLink.create(captureLinkNodeAttrs(source, title))
  const { from, to } = view.state.selection
  let tr = view.state.tr
  if (from !== to) tr = tr.deleteRange(from, to)
  tr = tr.replaceSelectionWith(node)
  view.dispatch(tr.scrollIntoView())
  return true
}

/** Shared paste handler for plugin + editorProps. */
export function handleCaptureLinkPaste(view: EditorView, event: ClipboardEvent): boolean {
  const url = extractCaptureUrlFromClipboard(event.clipboardData)
  if (!url) return false
  // Block PM/browser default paste (plain URL slice) before we mutate the doc.
  event.preventDefault()
  event.stopPropagation()
  tryPasteCaptureLink(view, url)
  return true
}

export const CaptureLinkPaste = Extension.create({
  name: 'captureLinkPaste',
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('captureLinkPaste'),
        props: {
          handlePaste(view, event) {
            return handleCaptureLinkPaste(view, event as ClipboardEvent)
          },
        },
      }),
    ]
  },
})
