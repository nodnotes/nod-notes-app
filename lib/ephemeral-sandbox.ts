// Visitor playgrounds: clone a public master board into memory with fresh ids.
// Masters stay owned in Supabase; sandboxes never persist and die on reload.

import type { PublicBoardPayload } from '@/lib/public-board-fetch'

/** In-memory sandboxes keyed by the ephemeral conversation id. */
const sandboxes = new Map<string, PublicBoardPayload>()

/** Message id → sandbox conversation id (for placement/content patches). */
const messageOwner = new Map<string, string>()

/** True when this conversation id is a visitor clone, not a real DB board. */
export function isEphemeralSandboxId(id: string | null | undefined): boolean {
  return !!id && sandboxes.has(id) // Only registered clones
}

/** Read the cloned payload for a sandbox conversation id. */
export function getEphemeralSandbox(id: string): PublicBoardPayload | undefined {
  return sandboxes.get(id) // Undefined if unregistered / already torn down
}

/** Drop a sandbox when its React tree unmounts (reload mints a new one). */
export function unregisterEphemeralSandbox(sandboxId: string): void {
  const payload = sandboxes.get(sandboxId) // Frames belonging to this clone
  if (payload) {
    for (const msg of payload.messages) messageOwner.delete(msg.id) // Free reverse index
  }
  sandboxes.delete(sandboxId) // Forget the clone
}

/** Remap one id through the clone map, minting a UUID the first time. */
function mapId(idMap: Map<string, string>, id: string): string {
  const existing = idMap.get(id) // Already remapped in this clone
  if (existing) return existing
  const next = crypto.randomUUID() // Fresh id — no row in Supabase
  idMap.set(id, next)
  return next
}

export type ClonePublicBoardKind = 'ephemeral' | 'owned' // In-memory playground vs persisted user copy

/** Conversation metadata for a remapped clone (ephemeral visit or owned claim). */
function cloneConversationMetadata(
  master: PublicBoardPayload,
  kind: ClonePublicBoardKind
): Record<string, unknown> {
  const base = master.conversation.metadata
    ? (JSON.parse(JSON.stringify(master.conversation.metadata)) as Record<string, unknown>)
    : {} // Deep-copy prefs (font, rule, …) without sharing the master object
  delete base.is_showcase // Copies are private boards, not public masters
  delete base.is_ephemeral_sandbox // Clear before re-applying for ephemeral
  delete base.master_board_id // Legacy ephemeral key
  delete base.showcase_source_id // Re-set below for owned copies
  if (kind === 'ephemeral') {
    return {
      ...base,
      is_ephemeral_sandbox: true, // Mark clone for prefs / debugging
      master_board_id: master.conversation.id, // Which master this visit forked from
    }
  }
  return {
    ...base,
    showcase_source_id: master.conversation.id, // Idempotent claim lookup
    position: -1, // Pin near top of the boards list like a new board
  }
}

/**
 * Deep-clone a public master payload with new conversation + message + node ids.
 * Edge endpoints follow the message remap so threads still connect.
 */
export function clonePublicBoardPayload(
  master: PublicBoardPayload,
  sandboxId: string,
  kind: ClonePublicBoardKind = 'ephemeral' // Default keeps homepage /view sandboxes local
): PublicBoardPayload {
  const idMap = new Map<string, string>() // Master message/node id → clone id
  const messages = master.messages.map((msg) => {
    const id = mapId(idMap, msg.id) // New message id
    return {
      ...msg,
      id,
      metadata: msg.metadata
        ? (JSON.parse(JSON.stringify(msg.metadata)) as Record<string, unknown>)
        : null, // Deep-copy metadata so position edits stay local
    }
  })
  const edges = master.edges.map((edge) => ({
    ...edge,
    source_message_id: mapId(idMap, edge.source_message_id), // Remap source frame
    target_message_id: mapId(idMap, edge.target_message_id), // Remap target frame
    metadata: edge.metadata
      ? (JSON.parse(JSON.stringify(edge.metadata)) as unknown)
      : edge.metadata, // Deep-copy thread path metadata
  }))
  const canvasNodes = master.canvasNodes.map((node) => ({
    ...node,
    id: mapId(idMap, node.id), // New drawing id
    data: node.data ? (JSON.parse(JSON.stringify(node.data)) as unknown) : node.data,
  }))
  return {
    conversation: {
      id: sandboxId, // Clone conversation id (ephemeral or new owned row)
      title: master.conversation.title,
      metadata: cloneConversationMetadata(master, kind), // Kind-specific provenance flags
    },
    messages,
    edges,
    canvasNodes,
  }
}

/** Register a clone and index its message ids for local patches. */
export function registerEphemeralSandbox(
  sandboxId: string,
  payload: PublicBoardPayload
): void {
  sandboxes.set(sandboxId, payload) // Store clone
  for (const msg of payload.messages) messageOwner.set(msg.id, sandboxId) // Reverse lookup
}

/** Fetch master → clone → register. Returns the sandbox conversation id. */
export function mintEphemeralSandbox(master: PublicBoardPayload): string {
  const sandboxId = crypto.randomUUID() // Ephemeral board id for this visit
  const payload = clonePublicBoardPayload(master, sandboxId) // Remap all row ids
  registerEphemeralSandbox(sandboxId, payload) // Publish to the registry
  return sandboxId
}

/** Patch a cloned message in memory (positions, content). No DB write. */
export function patchEphemeralMessage(
  messageId: string,
  patch: { content?: string; metadata?: Record<string, unknown> }
): boolean {
  const sandboxId = messageOwner.get(messageId) // Which clone owns this frame
  if (!sandboxId) return false
  const payload = sandboxes.get(sandboxId)
  if (!payload) return false
  const idx = payload.messages.findIndex((m) => m.id === messageId)
  if (idx < 0) return false
  const prev = payload.messages[idx]
  payload.messages[idx] = {
    ...prev,
    content: patch.content !== undefined ? patch.content : prev.content,
    metadata:
      patch.metadata !== undefined
        ? patch.metadata
        : prev.metadata
          ? ({ ...prev.metadata } as Record<string, unknown>)
          : null,
  }
  return true // Patched in memory
}

/** True when this message id belongs to a visitor sandbox. */
export function isEphemeralMessageId(messageId: string): boolean {
  return messageOwner.has(messageId)
}

/** Read a cloned message (for local metadata merges before patch). */
export function getEphemeralMessage(messageId: string): {
  id: string
  role: string
  content: string
  created_at: string
  metadata: Record<string, unknown> | null
} | null {
  const sandboxId = messageOwner.get(messageId)
  if (!sandboxId) return null
  const payload = sandboxes.get(sandboxId)
  if (!payload) return null
  return payload.messages.find((m) => m.id === messageId) || null
}
