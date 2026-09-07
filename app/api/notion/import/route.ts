// Import selected Notion page(s) onto the current (or new) board

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { importNotionPagesToBoard } from '@/lib/notion/import-to-board'
import { getNotionConnection } from '@/lib/notion/connection'

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

    const body = (await request.json().catch(() => ({}))) as {
      returnTo?: string
      pageIds?: string[]
      mode?: 'card' | 'mindmap'
      workspaceId?: string
    }

    const admin = createAdminClient()
    const connection = await getNotionConnection(admin, user.id, body.workspaceId)

    if (!connection?.access_token) {
      return NextResponse.json({ error: 'Notion is not connected' }, { status: 400 })
    }

    if (!body.pageIds || body.pageIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one Notion page' }, { status: 400 })
    }

    const imported = await importNotionPagesToBoard({
      userId: user.id,
      accessToken: connection.access_token,
      returnTo: body.returnTo,
      workspaceName: connection.workspace_name,
      pageIds: body.pageIds,
      mode: body.mode || 'card',
      signal: request.signal, // Picker Cancel aborts the client fetch → this signal
    })

    return NextResponse.json(imported) // conversationId + counts for client navigation
  } catch (error) {
    if (request.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      return NextResponse.json({ cancelled: true, error: 'Import cancelled' }, { status: 499 })
    }
    console.error('Notion import failed:', error)
    return NextResponse.json({ error: 'Failed to import Notion pages' }, { status: 500 })
  }
}
