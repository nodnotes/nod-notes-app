import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isComingSoon, isEarlyAccessEmail, normalizeEmail } from '@/lib/coming-soon'

const GENERIC_OK = { ok: true as const }
const INVALID_EMAIL = { error: 'Enter a valid email address.' }

/**
 * Magic-link request. Always returns the same success shape so callers cannot
 * learn whether an email is on the allowlist. OTP is only sent when invited.
 */
export async function POST(request: Request) {
  try {
    if (!isComingSoon()) {
      return NextResponse.json({ error: 'Early access is not enabled.' }, { status: 400 })
    }

    const body = (await request.json().catch(() => null)) as { email?: string } | null
    const email = normalizeEmail(body?.email || '')
    if (!email || !email.includes('@')) {
      return NextResponse.json(INVALID_EMAIL, { status: 400 })
    }

    // Not invited → same OK response, no mail (anti-enumeration)
    if (!isEarlyAccessEmail(email)) {
      return NextResponse.json(GENERIC_OK)
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) {
      console.error('[early-access/otp] auth env missing')
      // Still generic to the client
      return NextResponse.json(GENERIC_OK)
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin).replace(
      /\/$/,
      ''
    )
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback?next=/board`,
        shouldCreateUser: true,
      },
    })

    if (error) {
      console.error('[early-access/otp]', error.message)
      // Do not leak provider errors (could reveal account state)
      return NextResponse.json(GENERIC_OK)
    }

    return NextResponse.json(GENERIC_OK)
  } catch (err: unknown) {
    console.error('[early-access/otp]', err instanceof Error ? err.message : err)
    return NextResponse.json(GENERIC_OK)
  }
}
