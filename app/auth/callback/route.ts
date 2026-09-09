import { createClient } from '@/lib/supabase/server'
import { isComingSoon, isEarlyAccessEmail } from '@/lib/coming-soon'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') || '/board'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Launch gate: magic-link sessions still must be allowlisted
      if (isComingSoon()) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!isEarlyAccessEmail(user?.email)) {
          await supabase.auth.signOut()
          return NextResponse.redirect(new URL('/?error=not_invited', requestUrl.origin))
        }
        // Ensure profile row exists for first-time OTP users (trigger may be missing)
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

      // Only allow relative in-app redirects (same rule as middleware)
      const safeNext =
        next.startsWith('/') && !next.startsWith('//') && !next.includes('://') ? next : '/board'
      return NextResponse.redirect(new URL(safeNext, requestUrl.origin))
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(new URL('/auth/auth-code-error', requestUrl.origin))
}
