// Lean iframe for the change preview popup — frozen snapshot, host tools, local edits.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChangeSnapshotEmbed } from '@/components/change-snapshot-embed'

export default async function EmbedChangePage({
  params,
}: {
  params: Promise<{ changeId: string }>
}) {
  const { changeId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login') // Same gate as /embed/{board}

  const { data, error } = await supabase
    .from('board_changes')
    .select('id')
    .eq('id', changeId)
    .maybeSingle() // RLS: own only
  if (error || !data) redirect('/board')

  return <ChangeSnapshotEmbed changeId={changeId} />
}
