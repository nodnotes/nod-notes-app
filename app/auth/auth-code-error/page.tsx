'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Finish magic-link / OAuth when tokens arrive in the URL hash (implicit flow)
 * or when a PKCE session cookie is already set. Used when /auth/callback had no ?code=.
 */
export default function AuthCodeErrorPage() {
  const router = useRouter()
  const [status, setStatus] = useState('Signing you in…')

  useEffect(() => {
    let cancelled = false

    const finish = async () => {
      const supabase = createClient()
      const hash = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : ''
      const params = new URLSearchParams(hash)
      const access_token = params.get('access_token')
      const refresh_token = params.get('refresh_token')
      const nextRaw = new URLSearchParams(window.location.search).get('next') || '/board'
      const next =
        nextRaw.startsWith('/') && !nextRaw.startsWith('//') && !nextRaw.includes('://')
          ? nextRaw
          : '/board'

      try {
        // Implicit magic-link: tokens only exist in the fragment (server never saw them)
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({ access_token, refresh_token })
          if (error) throw error
          // Drop secrets from the address bar
          window.history.replaceState({}, '', window.location.pathname + window.location.search)
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()
        if (userError || !user) {
          throw new Error('Sign-in link expired or invalid.')
        }

        // Coming-soon allowlist (same gate as password / PKCE callback)
        const gate = await fetch('/api/early-access/session', { method: 'POST' })
        if (!gate.ok) {
          const body = (await gate.json().catch(() => ({}))) as { error?: string }
          await supabase.auth.signOut().catch(() => {})
          throw new Error(body.error || 'Couldn’t sign in with that account.')
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()
        if (!profile) {
          const { error: insertError } = await supabase.from('profiles').insert({
            id: user.id,
            email: user.email,
          })
          if (insertError) throw insertError
        }

        if (!cancelled) router.replace(next)
      } catch (err: unknown) {
        if (cancelled) return
        setStatus(err instanceof Error ? err.message : 'Couldn’t complete sign-in.')
        setTimeout(() => {
          if (!cancelled) router.replace('/access')
        }, 2500)
      }
    }

    void finish()
    return () => {
      cancelled = true
    }
  }, [router])

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-slate-50 px-6 text-slate-900">
      <p className="text-center text-sm text-slate-600" role="status">
        {status}
      </p>
    </div>
  )
}
