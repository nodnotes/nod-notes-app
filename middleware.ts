import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  isComingSoon,
  isComingSoonPublicPath,
  isEarlyAccessEmail,
} from '@/lib/coming-soon'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired - required for Server Components
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const comingSoon = isComingSoon()

  // --- Coming soon launch gate ---
  if (comingSoon) {
    // Public marketing login/signup → early-access entry
    if (pathname.startsWith('/login') || pathname.startsWith('/signup')) {
      const url = request.nextUrl.clone()
      url.pathname = '/access'
      url.search = ''
      return NextResponse.redirect(url)
    }

    const onPublicPath = isComingSoonPublicPath(pathname)

    if (user && !isEarlyAccessEmail(user.email)) {
      // Signed in but not invited — drop session and send to placeholder
      await supabase.auth.signOut()
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.searchParams.set('error', 'not_invited')
      return NextResponse.redirect(url)
    }

    if (!onPublicPath) {
      if (!user) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.search = ''
        return NextResponse.redirect(url)
      }
      if (!user.email_confirmed_at) {
        const url = request.nextUrl.clone()
        url.pathname = '/access'
        url.searchParams.set('error', 'email_not_verified')
        await supabase.auth.signOut()
        return NextResponse.redirect(url)
      }
      // Allowlisted + verified → fall through to normal board/profile checks below
    } else if (user && isEarlyAccessEmail(user.email) && pathname === '/access') {
      // Invited users on /access → app; keep `/` as the marketing homepage
      if (user.email_confirmed_at) {
        const url = request.nextUrl.clone()
        url.pathname = '/board'
        url.search = ''
        return NextResponse.redirect(url)
      }
    }
  }

  // Protect /board routes
  if (request.nextUrl.pathname.startsWith('/board')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = comingSoon ? '/access' : '/login'
      // Preserve ?s= share tokens through login (path + query only; no open redirect)
      const resume = `${request.nextUrl.pathname}${request.nextUrl.search}`
      url.searchParams.set('redirectTo', resume)
      return NextResponse.redirect(url)
    }

    // Check if email is verified
    if (!user.email_confirmed_at) {
      const url = request.nextUrl.clone()
      url.pathname = comingSoon ? '/access' : '/login'
      url.searchParams.set('error', 'email_not_verified')
      // Sign out unverified user
      await supabase.auth.signOut()
      return NextResponse.redirect(url)
    }

    // Coming soon: allowlist already enforced above
    if (comingSoon && !isEarlyAccessEmail(user.email)) {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.searchParams.set('error', 'not_invited')
      await supabase.auth.signOut()
      return NextResponse.redirect(url)
    }

    // Verify profile exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      // Profile missing - redirect to signup or show error
      const url = request.nextUrl.clone()
      url.pathname = comingSoon ? '/access' : '/login'
      url.searchParams.set('error', 'profile_missing')
      await supabase.auth.signOut()
      return NextResponse.redirect(url)
    }
  }

  // Redirect authenticated users away from auth pages
  if (request.nextUrl.pathname.startsWith('/login') || request.nextUrl.pathname.startsWith('/signup')) {
    if (user) {
      const url = request.nextUrl.clone()
      // Honor resume targets (e.g. Notion OAuth start) when safe/relative
      const resume = request.nextUrl.searchParams.get('next') || request.nextUrl.searchParams.get('redirectTo')
      // Relative app paths only (allows /board/{id}?s=…); block protocol-relative / absolute URLs
      if (
        resume &&
        resume.startsWith('/') &&
        !resume.startsWith('//') &&
        !resume.includes('://')
      ) {
        return NextResponse.redirect(new URL(resume, request.url))
      }
      url.pathname = '/board'
      url.search = ''
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
