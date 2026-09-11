// List Notion pages as a sidebar-style tree for the import picker

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildNotionPageTree,
  buildNotionPickerSections,
  resolveBlockIdParents,
  searchAllAccessibleNotionPages,
} from '@/lib/notion/pages'
import { getNotionConnection } from '@/lib/notion/connection'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const workspaceId = new URL(request.url).searchParams.get('workspaceId')
    const admin = createAdminClient()
    const connection = await getNotionConnection(admin, user.id, workspaceId)

    if (!connection?.access_token) {
      return NextResponse.json({ error: 'Notion is not connected' }, { status: 400 })
    }

    const raw = await searchAllAccessibleNotionPages(connection.access_token) // Flat accessible set
    const pages = await resolveBlockIdParents(connection.access_token, raw) // Nest DBs under pages
    const tree = buildNotionPageTree(pages) // Notion-native nesting (search fallback)
    const sections = buildNotionPickerSections(pages) // Recently edited + Library

    return NextResponse.json({
      workspaceId: connection.workspace_id,
      workspaceName: connection.workspace_name,
      tree, // Nested pages for search results
      sections, // Sidebar-style groups for the empty-query picker
      count: pages.length, // Total accessible pages
    })
  } catch (error) {
    console.error('Notion pages list failed:', error)
    return NextResponse.json({ error: 'Failed to load Notion pages' }, { status: 500 })
  }
}
