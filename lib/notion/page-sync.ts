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
 * Block types we must NEVER DELETE on push.
 * Notion DELETE on child_page / child_database moves the entire page/DB to Trash
 * (not just the embed block) — that is what made “authorize / import” look like
 * it trashed authorized pages.
 */
const PROTECTED_BLOCK_TYPES = new Set([
  'child_page', // Nested page — DELETE trashes the page itself
  'child_database', // Nested DB — DELETE trashes the database itself
  'link_to_page', // Reference to another page; do not remove
])

/** True when this top-level block is safe to remove before re-appending TipTap content. */
function isReplaceableBodyBlock(type: string): boolean {
  return !PROTECTED_BLOCK_TYPES.has(type) // Keep nested pages/DBs and page links intact
}

/** Archive replaceable top-level body blocks only (never child_page / child_database). */
async function archiveReplaceablePageChildren(
  accessToken: string,
  pageId: string
): Promise<void> {
  const children = await fetchBlockChildren(accessToken, pageId) // Current Notion body
  const toRemove = children.filter((block) => isReplaceableBodyBlock(block.type)) // Skip protected
  await Promise.all(
    toRemove.map(async (block) => {
      const res = await fetch(`${NOTION_API}/blocks/${block.id}`, {
        method: 'DELETE', // Soft-trash this content block only
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
