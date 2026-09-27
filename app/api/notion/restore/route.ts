// Restore trashed Notion pages / databases (PATCH archived: false)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { restoreNotionPage } from '@/lib/notion/database'

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

    const body = (await request.json()) as { pageIds?: unknown }
    const pageIds = Array.isArray(body.pageIds)
      ? body.pageIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      : []
    if (pageIds.length === 0) {
      return NextResponse.json({ error: 'Missing pageIds' }, { status: 400 })
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

    const restored: string[] = []
    const failed: Array<{ id: string; error: string }> = []
    for (const id of pageIds) {
      try {
        await restoreNotionPage(connection.access_token, id)
        restored.push(id)
      } catch (err) {
        failed.push({
          id,
          error: err instanceof Error ? err.message : 'Failed to restore',
        })
      }
    }
    return NextResponse.json({ ok: failed.length === 0, restored, failed })
  } catch (error) {
    console.error('Notion restore failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to restore Notion pages'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
