// Frozen board templates — submit for easayani@goalfish.io review before All is public.

import { createClient } from '@/lib/supabase/client' // Shared browser client
import { boardTitleOrDefault } from '@/lib/board-title' // Empty names stay New board
import { captureBoardViewImage } from '@/lib/captures' // Same JPEG the Views tab uses
import type { PublicBoardPayload } from '@/lib/public-board-fetch' // Snapshot shape (frames / threads / drawings)

/** Review inbox — auth email, not user_metadata. */
export const TEMPLATE_REVIEWER_EMAIL = 'easayani@goalfish.io'

/** Iframe → host: first edit in the template preview (local-only; snapshot stays frozen). */
export const TEMPLATE_PREVIEW_EDIT_MESSAGE = 'nodnotes-template-preview-edit'

/** Review state: pending stays in Submissions until the reviewer decides. */
export type BoardTemplateStatus = 'pending' | 'approved' | 'rejected'

/** One submitted board template (frozen at submit). */
export type BoardTemplate = {
  id: string // Row id
  user_id: string // Submitter
  conversation_id: string | null // Source board (live board may keep changing)
  title: string // Listing name at submit
  description: string | null // Listing copy at submit
  author_name: string | null // Cached submitter label
  preview_data_url: string | null // JPEG thumb + expanded preview
  status: BoardTemplateStatus // pending | approved | rejected
  is_public: boolean // True only after approve
  created_at: string // Submit time
  updated_at: string // Last review stamp
}

const TEMPLATES_KEY = ['board-templates'] as const // react-query key

const TEMPLATE_LIST_COLUMNS =
  'id, user_id, conversation_id, title, description, author_name, preview_data_url, status, is_public, created_at, updated_at' // No snapshot in the gallery

/** sessionStorage key for the JPEG captured before /board/{id}/template. */
function templatePreviewStashKey(conversationId: string) {
  return `nodnotes-template-preview:${conversationId}` // One preview per source board
}

/** Stash the live-board JPEG so the creation page can show / submit it. */
export function stashTemplatePreview(conversationId: string, dataUrl: string | null): void {
  if (typeof window === 'undefined') return // SSR
  const key = templatePreviewStashKey(conversationId) // Per-board slot
  if (dataUrl) window.sessionStorage.setItem(key, dataUrl) // Keep until submit or tab close
  else window.sessionStorage.removeItem(key) // Clear a failed capture
}

/** Read the JPEG stashed on Yes (null if they opened the page cold). */
export function readStashedTemplatePreview(conversationId: string): string | null {
  if (typeof window === 'undefined') return null // SSR
  return window.sessionStorage.getItem(templatePreviewStashKey(conversationId))
}

/** react-query key so submit / review / delete can invalidate the gallery. */
export function boardTemplatesQueryKey() {
  return TEMPLATES_KEY // Stable tuple
}

/** True when this signed-in email is the template reviewer. */
export function isTemplateReviewerEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === TEMPLATE_REVIEWER_EMAIL // Auth email only
}

/** Publisher label from the signed-in user. */
export function authorNameFromUser(user: {
  email?: string | null
  user_metadata?: { full_name?: string; name?: string }
}): string {
  const meta = user.user_metadata // Display only — never used for RLS
  const named = meta?.full_name?.trim() || meta?.name?.trim() // Prefer a real name
  if (named) return named // Show the name
  const email = user.email?.trim() // Fallback: local part of email
  if (email) return email.split('@')[0] || email // Hide the domain
  return 'Someone' // Last resort
}

/** Normalize a status string from PostgREST. */
function asStatus(raw: unknown): BoardTemplateStatus {
  if (raw === 'approved' || raw === 'rejected' || raw === 'pending') return raw // Known only
  return 'pending' // Corrupt → still in Submissions
}

/** Map a PostgREST row onto BoardTemplate. */
function asTemplate(row: Record<string, unknown>): BoardTemplate {
  return {
    id: String(row.id), // UUID
    user_id: String(row.user_id), // Submitter
    conversation_id: row.conversation_id ? String(row.conversation_id) : null, // Source board
    title: boardTitleOrDefault(typeof row.title === 'string' ? row.title : null), // Empty → New board
    description: typeof row.description === 'string' ? row.description : null, // Listing copy
    author_name: typeof row.author_name === 'string' ? row.author_name : null, // Cached label
    preview_data_url: typeof row.preview_data_url === 'string' ? row.preview_data_url : null, // JPEG
    status: asStatus(row.status), // Review state
    is_public: row.is_public === true, // Approved gallery only
    created_at: typeof row.created_at === 'string' ? row.created_at : '', // ISO
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : '', // ISO
  }
}

/** Freeze the live board so later edits do not change this template. */
async function snapshotLiveBoard(conversationId: string): Promise<PublicBoardPayload | null> {
  const supabase = createClient() // Owner RLS can read their board
  const { data: conversation, error: convErr } = await supabase
    .from('conversations')
    .select('id, title, metadata')
    .eq('id', conversationId)
    .maybeSingle()
  if (convErr || !conversation) return null // Still submit the listing without a snapshot
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
    conversation, // Title + prefs at submit
    messages: messages || [], // Frames
    edges: edges || [], // Threads
    canvasNodes: canvasNodes || [], // Drawings / shapes
  }
}

