// Push / pull Notion page body content (blocks ↔ TipTap HTML)

import {
  fetchBlockChildren,
  fetchNotionPageBlockTree,
  type NotionBlock,
} from './blocks'
import { notionPageBodyToHtml } from './blocks-to-html'
import { htmlToNotionBlocks, type NotionBlockCreate } from './html-to-blocks'
import { NOTION_VERSION } from './config'

const NOTION_API = 'https://api.notion.com/v1'

function notionHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

/** Read a Notion page's last_edited_time (ISO). */
export async function fetchNotionPageLastEdited(
  accessToken: string,
  pageId: string
): Promise<string | null> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'GET',
    headers: notionHeaders(accessToken),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(payload?.message || `Failed to retrieve Notion page ${pageId}`)
  }
  return typeof payload.last_edited_time === 'string' ? payload.last_edited_time : null
}

/**
 * Leaf text types we may DELETE on push. Everything else stays.
 * Fail-closed: a toggle / column that wraps child_page or child_database must
 * never be deleted — Notion DELETE on that wrapper moves the nested pages/DBs
 * to Trash (that is what emptied the Tasks tree).
 */
const REPLACEABLE_LEAF_TYPES = new Set([
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'quote',
  'divider',
  'code',
])

/** True when this top-level block is a leaf we can replace with TipTap text. */
function isReplaceableBodyBlock(block: NotionBlock): boolean {
  if (block.has_children) return false // Nested pages/DBs/toggles — DELETE would trash them
  return REPLACEABLE_LEAF_TYPES.has(block.type)
}

/** Archive replaceable top-level body blocks only (never wrappers or nested pages/DBs). */
async function archiveReplaceablePageChildren(
  accessToken: string,
  pageId: string
): Promise<void> {
  const children = await fetchBlockChildren(accessToken, pageId) // Current Notion body
  const toRemove = children.filter((block) => isReplaceableBodyBlock(block))
  await Promise.all(
    toRemove.map(async (block) => {
      const res = await fetch(`${NOTION_API}/blocks/${block.id}`, {
        method: 'DELETE', // Soft-trash this leaf text block only
        headers: notionHeaders(accessToken),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload?.message || `Failed to archive block ${block.id}`)
      }
    })
  )
}

/** Append new blocks as page children (Notion batches up to 100 per request). */
async function appendPageChildren(
  accessToken: string,
  pageId: string,
  children: NotionBlockCreate[]
): Promise<void> {
  if (children.length === 0) return
  const BATCH = 100
  for (let i = 0; i < children.length; i += BATCH) {
    const slice = children.slice(i, i + BATCH)
    const res = await fetch(`${NOTION_API}/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: notionHeaders(accessToken),
      body: JSON.stringify({ children: slice }),
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(payload?.message || `Failed to append blocks to page ${pageId}`)
    }
  }
}

/** Replace page body in Notion with HTML from NodNotes (preserves nested pages/DBs). */
export async function pushNotionPageBody(
  accessToken: string,
  pageId: string,
  html: string
): Promise<{ lastEditedTime: string | null }> {
  const children = htmlToNotionBlocks(html) // TipTap → Notion blocks (no child_page stubs)
  await archiveReplaceablePageChildren(accessToken, pageId) // Never trash nested pages/DBs
  await appendPageChildren(accessToken, pageId, children) // Append text/structure blocks
  const lastEditedTime = await fetchNotionPageLastEdited(accessToken, pageId)
  return { lastEditedTime }
}

/** Pull page body from Notion as TipTap HTML. */
export async function pullNotionPageBody(
  accessToken: string,
  pageId: string,
  maxDepth = 4
): Promise<{ html: string; lastEditedTime: string | null; blocks: NotionBlock[] }> {
  const [tree, lastEditedTime] = await Promise.all([
    fetchNotionPageBlockTree(accessToken, pageId, maxDepth),
    fetchNotionPageLastEdited(accessToken, pageId),
  ])
  const html = notionPageBodyToHtml(tree)
  return { html, lastEditedTime, blocks: tree }
}
