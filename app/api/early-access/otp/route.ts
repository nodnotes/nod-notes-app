import { NextResponse } from 'next/server'
import { isComingSoon, isEarlyAccessEmail, normalizeEmail } from '@/lib/coming-soon'

const OK = { ok: true as const } // Allowlisted — client may send the magic link
const INVALID_EMAIL = { error: 'Enter a valid email address.' }
const NOT_INVITED = { error: 'That email isn’t on the early access list.' }

/**
 * Early-access gate before email OTP. Does not send mail — the browser client
 * calls signInWithOtp, then verifyOtp with the emailed code on the same page.
 * Returns not-invited for the submitted email only (never the full list).
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

    if (!isEarlyAccessEmail(email)) {
      return NextResponse.json(NOT_INVITED, { status: 403 })
    }

    return NextResponse.json(OK)
  } catch (err: unknown) {
    console.error('[early-access/otp]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
