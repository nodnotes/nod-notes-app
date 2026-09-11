import { createClient } from '@supabase/supabase-js'
import { isPublicBoardId } from '@/lib/public-showcase-boards'

export type PublicBoardPayload = {
  conversation: { id: string; title: string | null; metadata: Record<string, unknown> | null }
  messages: Array<{
    id: string
    role: string
    content: string
    created_at: string
    metadata: Record<string, unknown> | null
  }>
  edges: Array<{ source_message_id: string; target_message_id: string; metadata?: unknown }>
  canvasNodes: Array<{
    id: string
    node_type: string
    position_x: number
    position_y: number
    width: number
    height: number
    data: unknown
  }>
}

export async function fetchPublicBoard(boardId: string): Promise<PublicBoardPayload | null> {
  if (!isPublicBoardId(boardId)) return null

  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!secretKey || !supabaseUrl) return null

  const supabaseAdmin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: conversation, error: convError } = await supabaseAdmin
    .from('conversations')
    .select('id, title, metadata')
    .eq('id', boardId)
    .single()

  if (convError || !conversation) return null

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from('messages')
    .select('id, role, content, created_at, metadata')
    .eq('conversation_id', boardId)
    .order('created_at', { ascending: true })

  if (messagesError) return null

  const { data: edges, error: edgesError } = await supabaseAdmin
    .from('panel_edges')
    .select('source_message_id, target_message_id, metadata')
    .eq('conversation_id', boardId)

  if (edgesError) return null

  const { data: canvasNodes } = await supabaseAdmin
    .from('canvas_nodes')
    .select('id, node_type, position_x, position_y, width, height, data')
    .eq('conversation_id', boardId)
    .order('created_at', { ascending: true })

  return {
    conversation,
    messages: messages || [],
    edges: edges || [],
    canvasNodes: canvasNodes || [],
  }
}
