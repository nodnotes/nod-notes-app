// Per-board camera heading — localStorage first, then the board row (or profile on /board)
import { createClient } from '@/lib/supabase/client' // Same browser client the rest of the board uses
import { boardPrefsStorageKey } from '@/lib/board-font' // Shared nodnotes-prefs-{id} blob
import { normalizeDeg } from '@/lib/board-rotation' // One heading per slider position

/** Degrees already saved for this board. Null when this board has no heading yet. */
export function storedBoardRotation(boardId?: string): number | null {
  if (typeof window === 'undefined') return null // Server render has no localStorage
  try {
    const raw = JSON.parse(window.localStorage.getItem(boardPrefsStorageKey(boardId)) || '{}').boardRotation // Saved heading
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null // Missing stays null so a new id can keep the live angle
    return normalizeDeg(raw) // Fold into (-180, 180]
  } catch {
    return null // Bad JSON must not throw into the board
  }
}

/** Write the heading into this board's prefs blob. False when nothing changed. */
export function writeStoredBoardRotation(boardId: string | undefined, deg: number): boolean {
  if (typeof window === 'undefined') return false // SSR
  const heading = normalizeDeg(deg) // Same range the nav slider uses
  const key = boardPrefsStorageKey(boardId) // Per board, or nodnotes-prefs-default on /board
  let existing: Record<string, unknown> = {} // Keep font / rule / style in the same blob
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '{}') // Current blob
    if (parsed && typeof parsed === 'object') existing = parsed as Record<string, unknown> // Ignore non-objects
  } catch {
    existing = {} // Replace a corrupt blob rather than failing the write
  }
  if (existing.boardRotation === heading) return false // Skip a no-op write during restore
  if (existing.boardRotation == null && heading === 0) return false // Don't stamp upright onto a board that never rotated
  window.localStorage.setItem(key, JSON.stringify({ ...existing, boardRotation: heading })) // Reload reads this immediately
  return true // Caller can skip a remote write when this is false
}

function headingFromMetadata(metadata: unknown): number | null {
  const raw = (metadata as { boardRotation?: unknown } | null)?.boardRotation // conversations.metadata or profiles.metadata
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null // Absent means "no remote heading", not upright
  return normalizeDeg(raw) // Match the local range
}

/** Heading stored on the board row. Null when signed out, missing, or not a number. */
export async function readRemoteBoardRotation(boardId?: string): Promise<number | null> {
  try {
    const supabase = createClient() // Browser client
    const { data: { user } } = await supabase.auth.getUser() // Owner-only rows
    if (!user) return null // Signed-out reload keeps localStorage
    if (boardId) {
      const { data, error } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', boardId)
        .eq('user_id', user.id)
        .single() // This board's metadata
      if (error || !data) return null // Missing row — keep the local heading
      return headingFromMetadata(data.metadata) // number or null
    }
    const { data, error } = await supabase.from('profiles').select('metadata').eq('id', user.id).single() // Unsaved /board
    if (error || !data) return null // No profile row
    return headingFromMetadata(data.metadata) // Default-board heading
  } catch {
    return null // Network failure must not reset the camera
  }
}

/** Merge the heading into the board row (or the profile on /board). */
export async function persistBoardRotation(boardId: string | undefined, deg: number): Promise<void> {
  const heading = normalizeDeg(deg) // Stored range
  try {
    const supabase = createClient() // Browser client
    const { data: { user } } = await supabase.auth.getUser() // RLS owner
    if (!user) return // Nothing to sync
    if (boardId) {
      const { data, error } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', boardId)
        .eq('user_id', user.id)
        .single() // Read-merge so font / icon stay
      if (error || !data) return // Not this user's board
      const existing = (data.metadata as Record<string, unknown>) || {} // Current metadata
      if (existing.boardRotation === heading) return // Already stored
      if (existing.boardRotation == null && heading === 0) return // Don't stamp upright onto a board that never rotated
      await supabase
        .from('conversations')
        .update({ metadata: { ...existing, boardRotation: heading } })
        .eq('id', boardId)
        .eq('user_id', user.id) // Owner only
      return
    }
    const { data, error } = await supabase.from('profiles').select('metadata').eq('id', user.id).single() // /board
    if (error || !data) return // No profile
    const existing = (data.metadata as Record<string, unknown>) || {} // Keep other prefs
    if (existing.boardRotation === heading) return // Already stored
    if (existing.boardRotation == null && heading === 0) return // Unsaved /board stays untouched until it actually rotates
    await supabase.from('profiles').update({ metadata: { ...existing, boardRotation: heading } }).eq('id', user.id) // Default board
  } catch {
    // localStorage already has the heading for this reload
  }
}
