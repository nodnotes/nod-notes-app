import { createClient } from '@/lib/supabase/server'
import { isComingSoon, isEarlyAccessEmail } from '@/lib/coming-soon'
import { NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

/** Relative in-app path only (same rule as middleware). */
function safeNext(next: string | null): string {
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('://')) return next
  return '/board'
}

/**
 * PKCE / email OTP callback. Hash tokens are invisible here — those land on
 * /auth/auth-code-error (client) which recovers the session from the fragment.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const token_hash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null
  const next = safeNext(requestUrl.searchParams.get('next'))
  const origin = requestUrl.origin

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth/callback] exchangeCodeForSession', error.message)
      return NextResponse.redirect(new URL(`/auth/auth-code-error?next=${encodeURIComponent(next)}`, origin))
    }
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (error) {
      console.error('[auth/callback] verifyOtp', error.message)
      return NextResponse.redirect(new URL(`/auth/auth-code-error?next=${encodeURIComponent(next)}`, origin))
    }
  } else {
    // Likely implicit flow: tokens are in the URL hash only — hand off to client page
    return NextResponse.redirect(
      new URL(`/auth/auth-code-error?next=${encodeURIComponent(next)}`, origin)
    )
  }

  if (isComingSoon()) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!isEarlyAccessEmail(user?.email)) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/?error=not_invited', origin))
    }
    if (user?.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()
      if (!profile) {
        await supabase.from('profiles').insert({
          id: user.id,
          email: user.email,
        })
      }
    }
  }

  return NextResponse.redirect(new URL(next, origin))
}
