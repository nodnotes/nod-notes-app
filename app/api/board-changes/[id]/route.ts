// GET /api/board-changes/[id] — frozen snapshot for the navigable preview (session RLS).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params // Change row
  const supabase = await createClient() // Cookie session
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('board_changes')
    .select('snapshot')
    .eq('id', id)
    .maybeSingle() // RLS: own only
  if (error || !data?.snapshot) {
    return NextResponse.json({ error: 'Change not found' }, { status: 404 })
  }

  return NextResponse.json(data.snapshot) // PublicBoardPayload frozen at save
}
