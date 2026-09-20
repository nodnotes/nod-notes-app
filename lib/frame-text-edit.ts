// Frame select vs text edit: Delete removes the frame until the user places a caret.

let textEditFrameId: string | null = null // Host RF node id while TipTap owns Backspace/Delete
let suppressAutoSelectUntil = 0 // Pane tap deselect — ignore TipTap focus briefly so the frame stays off

/** Mark that this frame has an intentional caret (second click / typing handoff). */
export function setFrameTextEditActive(frameId: string | null): void {
  textEditFrameId = frameId // Remember which frame is in text-edit mode
}

/** True when Delete/Backspace should edit TipTap text instead of removing the frame. */
export function isFrameTextEditActive(frameId?: string | null): boolean {
  if (!textEditFrameId) return false // No caret placed — frame Delete wins
  if (frameId) return textEditFrameId === frameId // Match this host only
  return true // Any frame is text-editing
}

/** Clear on frame select / deselect so first-select Delete removes the frame. */
export function clearFrameTextEditActive(): void {
  textEditFrameId = null // Back to select-before-caret
}

/**
 * After an empty-board tap clears selection, TipTap blur/focus can lag one tick and
 * `handleEditorActiveChange(true)` immediately re-selects the frame (feels like deselect
 * needs several taps). Suppress auto-select for a short window.
 */
export function suppressEditorAutoSelect(ms = 400): void {
  suppressAutoSelectUntil = Date.now() + ms
}

/** True while pane-deselect guard is active — skip editor-driven re-select. */
export function isEditorAutoSelectSuppressed(): boolean {
  return Date.now() < suppressAutoSelectUntil
}
