// Resolve stored Notion OAuth rows (one or more workspaces per user)

import type { createAdminClient } from '@/lib/supabase/admin'

export type NotionWorkspaceSummary = {
  workspaceId: string
  workspaceName: string | null
  workspaceIcon: string | null
  updatedAt: string | null
}

type AdminClient = ReturnType<typeof createAdminClient>

type NotionConnectionRow = {
  access_token: string
  workspace_id: string | null
  workspace_name: string | null
  workspace_icon: string | null
  updated_at: string | null
}

/** Safe workspace list for the connection panel (no tokens). */
export async function listNotionWorkspaces(
  admin: AdminClient,
  userId: string
): Promise<NotionWorkspaceSummary[]> {
  const { data, error } = await admin
    .from('notion_connections')
    .select('workspace_id, workspace_name, workspace_icon, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error || !data?.length) return []

  return data
    .filter((row) => row.workspace_id)
    .map((row) => ({
      workspaceId: row.workspace_id as string,
      workspaceName: row.workspace_name ?? null,
      workspaceIcon: row.workspace_icon ?? null,
      updatedAt: row.updated_at ?? null,
    }))
}

/** Load the OAuth row for a workspace (or the sole / latest connection when id omitted). */
export async function getNotionConnection(
  admin: AdminClient,
  userId: string,
  workspaceId?: string | null
): Promise<NotionConnectionRow | null> {
  if (workspaceId) {
    const { data, error } = await admin
      .from('notion_connections')
      .select('access_token, workspace_id, workspace_name, workspace_icon, updated_at')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (error || !data?.access_token) return null
    return data
  }

  const { data: rows, error } = await admin
    .from('notion_connections')
    .select('access_token, workspace_id, workspace_name, workspace_icon, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error || !rows?.length) return null
  const hit = rows.find((r) => r.access_token)
  return hit ?? null
}