/** Approved public + own submissions + reviewer queue (newest first). */
export async function listBoardTemplates(): Promise<BoardTemplate[]> {
  const supabase = createClient() // Shared client
  const { data, error } = await supabase
    .from('board_templates')
    .select(TEMPLATE_LIST_COLUMNS)
    .order('created_at', { ascending: false }) // Submit order — frozen rows never republish
  if (error) throw error // Caller shows empty / retry
  return (data || []).map((row) => asTemplate(row as Record<string, unknown>)) // Normalize
}

/** True when a JSON body is a frozen board snapshot. */
function isBoardSnapshot(value: unknown): value is PublicBoardPayload {
  if (!value || typeof value !== 'object') return false // Reject HTML / empty
  const row = value as Record<string, unknown>
  return Array.isArray(row.messages) && !!row.conversation && typeof row.conversation === 'object'
}

/** Load the frozen board body for the navigable template preview. */
export async function fetchBoardTemplateSnapshot(id: string): Promise<PublicBoardPayload | null> {
  const res = await fetch(`/api/board-templates/${id}`, { credentials: 'same-origin' }) // RLS via session
  if (!res.ok) return null // Missing / forbidden
  const body = (await res.json()) as unknown
  if (!isBoardSnapshot(body)) return null // Reject a listing-only row
  return {
    conversation: body.conversation, // Title + prefs at submit
    messages: body.messages, // Frames
    edges: body.edges || [], // Threads
    canvasNodes: body.canvasNodes || [], // Drawings / shapes
  }
}

/** Submit a frozen snapshot for review (does not upsert / does not go public). */
export async function publishBoardTemplate(opts: {
  conversationId: string // Source board — stays editable
  title?: string // Listing name
  description?: string // What the template is for
  previewDataUrl?: string // Optional; otherwise snapshot the live view
}): Promise<BoardTemplate> {
  const supabase = createClient() // Shared client
  const {
    data: { user },
  } = await supabase.auth.getUser() // Submitter
  if (!user) throw new Error('Sign in to create a public template') // Utility is signed-in only

  let title = opts.title?.trim() || '' // Caller may already know the name
  if (!title) {
    const { data: board } = await supabase
      .from('conversations')
      .select('title')
      .eq('id', opts.conversationId)
      .maybeSingle() // Missing board still submits with New board
    title = boardTitleOrDefault(board?.title) // Same empty-board label
  }

  const previewDataUrl = opts.previewDataUrl ?? (await captureBoardViewImage()) ?? null // JPEG or none
  const snapshot = await snapshotLiveBoard(opts.conversationId) // Freeze frames / threads / drawings
  const row = {
    user_id: user.id, // Submitter
    conversation_id: opts.conversationId, // Live board (edits after this are ignored)
    title, // Frozen listing name
    description: opts.description?.trim() || null, // Frozen listing copy
    author_name: authorNameFromUser(user), // Reviewer + All label
    preview_data_url: previewDataUrl, // Frozen thumb
    snapshot, // Frozen board body
    status: 'pending' as const, // Reviewer queue
    is_public: false, // Hidden from All until approve
  }
  const { data, error } = await supabase
    .from('board_templates')
    .insert(row) // New frozen row — never update an existing template
    .select(TEMPLATE_LIST_COLUMNS)
    .single()
  if (error || !data) throw error || new Error('Could not submit template') // Surface to the caller
  return asTemplate(data as Record<string, unknown>) // Normalized row
}

/** Reviewer approve / reject — content stays frozen. */
export async function reviewBoardTemplate(
  id: string,
  status: 'approved' | 'rejected'
): Promise<void> {
  const supabase = createClient() // Reviewer JWT
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !isTemplateReviewerEmail(user.email)) {
    throw new Error('Only the reviewer can approve templates') // Client guard; RLS also blocks
  }
  const { error } = await supabase
    .from('board_templates')
    .update({
      status, // pending → approved | rejected
      is_public: status === 'approved', // All gallery
      reviewed_at: new Date().toISOString(), // When
      reviewed_by: user.id, // easayani@goalfish.io
    })
    .eq('id', id)
  if (error) throw error // Caller keeps the thumb
}

/** Withdraw a pending submission (owner) or delete (reviewer). */
export async function deleteBoardTemplate(id: string): Promise<void> {
  const supabase = createClient() // Shared client
  const { error } = await supabase.from('board_templates').delete().eq('id', id) // RLS: pending own / reviewer
  if (error) throw error // Caller keeps the thumb on failure
}

/** Search haystack: title + author + description. */
export function templateSearchHaystack(template: BoardTemplate): string {
  return `${template.title} ${template.author_name || ''} ${template.description || ''}`.toLowerCase()
}

/** Filter the gallery by text and All / Submissions. */
export function filterBoardTemplates(
  templates: BoardTemplate[],
  query: string,
  opts: { userId?: string | null; isReviewer?: boolean; scope: 'all' | 'submissions' }
): BoardTemplate[] {
  const userId = opts.userId || null // Signed-in user
  const scoped =
    opts.scope === 'submissions'
      ? opts.isReviewer
        ? templates.filter((t) => t.status === 'pending') // Review queue
        : templates.filter((t) => t.user_id === userId && t.status !== 'approved') // Own pending / rejected
      : templates.filter((t) => t.status === 'approved' && t.is_public) // Public gallery
  const q = query.trim().toLowerCase() // Live search
  if (!q) return scoped // No text filter
  return scoped.filter((t) => templateSearchHaystack(t).includes(q)) // Title / author / copy
}
