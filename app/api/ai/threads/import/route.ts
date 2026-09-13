// POST — import ChatGPT export JSON as one or more AI threads
import { createClient } from '@/lib/supabase/server'
import { parseChatExportJson } from '@/lib/ai/parse-chat-export'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const boardId = typeof body?.boardId === 'string' ? body.boardId : null
  const exportData = body?.export ?? body?.data ?? body?.conversations
  const conversations = parseChatExportJson(exportData)

  if (!conversations.length) {
    return NextResponse.json(
      { error: 'No conversations found — use ChatGPT conversations.json' },
      { status: 400 }
    )
  }

  const created: Array<{ thread: Record<string, unknown>; messageCount: number }> = []

  for (const conv of conversations) {
    const { data: thread, error: threadErr } = await supabase
      .from('ai_threads')
      .insert({
        user_id: user.id,
        title: conv.title,
        mode: 'ask',
        board_id: boardId,
        metadata: { importedFrom: 'chatgpt-export' },
      })
      .select()
      .single()

    if (threadErr || !thread) {
      return NextResponse.json({ error: threadErr?.message || 'Failed to create thread' }, { status: 500 })
    }

    const inserts = conv.turns.map((turn) => ({
      thread_id: thread.id,
      user_id: user.id,
      role: turn.role,
      content: turn.content,
      parts: [{ type: 'text', text: turn.content }],
      parent_id: null as string | null,
      status: 'complete' as const,
      metadata: { importedFrom: 'chatgpt-export' },
      ...(turn.createdAt ? { created_at: turn.createdAt } : {}),
    }))

    const { error: msgErr } = await supabase.from('ai_messages').insert(inserts)
    if (msgErr) {
      await supabase.from('ai_threads').delete().eq('id', thread.id).eq('user_id', user.id)
      return NextResponse.json({ error: msgErr.message }, { status: 500 })
    }

    created.push({ thread, messageCount: inserts.length })
  }

  return NextResponse.json(
    {
      threads: created.map((c) => c.thread),
      thread: created[0]?.thread,
      importedCount: created.length,
    },
    { status: 201 }
  )
}
