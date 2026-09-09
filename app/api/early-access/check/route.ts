import { NextResponse } from 'next/server'
import { isComingSoon, isEarlyAccessEmail, normalizeEmail } from '@/lib/coming-soon'

/** Allowlist probe for password sign-in — does not send email. */
export async function POST(request: Request) {
  if (!isComingSoon()) {
    return NextResponse.json({ allowed: true }) // Gate off → password login unrestricted here
  }

  const body = (await request.json().catch(() => null)) as { email?: string } | null
  const email = normalizeEmail(body?.email || '')
  if (!email || !email.includes('@')) {
    return NextResponse.json({ allowed: false, error: 'Enter a valid email address.' }, { status: 400 })
  }

  if (!isEarlyAccessEmail(email)) {
    return NextResponse.json(
      { allowed: false, error: 'That email is not on the early-access list yet.' },
      { status: 403 }
    )
  }

  return NextResponse.json({ allowed: true })
}
