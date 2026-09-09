import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isComingSoon, isEarlyAccessEmail, normalizeEmail } from '@/lib/coming-soon'

/**
 * Send a magic-link / OTP only for allowlisted emails while COMING_SOON is on.
 * Uses the anon key so Supabase mailer runs as a normal auth request.
 */
export async function POST(request: Request) {
  try {
    if (!isComingSoon()) {
      // Outside launch gate, use normal /login — avoid dual entry points
      return NextResponse.json({ error: 'Early access is not enabled.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as { email?: string } | null
    const email = normalizeEmail(body?.email || '')
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }

    if (!isEarlyAccessEmail(email)) {
      // Same message whether unknown or not allowlisted — no email enumeration
      return NextResponse.json(
        { error: 'That email is not on the early-access list yet.' },
        { status: 403 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Auth is not configured.' }, { status: 500 })
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(
      /\/$/,
      ''
    )
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Land on board after magic link; middleware still re-checks allowlist
        emailRedirectTo: `${siteUrl}/auth/callback?next=/board`,
        shouldCreateUser: true, // First early-access visit mints the auth user
      },
    })

    if (error) {
      console.error('[early-access/otp]', error.message)
      return NextResponse.json(
        { error: error.message || 'Could not send sign-in email.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    console.error('[early-access/otp]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
