// Collab room naming + public WebSocket URL helpers

/** Hocuspocus document name for a board (conversations.id). */
export function boardCollabRoomName(boardId: string): string {
  return `board:${boardId}` // Must match collab/server.mjs parser
}

/** TipTap Y.XmlFragment field for one frame (messages.id). */
export function frameFragmentField(messageId: string): string {
  return `frame:${messageId}`
}

/** Public WS URL; empty string means collab is disabled for this build. */
export function getHocuspocusUrl(): string {
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_HOCUSPOCUS_URL) {
    return process.env.NEXT_PUBLIC_HOCUSPOCUS_URL.trim()
  }
  return ''
}

/** True when the client should attempt a multiplayer session. */
export function isCollabConfigured(): boolean {
  return getHocuspocusUrl().length > 0
}
