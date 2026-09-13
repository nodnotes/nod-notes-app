// Message ids spawned via the I-bar / grip in THIS tab session.
// Collaboration must not bind to these until reload — remounting with Yjs after create
// merges a ghost first-keystroke paragraph into the seeded doc (`<p>t</p><p>testt</p>`).

const liveCreateIds = new Set<string>()

/** Call when an optimistic I-bar / grip frame is mounted. */
export function markIbarLiveCreate(messageId: string): void {
  liveCreateIds.add(messageId)
}

/** True while this tab still owns the in-session create (survives fadeIn forever-flag). */
export function isIbarLiveCreate(messageId: string | undefined | null): boolean {
  return !!messageId && liveCreateIds.has(messageId)
}
