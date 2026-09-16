// Ephemeral selection of Notion sync highlight spans (grey → light red).

import type { Editor } from '@tiptap/core'

let selectedCount = 0
const listeners = new Set<() => void>()
/** Live TipTap editors for frames in Notion sync review (messageId → editor). */
const notionSyncEditors = new Map<string, Editor>()

function emit() {
  for (const fn of listeners) fn()
}

function recountFromDom(): number {
  if (typeof document === 'undefined') return 0
  return document.querySelectorAll(
    '.ProseMirror span.tt-notion-sync[data-notion-sync-selected="true"]'
  ).length
}

/** Register a frame editor so Keep non red can restore selected spans. */
export function registerNotionSyncEditor(messageId: string, editor: Editor): () => void {
  notionSyncEditors.set(messageId, editor)
  return () => {
    if (notionSyncEditors.get(messageId) === editor) {
      notionSyncEditors.delete(messageId)
    }
  }
}

/** Editors currently showing Notion sync proposals. */
export function getNotionSyncEditors(): Array<{ messageId: string; editor: Editor }> {
  return [...notionSyncEditors.entries()].map(([messageId, editor]) => ({
    messageId,
    editor,
  }))
}

/** Subscribe for review-bar label updates. */
export function subscribeNotionSyncSelection(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

/** Selected highlight count (Accept → Keep non red when > 0). */
export function getNotionSyncSelectedCount(): number {
  return selectedCount
}

/** Re-scan the DOM and notify (after toggle / reject / discard). */
export function refreshNotionSyncSelection(): void {
  selectedCount = recountFromDom()
  emit()
}

/** Clear all selected highlight chrome (DOM attrs; TipTap marks cleared via reject/setContent). */
export function clearNotionSyncSelection(): void {
  if (typeof document === 'undefined') {
    selectedCount = 0
    emit()
    return
  }
  document
    .querySelectorAll('.ProseMirror span.tt-notion-sync[data-notion-sync-selected="true"]')
    .forEach((el) => {
      el.removeAttribute('data-notion-sync-selected')
    })
  selectedCount = 0
  emit()
}

/**
 * Toggle selection on a Notion sync highlight span (DOM mirror for instant paint).
 * Prefer TipTap mark toggle when an editor is available.
 */
export function toggleNotionSyncSpanSelection(span: Element): boolean {
  const on = span.getAttribute('data-notion-sync-selected') === 'true'
  if (on) span.removeAttribute('data-notion-sync-selected')
  else span.setAttribute('data-notion-sync-selected', 'true')
  refreshNotionSyncSelection()
  return !on
}

/**
 * Reject currently selected highlights in the live DOM:
 * del → unwrap (keep local); ins with prev → restore prev; else remove Notion insert.
 * Prefer TipTap rejectSelectedNotionSyncMarks when an editor is registered.
 */
export function rejectSelectedNotionSyncSpansInDom(): number {
  if (typeof document === 'undefined') return 0
  const selected = [
    ...document.querySelectorAll(
      '.ProseMirror span.tt-notion-sync[data-notion-sync-selected="true"]'
    ),
  ]
  let n = 0
  for (const el of selected) {
    const kind = el.getAttribute('data-notion-sync-kind') || 'ins'
    const prev = el.getAttribute('data-notion-prev')
    if (kind === 'del') {
      const delText = el.textContent || ''
      const after = el.nextSibling
      if (
        after instanceof HTMLElement &&
        after.getAttribute?.('data-notion-sync-kind') === 'ins' &&
        after.getAttribute('data-notion-prev') != null &&
        decodeNotionPrevAttr(after.getAttribute('data-notion-prev') || '') === delText
      ) {
        after.remove() // Replacement pair — keep old only
      }
      el.replaceWith(...Array.from(el.childNodes)) // Keep struck local text
    } else if (prev != null && prev !== '') {
      const prevText = decodeNotionPrevAttr(prev)
      const before = el.previousSibling
      if (
        before instanceof HTMLElement &&
        before.getAttribute?.('data-notion-sync-kind') === 'del' &&
        before.textContent === prevText
      ) {
        before.remove() // Avoid duplicate after restore
      }
      el.replaceWith(document.createTextNode(prevText))
    } else {
      el.remove() // Pure Notion insertion — drop it
    }
    n += 1
  }
  refreshNotionSyncSelection()
  return n
}

/** Decode attr-escaped plain stored on data-notion-prev. */
export function decodeNotionPrevAttr(raw: string): string {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}
