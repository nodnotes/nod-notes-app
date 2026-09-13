import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isComingSoon, isEarlyAccessEmail } from '@/lib/coming-soon'

/**
 * After password sign-in: confirm the session is allowlisted.
 * Returns not_invited for the signed-in email only — never the full list.
 */
export async function POST() {
  if (!isComingSoon()) {
    return NextResponse.json({ ok: true })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email || !user.email_confirmed_at) {
    await supabase.auth.signOut().catch(() => {})
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  if (!isEarlyAccessEmail(user.email)) {
    await supabase.auth.signOut().catch(() => {})
    // Clear denial for this email only
    return NextResponse.json(
      { ok: false, error: 'That email isn’t on the early access list.' },
      { status: 403 }
    )
  }

  return NextResponse.json({ ok: true })
}
