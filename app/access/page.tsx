'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const GENERIC_FAIL = "Couldn't sign in. Check your email and password."

/**
 * Password sign-in for early access. Wrong password stays opaque;
 * not-on-list is explicit for the submitted email only.
 */
export default function AccessPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email_confirmed_at) {
        router.replace('/board')
      }
    })
  }, [router, supabase])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (error || !data.session || !data.user) {
        await supabase.auth.signOut().catch(() => {})
        throw new Error(GENERIC_FAIL)
      }
      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut()
        throw new Error(GENERIC_FAIL)
      }

      // Server confirms allowlist; may return not-invited for this email only
      const gate = await fetch('/api/early-access/session', { method: 'POST' })
      if (!gate.ok) {
        const gateBody = (await gate.json().catch(() => ({}))) as { error?: string }
        await supabase.auth.signOut().catch(() => {})
        throw new Error(gateBody.error || GENERIC_FAIL)
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', data.user.id)
        .maybeSingle()
      if (!profile) {
        const { error: createError } = await supabase.from('profiles').insert({
          id: data.user.id,
          email: data.user.email,
        })
        if (createError) {
          await supabase.auth.signOut()
          throw new Error(GENERIC_FAIL)
        }
      }

      router.push('/board')
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : GENERIC_FAIL,
      })
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden text-slate-900">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(59,130,246,0.12),transparent_55%),linear-gradient(180deg,#f8fafc_0%,#ffffff_50%,#f1f5f9_100%)]"
      />
      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-6 py-16">
        {/* Explicit slate — page is always light; theme foreground goes white in dark mode */}
        <h1 className="mb-8 text-center font-young-serif text-2xl tracking-tight text-slate-900">
          Early access
        </h1>

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-4 text-sm text-slate-900 outline-none ring-blue-500/40 placeholder:text-slate-400 focus:ring-2"
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="h-11 w-full rounded-xl border border-slate-200 bg-white/80 px-4 text-sm text-slate-900 outline-none ring-blue-500/40 placeholder:text-slate-400 focus:ring-2"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-blue-500 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {message ? (
          <p className="mt-4 text-center text-sm text-red-600" role="status">
            {message.text}
          </p>
        ) : null}

        <p className="mt-6 text-center text-sm text-slate-500">
          Prefer a magic link?{' '}
          <Link href="/" className="text-blue-600 underline-offset-2 hover:underline">
            Request one on the home page
          </Link>
        </p>
      </main>
    </div>
  )
}
