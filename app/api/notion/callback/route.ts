// Notion OAuth callback — exchange code, persist connection, return to the board that started connect

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeNotionCode } from '@/lib/notion/oauth'
import { getSiteUrl } from '@/lib/notion/config'

/** Board UUID path from a relative returnTo (e.g. /board/{uuid}). */
const BOARD_PATH_RE =
  /^\/board\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i

/** Only allow same-origin relative paths (block open redirects). */
function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('://')) return null // Reject absolute / protocol-relative
  return raw.split('?')[0]?.split('#')[0] || null // Path only — strip query/hash from stored returnTo
}

/** Prefer the board the user started from; never send them to the marketing homepage. */
function resolvePostAuthPath(returnTo: string | null): string {
  const path = safeReturnPath(returnTo) // Validated relative path
  if (path && BOARD_PATH_RE.test(path)) return path // Exact board they connected from
  if (path && path.startsWith('/board')) return path // /board or other board routes
  return '/board' // App home — not `/` marketing homepage
}

/** Redirect back to the starting board (or /board) with Notion error query params. */
function redirectError(siteUrl: string, returnTo: string | null, reason: string): NextResponse {
  const dest = new URL(resolvePostAuthPath(returnTo), siteUrl) // Land on board, not homepage
  dest.searchParams.set('notion', 'error') // Client can surface failure
  dest.searchParams.set('reason', reason) // Machine-readable cause
  return NextResponse.redirect(dest.toString())
}

/** Best-effort parse of returnTo from OAuth state (even when CSRF cookie fails). */
function returnToFromState(state: string | null): string | null {
  if (!state) return null // Nothing to parse
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
      returnTo?: string
    }
    return safeReturnPath(parsed.returnTo) // Only relative paths
  } catch {
    return null // Malformed state — caller falls back to /board
  }
}

export async function GET(request: NextRequest) {
  const siteUrl = getSiteUrl() // Canonical origin for safe redirects
  const stateParam = request.nextUrl.searchParams.get('state') // Notion echoes state on success and cancel
  const returnHint = returnToFromState(stateParam) // Prefer board from state for all exits

  try {
    const errorParam = request.nextUrl.searchParams.get('error') // User cancelled or Notion error
    if (errorParam) {
      return redirectError(siteUrl, returnHint, errorParam) // Back to board, not homepage
    }

    const code = request.nextUrl.searchParams.get('code') // Temporary authorization code
    const state = stateParam // CSRF + return path
    const cookieState = request.cookies.get('notion_oauth_state')?.value // Cookie set in /auth

    if (!code || !state || !cookieState || state !== cookieState) {
      return redirectError(siteUrl, returnHint, 'invalid_state') // Reject CSRF / missing code
    }

    let returnTo = '/board' // Default app landing if state lacks path
    let stateUserId: string | null = null // User id baked into state
    try {
      const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8')) as {
        returnTo?: string
        userId?: string
      }
      const safe = safeReturnPath(parsed.returnTo) // Validate relative path
      if (safe) returnTo = safe // Only allow relative paths
      stateUserId = parsed.userId || null // Compare to session
    } catch {
      return redirectError(siteUrl, returnHint, 'bad_state') // Malformed state
    }

    const supabase = await createClient() // Session client
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser() // Must still be signed in

    if (userError || !user || (stateUserId && stateUserId !== user.id)) {
      // Preserve returnTo so post-login OAuth resume lands back on the same board
      const next = `/api/notion/auth?returnTo=${encodeURIComponent(returnTo)}`
      return NextResponse.redirect(`${siteUrl}/login?next=${encodeURIComponent(next)}`)
    }

    const token = await exchangeNotionCode(code) // Trade code for access token
    if (!token.workspace_id) {
      console.error('Notion token missing workspace_id:', { bot_id: token.bot_id }) // Cannot upsert without conflict key
      return redirectError(siteUrl, returnTo, 'missing_workspace')
    }

    const admin = createAdminClient() // Bypass RLS to write secrets

    const { error: upsertError } = await admin.from('notion_connections').upsert(
      {
        user_id: user.id, // NodNotes owner
        access_token: token.access_token, // Secret token
        refresh_token: token.refresh_token ?? null, // Optional refresh
        workspace_id: token.workspace_id, // Required for (user_id, workspace_id) unique
        workspace_name: token.workspace_name ?? null, // Display name
        workspace_icon: token.workspace_icon ?? null, // Icon
        bot_id: token.bot_id ?? null, // Bot id
        duplicated_template_id: token.duplicated_template_id ?? null, // Template if any
        owner: token.owner ?? null, // Owner blob
        raw_token_response: token, // Full payload for future fields
        updated_at: new Date().toISOString(), // Touch timestamp
      },
      { onConflict: 'user_id,workspace_id' }
    )

    if (upsertError) {
      console.error('Failed to store Notion connection:', upsertError) // DB failure
      return redirectError(siteUrl, returnTo, 'store_failed')
    }

    // Prefer the board that started connect; only create a new board when none was specified
    let destPath = resolvePostAuthPath(returnTo) // /board/{id} or /board
    const match = returnTo.match(BOARD_PATH_RE) // UUID from returnTo
    if (!match) {
      // Connect started outside a specific board — create one named after the workspace
      try {
        const { data: created } = await admin
          .from('conversations')
          .insert({
            user_id: user.id,
            title: token.workspace_name || 'Notion',
            metadata: { position: -1, source: 'notion' },
          })
          .select('id')
          .single()
        if (created?.id) destPath = `/board/${created.id}` // New board for picker
      } catch (boardError) {
        console.error('Notion board create failed:', boardError) // Keep destPath = /board
      }
    }
    // When returnTo is /board/{id}, trust it — board page enforces access (owner or share)

    const dest = new URL(destPath, siteUrl)
    dest.searchParams.set('notion', 'connected') // Triggers connected UI refresh
    dest.searchParams.set('picker', '1') // Opens import modal with page tree
    const response = NextResponse.redirect(dest.toString())
    response.cookies.set('notion_oauth_state', '', { path: '/', maxAge: 0 })
    return response
  } catch (error) {
    console.error('Notion callback failed:', error) // Log exchange errors
    return redirectError(siteUrl, returnHint, 'callback_failed')
  }
}
