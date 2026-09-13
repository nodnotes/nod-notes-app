// Disconnect Notion for the current user (deletes stored OAuth tokens)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as { workspaceId?: string }
    const workspaceId = body.workspaceId ?? request.nextUrl.searchParams.get('workspaceId')
    const admin = createAdminClient()

    let query = admin.from('notion_connections').delete().eq('user_id', user.id)
    if (workspaceId) query = query.eq('workspace_id', workspaceId)
    const { error } = await query

    if (error) {
      console.error('Notion disconnect failed:', error)
      return NextResponse.json({ error: 'Failed to disconnect Notion' }, { status: 500 })
    }

    return NextResponse.json({ ok: true }) // Client clears connected UI
  } catch (error) {
    console.error('Notion disconnect failed:', error)
    return NextResponse.json({ error: 'Failed to disconnect Notion' }, { status: 500 })
  }
}
