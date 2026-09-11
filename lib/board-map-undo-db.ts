// Keep Supabase in sync when map undo/redo restores or removes frames and threads.

import type { QueryClient } from '@tanstack/react-query'
import type { Edge, Node } from 'reactflow'
import { createClient } from '@/lib/supabase/client'
import { boardTitleOrDefault } from '@/lib/board-title'
import { getLinkedBoardId } from '@/lib/blocks'

type BoardMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  metadata?: Record<string, unknown> | null
}

function diffById<T extends { id: string }>(before: T[], after: T[]) {
  const beforeIds = new Set(before.map((x) => x.id))
  const afterIds = new Set(after.map((x) => x.id))
  return {
    appeared: after.filter((x) => !beforeIds.has(x.id)),
    disappeared: before.filter((x) => !afterIds.has(x.id)),
  }
}

function messagesFromNodes(nodes: Node[]): BoardMessage[] {
  const out: BoardMessage[] = []
  const seen = new Set<string>()
  for (const node of nodes) {
    if (node.type === 'chatPanel') {
      const data = node.data as {
        promptMessage?: BoardMessage
        responseMessage?: BoardMessage
      }
      for (const msg of [data.promptMessage, data.responseMessage]) {
        if (!msg?.id || seen.has(msg.id)) continue
        seen.add(msg.id)
        out.push(msg)
      }
      continue
    }
    if (node.type === 'blockGroup') {
      const id = node.id.replace(/^block-group-/, '')
      if (!id || seen.has(id)) continue
      seen.add(id)
      const w = Number((node.style as { width?: number })?.width ?? node.width ?? 200)
      const h = Number((node.style as { height?: number })?.height ?? node.height ?? 120)
      out.push({
        id,
        role: 'user',
        content: '',
        metadata: {
          isBlockGroup: true,
          position: { x: node.position.x, y: node.position.y },
          resizeDimensions: { width: w, height: h },
        },
      })
    }
  }
  return out
}

function patchMessagesCache(queryClient: QueryClient, conversationId: string, messages: BoardMessage[]) {
  if (messages.length === 0) return
  const patch = (old: unknown) => {
    if (!Array.isArray(old)) return old
    const byId = new Map(old.map((m: BoardMessage) => [m.id, m]))
    for (const msg of messages) byId.set(msg.id, msg)
    return Array.from(byId.values())
  }
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId] }, patch)
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId, 'full'] }, patch)
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId, 'embed'] }, patch)
}

/** Drop deleted frame rows from the react-query cache (no refetch — avoids racing undo). */
export function removeMessagesFromCache(
  queryClient: QueryClient,
  conversationId: string,
  messageIds: string[]
) {
  if (messageIds.length === 0) return
  const drop = new Set(messageIds)
  const patch = (old: unknown) => {
    if (!Array.isArray(old)) return old
    return old.filter((m: BoardMessage) => !drop.has(m.id))
  }
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId] }, patch)
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId, 'full'] }, patch)
  queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId, 'embed'] }, patch)
}

export function diffMapNodesById(before: Node[], after: Node[]) {
  return diffById(before, after)
}

/** Sync cache before async DB upsert so the messages→panels effect cannot drop restored frames. */
export function primeRestoredMapNodesInCache(
  queryClient: QueryClient,
  conversationId: string,
  nodes: Node[]
) {
  const messages = messagesFromNodes(nodes)
  patchMessagesCache(queryClient, conversationId, messages)
  return messages
}

export function messagesStructuralKey(messages: Array<{ id: string; role: string }>) {
  return messages.map((m) => `${m.id}:${m.role}`).join(',')
}

async function ensureLinkedBoard(
  supabase: ReturnType<typeof createClient>,
  opts: {
    userId: string
    parentConversationId: string
    linkedBoardId: string
    sourceMessageId: string
    title?: string
  }
) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('id', opts.linkedBoardId)
    .maybeSingle()
  if (existing) return
  await supabase.from('conversations').insert({
    id: opts.linkedBoardId,
    user_id: opts.userId,
    title: boardTitleOrDefault(opts.title || 'New board'),
    metadata: {
      parent_id: opts.parentConversationId,
      sourceBlockMessageId: opts.sourceMessageId,
    },
  })
}

