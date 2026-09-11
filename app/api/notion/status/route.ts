// Return Notion connection status for the signed-in user (never returns the access token)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isNotionOAuthConfigured } from '@/lib/notion/config'
import { getNotionConnection, listNotionWorkspaces } from '@/lib/notion/connection'

export async function GET(request: NextRequest) {
  try {
    if (!isNotionOAuthConfigured()) {
      return NextResponse.json({ configured: false, connected: false })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ configured: true, connected: false }, { status: 401 })
    }

    const admin = createAdminClient()
    const workspaces = await listNotionWorkspaces(admin, user.id)
    const requestedId = request.nextUrl.searchParams.get('workspaceId')
    const active =
      workspaces.find((w) => w.workspaceId === requestedId) ??
      (requestedId ? null : workspaces[0]) ??
      null

    const connection = await getNotionConnection(admin, user.id, active?.workspaceId ?? requestedId)

    return NextResponse.json({
      configured: true,
      connected: workspaces.length > 0,
      workspaces,
      workspaceId: active?.workspaceId ?? connection?.workspace_id ?? null,
      workspaceName: active?.workspaceName ?? connection?.workspace_name ?? null,
      workspaceIcon: active?.workspaceIcon ?? connection?.workspace_icon ?? null,
      updatedAt: active?.updatedAt ?? connection?.updated_at ?? null,
    })
  } catch (error) {
    console.error('Notion status failed:', error)
    return NextResponse.json({ error: 'Failed to load Notion status' }, { status: 500 })
  }
}
