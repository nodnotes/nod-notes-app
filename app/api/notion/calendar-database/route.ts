// Create the Notion database whose Date property Notion Calendar can show.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getNotionConnection } from '@/lib/notion/connection'
import { NOTION_VERSION } from '@/lib/notion/config'
import {
  CALENDAR_NOTION_DB_KEY,
  readProfileMetadata,
  type NotionCalendarDatabase,
} from '@/lib/calendar-connections'

const DATABASE_TITLE = 'NodNotes dates'

/** Notion 2025-09-03 creates properties on the first data source, not on the database itself. */
function createBody(parentPageId: string) {
  return {
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: DATABASE_TITLE } }],
    initial_data_source: {
      properties: {
        Name: { title: {} }, // Row title
        Date: { date: {} }, // Property Notion Calendar reads
      },
    },
  }
}

/** Save the created database on the user's profile so Connections can show it later. */
async function storeDatabase(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  database: NotionCalendarDatabase
) {
  const { data, error } = await supabase.from('profiles').select('metadata').eq('id', userId).single()
  if (error) throw error
  const meta = readProfileMetadata(data?.metadata)
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ metadata: { ...meta, [CALENDAR_NOTION_DB_KEY]: database } })
    .eq('id', userId)
  if (updateError) throw updateError
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    parentPageId?: unknown
    workspaceId?: unknown
  } | null
  const parentPageId = typeof body?.parentPageId === 'string' ? body.parentPageId.trim() : ''
  if (!parentPageId) {
    return NextResponse.json({ error: 'Pick a Notion page to put the database on' }, { status: 400 })
  }

  const workspaceId = typeof body?.workspaceId === 'string' ? body.workspaceId : null
  const admin = createAdminClient()
  const connection = await getNotionConnection(admin, user.id, workspaceId)
  if (!connection?.access_token) {
    return NextResponse.json({ error: 'Connect Notion first' }, { status: 400 })
  }

  const response = await fetch('https://api.notion.com/v1/databases', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connection.access_token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(createBody(parentPageId)),
  })
  const payload = (await response.json().catch(() => null)) as {
    id?: string
    url?: string
    message?: string
  } | null
  if (!response.ok || !payload?.id) {
    return NextResponse.json(
      { error: payload?.message || 'Notion could not create the database' },
      { status: response.status || 500 }
    )
  }

  const database: NotionCalendarDatabase = {
    id: payload.id,
    url: typeof payload.url === 'string' ? payload.url : null,
    title: DATABASE_TITLE,
    workspaceId: connection.workspace_id,
  }
  try {
    await storeDatabase(supabase, user.id, database)
  } catch (error) {
    console.error('Saving Notion calendar database failed:', error)
    return NextResponse.json(
      { error: 'The database was created in Notion, but NodNotes could not remember it. Open it from Notion.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ notionDb: database })
}

/** Forget the link in NodNotes. Does not delete the database in Notion. */
export async function DELETE() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('profiles').select('metadata').eq('id', user.id).single()
  if (error) return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  const meta = readProfileMetadata(data?.metadata)
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ metadata: { ...meta, [CALENDAR_NOTION_DB_KEY]: null } })
    .eq('id', user.id)
  if (updateError) return NextResponse.json({ error: 'Failed to remove the database link' }, { status: 500 })
  return NextResponse.json({ notionDb: null })
}
