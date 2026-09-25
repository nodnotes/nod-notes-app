// Frozen board change history — named saves with JPEG thumbs + live snapshot preview.

import { createClient } from '@/lib/supabase/client' // Shared browser client
import { boardTitleOrDefault } from '@/lib/board-title' // Empty names stay New board
import { captureBoardViewImage, formatCaptureTimestamp } from '@/lib/captures' // Same JPEG + stamp as Views
import type { PublicBoardPayload } from '@/lib/public-board-fetch' // Snapshot shape (frames / threads / drawings)

/** Iframe → host: first edit in the change preview (local-only; snapshot stays frozen). */
export const CHANGE_PREVIEW_EDIT_MESSAGE = 'nodnotes-change-preview-edit'

/** + Save pin vs Docs-style session snapshot. */
export type BoardChangeKind = 'named' | 'auto'

/** Keep one auto row for this long, then start a new session version. */
export const CHANGE_AUTO_SESSION_MS = 30 * 60 * 1000

/** Oldest autos drop after this many per board (named pins are kept). */
export const CHANGE_AUTO_MAX_PER_BOARD = 40

/** One saved board version (named pin or session auto). */
export type BoardChange = {
  id: string // Row id
  user_id: string // Owner
  conversation_id: string | null // Source board (live board may keep changing)
  title: string // Board name at save
  kind: BoardChangeKind // named = + Save; auto = idle session
  preview_data_url: string | null // JPEG thumb
  created_at: string // First write
  updated_at: string // Last session write / rename
}

const CHANGES_KEY = ['board-changes'] as const // react-query key

const CHANGE_LIST_COLUMNS =
  'id, user_id, conversation_id, title, kind, preview_data_url, created_at, updated_at' // No snapshot in the gallery

/** react-query key so save / delete can invalidate the list. */
export function boardChangesQueryKey() {
  return CHANGES_KEY // Stable tuple
}

/** Normalize a kind string from PostgREST. */
function asKind(raw: unknown): BoardChangeKind {
  return raw === 'auto' ? 'auto' : 'named' // Missing / corrupt → treat as a pin
}

/** Map a PostgREST row onto BoardChange. */
function asChange(row: Record<string, unknown>): BoardChange {
  return {
    id: String(row.id), // UUID
    user_id: String(row.user_id), // Owner
    conversation_id: row.conversation_id ? String(row.conversation_id) : null, // Source board
    title: boardTitleOrDefault(typeof row.title === 'string' ? row.title : null), // Empty → New board
    kind: asKind(row.kind), // Pin vs session
    preview_data_url: typeof row.preview_data_url === 'string' ? row.preview_data_url : null, // JPEG
    created_at: typeof row.created_at === 'string' ? row.created_at : '', // ISO
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '', // ISO
  }
}

