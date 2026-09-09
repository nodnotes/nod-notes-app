import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isComingSoon, isEarlyAccessEmail, normalizeEmail } from '@/lib/coming-soon'

const OK = { ok: true as const } // Invited: mail attempted
const INVALID_EMAIL = { error: 'Enter a valid email address.' } // Format only
const NOT_INVITED = { error: 'That email isn’t on the early access list.' } // Own status only — never the list
const SEND_FAIL = { error: 'Couldn’t send a sign-in link. Try again or use password sign-in.' }

/**
 * Magic-link request. Tell the requester if *their* email isn’t invited;
 * never return other allowlisted addresses.
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

    // Own email only: clear denial, no list leakage
    if (!isEarlyAccessEmail(email)) {
      return NextResponse.json(NOT_INVITED, { status: 403 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseKey) {
      console.error('[early-access/otp] auth env missing')
      return NextResponse.json(SEND_FAIL, { status: 502 })
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
      // Provider details stay server-side (SMTP/account state)
      return NextResponse.json(SEND_FAIL, { status: 502 })
    }

    return NextResponse.json(OK)
  } catch (err: unknown) {
    console.error('[early-access/otp]', err instanceof Error ? err.message : err)
    return NextResponse.json(SEND_FAIL, { status: 502 })
  }
}
