// Persist a private copy of a homepage showcase master for a signed-in user.
// Called only when they open a board from the homepage — never on preview alone.

import type { SupabaseClient } from '@supabase/supabase-js'
import { clonePublicBoardPayload } from '@/lib/ephemeral-sandbox'
import { fetchPublicBoard } from '@/lib/public-board-fetch'
import { isPublicBoardId } from '@/lib/public-showcase-boards'

export type ClaimShowcaseResult = {
  boardId: string // Owned master or newly claimed copy
  created: boolean // True only when a new conversations row was inserted
}

/** Look up an existing per-user copy of this showcase master. */
async function findExistingCopy(
  supabase: SupabaseClient,
  userId: string,
  masterBoardId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .contains('metadata', { showcase_source_id: masterBoardId }) // Provenance from claim
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.id ?? null
}

/**
 * Return the user's board for this showcase master: the master itself if they own it,
 * an existing claim, or a fresh remapped copy (messages + threads + drawings).
 */
export async function claimShowcaseBoard(
  supabase: SupabaseClient,
  userId: string,
  masterBoardId: string
): Promise<ClaimShowcaseResult> {
  if (!isPublicBoardId(masterBoardId)) {
    throw new Error('Board is not a public showcase master')
  }

  // Showcase owner opens the canonical board — no duplicate
  const { data: ownedMaster, error: ownedErr } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', masterBoardId)
    .eq('user_id', userId)
    .maybeSingle()
  if (ownedErr) throw ownedErr
  if (ownedMaster?.id) return { boardId: ownedMaster.id, created: false }

  const existingId = await findExistingCopy(supabase, userId, masterBoardId)
  if (existingId) return { boardId: existingId, created: false }

  const master = await fetchPublicBoard(masterBoardId) // Service-role read of goalfish master
  if (!master) throw new Error('Showcase board not found')

  const boardId = crypto.randomUUID() // New owned conversation id
  const clone = clonePublicBoardPayload(master, boardId, 'owned') // Remap frame/thread/drawing ids

  const { error: convErr } = await supabase.from('conversations').insert({
    id: boardId,
    user_id: userId,
    title: clone.conversation.title || 'Board',
    metadata: clone.conversation.metadata || {},
  })
  if (convErr) {
    // Concurrent double-click — another claim may have won; reuse it
    const raced = await findExistingCopy(supabase, userId, masterBoardId)
    if (raced) return { boardId: raced, created: false }
    throw convErr
  }

  if (clone.messages.length > 0) {
    const { error: msgErr } = await supabase.from('messages').insert(
      clone.messages.map((m) => ({
        id: m.id, // Explicit so threads remap in one pass
        conversation_id: boardId,
        user_id: userId,
        role: m.role,
        content: m.content,
        metadata: m.metadata || {},
      }))
    )
    if (msgErr) throw msgErr
  }

  if (clone.edges.length > 0) {
    const edgeRows = clone.edges.map((e) => ({
      conversation_id: boardId,
      user_id: userId,
      source_message_id: e.source_message_id,
      target_message_id: e.target_message_id,
      metadata: (e.metadata as Record<string, unknown> | null) || {},
    }))
    const { error: edgeErr } = await supabase.from('panel_edges').insert(edgeRows)
    if (edgeErr) throw edgeErr
  }

  if (clone.canvasNodes.length > 0) {
    const { error: canvasErr } = await supabase.from('canvas_nodes').insert(
      clone.canvasNodes.map((n) => ({
        id: n.id,
        conversation_id: boardId,
        user_id: userId,
        node_type: n.node_type,
        position_x: n.position_x,
        position_y: n.position_y,
        width: n.width,
        height: n.height,
        data: n.data ?? {},
      }))
    )
    if (canvasErr) throw canvasErr
  }

  return { boardId, created: true }
}
