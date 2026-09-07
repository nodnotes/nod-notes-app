// POST — unarchive all archived rows in connected Notion databases (one-shot recovery).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { restoreAllArchivedNotionPages } from '@/lib/notion/restore-archived'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createAdminClient()
    const { data: connection, error: connError } = await admin
      .from('notion_connections')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle()

    if (connError || !connection?.access_token) {
      return NextResponse.json({ error: 'Notion is not connected' }, { status: 400 })
    }

    const result = await restoreAllArchivedNotionPages(connection.access_token)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('Notion restore archived failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to restore archived pages'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
