// Debounced durable snapshot: Yjs layout → messages.metadata.position

import { createClient } from '@/lib/supabase/client'
import type { CollabFrameLayout, CollabThread } from '@/lib/collab/board-doc'

const LAYOUT_DEBOUNCE_MS = 800

let layoutTimer: ReturnType<typeof setTimeout> | null = null
let pendingLayouts: { boardId: string; layouts: Record<string, CollabFrameLayout> } | null =
  null

/** Queue frame position writes to messages.metadata.position (debounced). */
export function scheduleLayoutSnapshot(
  boardId: string,
  layouts: Record<string, CollabFrameLayout>
): void {
  pendingLayouts = { boardId, layouts: { ...(pendingLayouts?.layouts ?? {}), ...layouts } }
  if (layoutTimer) clearTimeout(layoutTimer)
  layoutTimer = setTimeout(() => {
    const batch = pendingLayouts
    pendingLayouts = null
    layoutTimer = null
    if (batch) void flushLayoutSnapshot(batch.boardId, batch.layouts)
  }, LAYOUT_DEBOUNCE_MS)
}

async function flushLayoutSnapshot(
  boardId: string,
  layouts: Record<string, CollabFrameLayout>
): Promise<void> {
  const supabase = createClient()
  const entries = Object.entries(layouts)
  if (entries.length === 0) return
  await Promise.all(
    entries.map(async ([messageId, layout]) => {
      const { data: row } = await supabase
        .from('messages')
        .select('metadata')
        .eq('id', messageId)
        .eq('conversation_id', boardId)
        .maybeSingle()
      if (!row) return
      const meta = { ...((row.metadata as Record<string, unknown>) || {}) }
      meta.position = { x: layout.x, y: layout.y }
      if (layout.zIndex != null) meta.zIndex = layout.zIndex
      await supabase.from('messages').update({ metadata: meta }).eq('id', messageId)
    })
  )
}

/** Persist a thread create/update to panel_edges (matches existing insert shape). */
export async function snapshotThread(
  boardId: string,
  thread: CollabThread,
  userId: string
): Promise<void> {
  const supabase = createClient()
  // Prefer upsert by id when the RF edge id is a UUID; else insert by endpoints
  const isUuid = /^[0-9a-f-]{36}$/i.test(thread.id)
  if (isUuid) {
    await supabase.from('panel_edges').upsert(
      {
        id: thread.id,
        conversation_id: boardId,
        source_message_id: thread.source,
        target_message_id: thread.target,
        metadata: thread.metadata ?? {},
        user_id: userId,
      },
      { onConflict: 'id' }
    )
    return
  }
  await supabase.from('panel_edges').upsert(
    {
      conversation_id: boardId,
      source_message_id: thread.source,
      target_message_id: thread.target,
      metadata: thread.metadata ?? {},
      user_id: userId,
    },
    { onConflict: 'source_message_id,target_message_id' }
  )
}

/** Delete a thread row when removed from Yjs. */
export async function deleteThreadSnapshot(
  boardId: string,
  thread: { id?: string; source: string; target: string }
): Promise<void> {
  const supabase = createClient()
  if (thread.id && /^[0-9a-f-]{36}$/i.test(thread.id)) {
    await supabase.from('panel_edges').delete().eq('id', thread.id)
    return
  }
  await supabase
    .from('panel_edges')
    .delete()
    .eq('conversation_id', boardId)
    .eq('source_message_id', thread.source)
    .eq('target_message_id', thread.target)
}
