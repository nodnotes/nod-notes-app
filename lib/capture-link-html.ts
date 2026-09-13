// Serialize captureLink atoms into frame HTML (I-bar spawn + paste).

import { formatCaptureTimestamp, getCaptures } from '@/lib/captures'
import { captureLinkNodeAttrs, parseCaptureUrl } from '@/lib/capture-link'

function escAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

/** If `text` is a capture URL, return frame HTML with a captureLink chip instead of raw text. */
export function captureLinkHtmlFromText(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const parsed = parseCaptureUrl(trimmed)
  if (!parsed) return null
  const stored = getCaptures().find((c) => c.id === parsed.id && c.boardId === parsed.boardId)
  const urlHasCamera = /[?&]x=/.test(trimmed) && /[?&]y=/.test(trimmed) && /[?&]z=/.test(trimmed)
  if (!stored && !urlHasCamera) return null
  const source = stored ?? parsed
  const title = stored ? formatCaptureTimestamp(stored.createdAt) : 'Capture'
  const a = captureLinkNodeAttrs(source, title)
  const rot =
    Math.abs(Number(a.rotation || 0)) > 0.05 ? ` data-rot="${escAttr(String(a.rotation))}"` : ''
  const nav = a.scrollMode === 'zoom' ? ' data-nav="zoom"' : ' data-nav="scroll"'
  return `<p><span data-type="captureLink" class="tt-capture-link" data-capture-id="${escAttr(String(a.captureId))}" data-board-id="${escAttr(String(a.boardId))}" data-title="${escAttr(title)}" data-x="${a.viewportX}" data-y="${a.viewportY}" data-z="${a.viewportZoom}"${rot}${nav}></span></p>`
}