/** SHA-256 of frames / threads / drawings — skip autosave when nothing moved. */
export async function hashBoardSnapshot(snapshot: PublicBoardPayload): Promise<string> {
  const payload = JSON.stringify({
    messages: snapshot.messages.map((m) => ({
      id: m.id,
      content: m.content,
      metadata: m.metadata,
    })),
    edges: snapshot.edges,
    canvasNodes: snapshot.canvasNodes,
  })
  const bytes = new TextEncoder().encode(payload) // UTF-8
  const digest = await crypto.subtle.digest('SHA-256', bytes) // Browser / Edge
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Freeze the live board so later edits do not change this save. */
async function snapshotLiveBoard(conversationId: string): Promise<PublicBoardPayload | null> {
  const supabase = createClient() // Owner RLS can read their board
  const { data: conversation, error: convErr } = await supabase
    .from('conversations')
    .select('id, title, metadata')
    .eq('id', conversationId)
    .maybeSingle()
  if (convErr || !conversation) return null // Still save the listing without a snapshot
  const { data: messages } = await supabase
    .from('messages')
    .select('id, role, content, created_at, metadata')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  const { data: edges } = await supabase
    .from('panel_edges')
    .select(
      'source_message_id, target_message_id, source_canvas_node_id, target_canvas_node_id, metadata'
    )
    .eq('conversation_id', conversationId)
  const { data: canvasNodes } = await supabase
    .from('canvas_nodes')
    .select('id, node_type, position_x, position_y, width, height, data')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  return {
    conversation, // Title + prefs at save
    messages: messages || [], // Frames
    edges: edges || [], // Threads
    canvasNodes: canvasNodes || [], // Drawings / shapes
  }
}

/** Own saves, newest first. */
export async function listBoardChanges(): Promise<BoardChange[]> {
  const supabase = createClient() // Shared client
  const { data, error } = await supabase
    .from('board_changes')
    .select(CHANGE_LIST_COLUMNS)
    .order('updated_at', { ascending: false }) // Current session stays on top
  if (error) throw error // Caller shows empty / retry
  return (data || []).map((row) => asChange(row as Record<string, unknown>)) // Normalize
}

/** True when a JSON body is a frozen board snapshot. */
function isBoardSnapshot(value: unknown): value is PublicBoardPayload {
  if (!value || typeof value !== 'object') return false // Reject HTML / empty
  const row = value as Record<string, unknown>
  return Array.isArray(row.messages) && !!row.conversation && typeof row.conversation === 'object'
}

/** Load the frozen board body for the navigable change preview. */
export async function fetchBoardChangeSnapshot(id: string): Promise<PublicBoardPayload | null> {
  const res = await fetch(`/api/board-changes/${id}`, { credentials: 'same-origin' }) // RLS via session
  if (!res.ok) return null // Missing / forbidden
  const body = (await res.json()) as unknown
  if (!isBoardSnapshot(body)) return null // Reject a listing-only row
  return {
    conversation: body.conversation, // Title + prefs at save
    messages: body.messages, // Frames
    edges: body.edges || [], // Threads
    canvasNodes: body.canvasNodes || [], // Drawings / shapes
  }
}

/** Save a frozen snapshot of the live board (does not upsert). */
export async function saveBoardChange(opts: {
  conversationId: string // Source board — stays editable
  title?: string // Listing name
  previewDataUrl?: string // Optional; otherwise snapshot the live view
}): Promise<BoardChange> {
  const supabase = createClient() // Shared client
  const {
    data: { user },
  } = await supabase.auth.getUser() // Owner
  if (!user) throw new Error('Sign in to save a change') // Utility is signed-in only

  let title = opts.title?.trim() || '' // Caller may already know the name
  if (!title) {
    const { data: board } = await supabase
      .from('conversations')
      .select('title')
      .eq('id', opts.conversationId)
      .maybeSingle() // Missing board still saves with New board
    title = boardTitleOrDefault(board?.title) // Same empty-board label
  }

  const previewDataUrl = opts.previewDataUrl ?? (await captureBoardViewImage()) ?? null // JPEG or none
  const snapshot = await snapshotLiveBoard(opts.conversationId) // Freeze frames / threads / drawings
  const contentHash = snapshot ? await hashBoardSnapshot(snapshot) : null // So the next auto can no-op
  const row = {
    user_id: user.id, // Owner
    conversation_id: opts.conversationId, // Live board (edits after this are ignored)
    title, // Frozen listing name
    kind: 'named' as const, // + Save pin — never coalesced / pruned
    content_hash: contentHash, // Match against later autos
    preview_data_url: previewDataUrl, // Frozen thumb
    snapshot, // Frozen board body
  }
  const { data, error } = await supabase
    .from('board_changes')
    .insert(row) // New frozen row — never update an existing save
    .select(CHANGE_LIST_COLUMNS)
    .single()
  if (error || !data) throw error || new Error('Could not save change') // Surface to the caller
  return asChange(data as Record<string, unknown>) // Normalized row
}

/** Drop oldest autos on this board past the cap (named pins stay). */
async function pruneBoardAutos(userId: string, conversationId: string): Promise<void> {
  const supabase = createClient() // Same session
  const { data, error } = await supabase
    .from('board_changes')
    .select('id')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .eq('kind', 'auto')
    .order('updated_at', { ascending: false }) // Keep the newest sessions
  if (error || !data || data.length <= CHANGE_AUTO_MAX_PER_BOARD) return // Under cap
  const extra = data.slice(CHANGE_AUTO_MAX_PER_BOARD).map((row) => row.id) // Oldest ids
  if (extra.length === 0) return
  await supabase.from('board_changes').delete().in('id', extra) // RLS: own autos only
}

/** Idle / heartbeat session snapshot — update the open session or start a new one. */
export async function autosaveBoardChange(opts: {
  conversationId: string // Source board
  withPreview?: boolean // JPEG only while the tab is visible (hidden paint is blank)
}): Promise<BoardChange | null> {
  const supabase = createClient() // Shared client
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null // Signed-out / embed

  const snapshot = await snapshotLiveBoard(opts.conversationId) // Same freeze as + Save
  if (!snapshot) return null // Board gone
  const contentHash = await hashBoardSnapshot(snapshot) // Compare to last version

  const { data: latest } = await supabase
    .from('board_changes')
    .select('id, kind, content_hash, updated_at, preview_data_url')
    .eq('user_id', user.id)
    .eq('conversation_id', opts.conversationId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle() // Newest pin or session

  if (latest && typeof latest.content_hash === 'string' && latest.content_hash === contentHash) {
    return null // Nothing changed since the last version
  }

  const title = boardTitleOrDefault(
    snapshot.conversation && typeof snapshot.conversation.title === 'string'
      ? snapshot.conversation.title
      : null
  )
  const latestKind = asKind(latest?.kind)
  const latestUpdated = latest && typeof latest.updated_at === 'string' ? Date.parse(latest.updated_at) : 0
  const inSession =
    latest &&
    latestKind === 'auto' &&
    Number.isFinite(latestUpdated) &&
    Date.now() - latestUpdated < CHANGE_AUTO_SESSION_MS // Same editing session

  let previewDataUrl: string | null = null
  if (opts.withPreview !== false) {
    previewDataUrl = (await captureBoardViewImage()) ?? null // Idle — board is quiet
  }
  if (!previewDataUrl && latest && typeof latest.preview_data_url === 'string') {
    previewDataUrl = latest.preview_data_url // Keep the last thumb when hidden / capture failed
  }

  if (inSession && latest) {
    const { data, error } = await supabase
      .from('board_changes')
      .update({
        title, // Board may have been renamed mid-session
        snapshot, // Latest frames / threads / drawings
        content_hash: contentHash, // Next idle can no-op
        preview_data_url: previewDataUrl, // Refresh cover when we have one
      })
      .eq('id', latest.id)
      .select(CHANGE_LIST_COLUMNS)
      .single()
    if (error || !data) return null // Caller keeps the prior list
    return asChange(data as Record<string, unknown>)
  }

  const { data, error } = await supabase
    .from('board_changes')
    .insert({
      user_id: user.id,
      conversation_id: opts.conversationId,
      title,
      kind: 'auto' as const, // Session version
      content_hash: contentHash,
      preview_data_url: previewDataUrl,
      snapshot,
    })
    .select(CHANGE_LIST_COLUMNS)
    .single()
  if (error || !data) return null
  await pruneBoardAutos(user.id, opts.conversationId) // Cap 40 autos / board
  return asChange(data as Record<string, unknown>)
}

/** Drop a save (owner). */
export async function deleteBoardChange(id: string): Promise<void> {
  const supabase = createClient() // Shared client
  const { error } = await supabase.from('board_changes').delete().eq('id', id) // RLS: own only
  if (error) throw error // Caller keeps the thumb on failure
}

/** Search haystack: board name + save time. */
export function changeSearchHaystack(change: BoardChange): string {
  const stamp = formatCaptureTimestamp(change.kind === 'auto' ? change.updated_at : change.created_at)
  const kindLabel = change.kind === 'named' ? 'saved named pin' : 'auto session'
  return `${change.title} ${stamp} ${change.created_at} ${change.updated_at} ${kindLabel}`.toLowerCase()
}

/** Filter the list by text and All boards / This board. */
export function filterBoardChanges(
  changes: BoardChange[],
  query: string,
  opts?: { boardId?: string; thisBoardOnly?: boolean }
): BoardChange[] {
  const scoped =
    opts?.thisBoardOnly && opts.boardId
      ? changes.filter((c) => c.conversation_id === opts.boardId) // Open board only
      : changes
  const q = query.trim().toLowerCase() // Live search
  if (!q) return scoped // No text filter
  return scoped.filter((c) => changeSearchHaystack(c).includes(q)) // Name / ISO
}

/** Docs-style day header for a version timestamp. */
export function changeDayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const now = new Date()
  const start = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const diffDays = Math.round((start(now) - start(d)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Stamp shown on a thumb — session autos use last write. */
export function changeStampIso(change: BoardChange): string {
  return change.kind === 'auto' ? change.updated_at || change.created_at : change.created_at
}
