import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isComingSoon, isEarlyAccessEmail } from '@/lib/coming-soon'

/**
 * After password sign-in: confirm the session is allowlisted.
 * Returns only ok / not-ok — never why (no invite enumeration).
 */
export async function POST() {
  if (!isComingSoon()) {
    return NextResponse.json({ ok: true })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email || !user.email_confirmed_at || !isEarlyAccessEmail(user.email)) {
    // Drop the session server-side when possible
    await supabase.auth.signOut().catch(() => {})
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
