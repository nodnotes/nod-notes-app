// Restore Notion pages archived via Thinktable row delete (or other archive in connected DBs).

import { NOTION_VERSION } from './config'
import { searchAllAccessibleNotionPages } from './pages'

function notionHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

/** Unarchive a Notion page / database row (inverse of archiveNotionPage). */
export async function unarchiveNotionPage(accessToken: string, pageId: string): Promise<void> {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders(accessToken),
    body: JSON.stringify({ archived: false }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload?.message || `Failed to restore Notion page ${pageId}`)
  }
}

/** Paginate archived rows for one data source. */
async function queryArchivedPageIds(
  accessToken: string,
  dataSourceId: string
): Promise<string[]> {
  const ids: string[] = []
  let cursor: string | undefined

  while (true) {
    const body: Record<string, unknown> = { page_size: 100, is_archived: true }
    if (cursor) body.start_cursor = cursor

    const res = await fetch(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: 'POST',
        headers: notionHeaders(accessToken),
        body: JSON.stringify(body),
      }
    )
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        payload?.message || `Failed to query archived rows for data source ${dataSourceId}`
      )
    }

    for (const result of payload.results || []) {
      if (result?.object === 'page' && typeof result.id === 'string') {
        ids.push(result.id)
      }
    }

    if (!payload.has_more) break
    cursor = payload.next_cursor as string | undefined
  }

  return ids
}

export type RestoreArchivedResult = {
  restored: number
  scannedDataSources: number
  errors: string[]
}

/**
 * Best-effort: unarchive every archived row in each connected data source.
 * Standalone archived pages outside databases are not discoverable via this scan.
 */
export async function restoreAllArchivedNotionPages(
  accessToken: string
): Promise<RestoreArchivedResult> {
  const pages = await searchAllAccessibleNotionPages(accessToken)
  const dataSourceIds = new Set<string>()
  for (const p of pages) {
    if (p.object === 'database') dataSourceIds.add(p.id)
  }

  const archivedIds = new Set<string>()
  const errors: string[] = []

  for (const dsId of dataSourceIds) {
    try {
      const ids = await queryArchivedPageIds(accessToken, dsId)
      ids.forEach((id) => archivedIds.add(id))
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  let restored = 0
  for (const pageId of archivedIds) {
    try {
      await unarchiveNotionPage(accessToken, pageId)
      restored++
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  }

  return {
    restored,
    scannedDataSources: dataSourceIds.size,
    errors,
  }
}