async function restoreNodes(
  conversationId: string,
  nodes: Node[],
  queryClient: QueryClient
) {
  if (nodes.length === 0) return
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const messages = messagesFromNodes(nodes)
  if (messages.length > 0) {
    patchMessagesCache(queryClient, conversationId, messages)
    const rows = messages.map((msg) => ({
      id: msg.id,
      conversation_id: conversationId,
      user_id: user.id,
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata ?? {},
      ...(msg.created_at ? { created_at: msg.created_at } : {}),
    }))
    const { error } = await supabase.from('messages').upsert(rows, { onConflict: 'id' })
    if (error) console.error('Undo restore messages failed:', error)
    else patchMessagesCache(queryClient, conversationId, messages)
  }

  for (const node of nodes) {
    if (node.type !== 'chatPanel') continue
    const prompt = (node.data as { promptMessage?: BoardMessage }).promptMessage
    const linkedBoardId = getLinkedBoardId(prompt?.metadata)
    if (!linkedBoardId || !prompt?.id) continue
    const title =
      (typeof prompt.metadata?.blockTitle === 'string' && prompt.metadata.blockTitle) ||
      undefined
    await ensureLinkedBoard(supabase, {
      userId: user.id,
      parentConversationId: conversationId,
      linkedBoardId,
      sourceMessageId: prompt.id,
      title,
    })
  }

  const freehandNodes = nodes.filter((n) => n.type === 'freehand')
  if (freehandNodes.length > 0) {
    const rows = freehandNodes.map((node) => ({
      id: node.id,
      conversation_id: conversationId,
      user_id: user.id,
      node_type: 'freehand',
      position_x: node.position.x,
      position_y: node.position.y,
      width: Number((node.style as { width?: number })?.width ?? node.width ?? 100),
      height: Number((node.style as { height?: number })?.height ?? node.height ?? 100),
      data: node.data ?? {},
    }))
    const { error } = await supabase.from('canvas_nodes').upsert(rows, { onConflict: 'id' })
    if (error) console.error('Undo restore canvas nodes failed:', error)
    else {
      await queryClient.invalidateQueries({ queryKey: ['canvas-nodes', conversationId] })
    }
  }
}

async function restoreEdges(
  conversationId: string,
  edges: Edge[],
  nodes: Node[],
  queryClient: QueryClient
) {
  if (edges.length === 0) return
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.id === edge.source)
    const targetNode = nodes.find((n) => n.id === edge.target)
    const sourceMessageId = (sourceNode?.data as { promptMessage?: BoardMessage })?.promptMessage?.id
    const targetMessageId = (targetNode?.data as { promptMessage?: BoardMessage })?.promptMessage?.id
    if (!sourceMessageId || !targetMessageId || sourceMessageId === targetMessageId) continue

    const row = {
      conversation_id: conversationId,
      user_id: user.id,
      source_message_id: sourceMessageId,
      target_message_id: targetMessageId,
      metadata: edge.data ?? {},
    }
    let { error } = await supabase.from('panel_edges').insert(row)
    if (error && String(error.message || '').includes('metadata')) {
      const retry = await supabase.from('panel_edges').insert({
        conversation_id: conversationId,
        user_id: user.id,
        source_message_id: sourceMessageId,
        target_message_id: targetMessageId,
      })
      error = retry.error
    }
    if (error && !String(error.message || '').includes('duplicate')) {
      console.error('Undo restore thread failed:', error)
    }
  }
  await queryClient.invalidateQueries({ queryKey: ['panel-edges', conversationId] })
}

async function deleteEdges(
  conversationId: string,
  edges: Edge[],
  nodes: Node[],
  queryClient: QueryClient
) {
  if (edges.length === 0) return
  const supabase = createClient()

  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.id === edge.source)
    const targetNode = nodes.find((n) => n.id === edge.target)
    const sourceMessageId = (sourceNode?.data as { promptMessage?: BoardMessage })?.promptMessage?.id
    const targetMessageId = (targetNode?.data as { promptMessage?: BoardMessage })?.promptMessage?.id
    if (!sourceMessageId || !targetMessageId) continue

    const { error } = await supabase
      .from('panel_edges')
      .delete()
      .eq('conversation_id', conversationId)
      .or(
        `and(source_message_id.eq.${sourceMessageId},target_message_id.eq.${targetMessageId}),and(source_message_id.eq.${targetMessageId},target_message_id.eq.${sourceMessageId})`
      )
    if (error) console.error('Redo delete thread failed:', error)
  }
  await queryClient.invalidateQueries({ queryKey: ['panel-edges', conversationId] })
}

/** Mirror map undo/redo in Supabase (frames, threads, drawings). */
export async function syncMapUndoRedoToDatabase(opts: {
  conversationId: string | null | undefined
  queryClient: QueryClient
  from: { nodes: Node[]; edges: Edge[] }
  to: { nodes: Node[]; edges: Edge[] }
  deleteNodesByIds: (nodeIds: string[], nodesSnapshot?: Node[]) => Promise<boolean | void>
}) {
  const { conversationId, queryClient, from, to, deleteNodesByIds } = opts
  if (!conversationId) return

  const nodeDiff = diffById(from.nodes, to.nodes)
  const edgeDiff = diffById(from.edges, to.edges)

  if (nodeDiff.appeared.length > 0) {
    primeRestoredMapNodesInCache(queryClient, conversationId, nodeDiff.appeared)
    await restoreNodes(conversationId, nodeDiff.appeared, queryClient)
  }
  if (nodeDiff.disappeared.length > 0) {
    await deleteNodesByIds(
      nodeDiff.disappeared.map((n) => n.id),
      nodeDiff.disappeared
    )
  }
  if (edgeDiff.appeared.length > 0) {
    await restoreEdges(conversationId, edgeDiff.appeared, to.nodes, queryClient)
  }
  if (edgeDiff.disappeared.length > 0) {
    await deleteEdges(conversationId, edgeDiff.disappeared, from.nodes, queryClient)
  }
}
