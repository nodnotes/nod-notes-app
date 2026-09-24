// Lean iframe for the template preview popup — frozen snapshot, host tools, local edits.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TemplateSnapshotEmbed } from '@/components/template-snapshot-embed'

export default async function EmbedTemplatePage({
  params,
}: {
  params: Promise<{ templateId: string }>
}) {
  const { templateId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login') // Same gate as /embed/{board}

  const { data, error } = await supabase
    .from('board_templates')
    .select('id')
    .eq('id', templateId)
    .maybeSingle() // RLS: approved / own / reviewer
  if (error || !data) redirect('/board')

  return <TemplateSnapshotEmbed templateId={templateId} />
}
