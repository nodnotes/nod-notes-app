// Create public template — Miro-style listing page for a source board.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreatePublicTemplatePage } from '@/components/create-public-template-page'
import { boardTitleOrDefault } from '@/lib/board-title' // Empty names stay New board
import { resolveBoardAccessRole } from '@/lib/share/server'

export default async function CreatePublicTemplateRoute({
  params,
}: {
  params: Promise<{ conversationId: string }>
}) {
  const { conversationId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const role = await resolveBoardAccessRole(supabase, conversationId)
  if (!role) {
    redirect('/board') // No access
  }

  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('id, title')
    .eq('id', conversationId)
    .maybeSingle()

  if (error || !conversation) {
    redirect('/board')
  }

  const { data: existing } = await supabase
    .from('board_templates')
    .select('title')
    .eq('user_id', user.id)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle() // Prefill from the last submit; a new submit is a new frozen row

  return (
    <CreatePublicTemplatePage
      conversationId={conversationId}
      initialTitle={boardTitleOrDefault(existing?.title || conversation.title)}
    />
  )
}
