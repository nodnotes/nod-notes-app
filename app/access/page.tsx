'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { NodNotesIcon } from '@/components/nod-notes-icon'
import { createClient } from '@/lib/supabase/client'

/**
 * Password sign-in for allowlisted early-access accounts (magic link lives on /).
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
      const check = await fetch('/api/early-access/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const checkData = (await check.json().catch(() => ({}))) as {
        allowed?: boolean
        error?: string
      }
      if (!check.ok || !checkData.allowed) {
        throw new Error(checkData.error || 'That email is not on the early-access list yet.')
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      if (!data.session) throw new Error('No session returned.')
      if (!data.user.email_confirmed_at) {
        await supabase.auth.signOut()
        throw new Error('Verify your email before signing in.')
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
          throw new Error('Account setup incomplete. Please contact support.')
        }
      }

      router.push('/board')
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to sign in.',
      })
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(59,130,246,0.12),transparent_55%),linear-gradient(180deg,#f8fafc_0%,#ffffff_50%,#f1f5f9_100%)]"
      />
      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-6 py-16">
        <Link
          href="/"
          className="mb-8 inline-flex items-center self-center text-3xl leading-none"
          aria-label="Nod Notes home"
        >
          <NodNotesIcon className="mr-1.5 h-[1cap] w-auto shrink-0 text-gray-700" />
          <span className="font-young-serif text-blue-500">Nod</span>
          <span className="font-young-serif text-foreground">Notes</span>
        </Link>

        <h1 className="mb-2 text-center font-young-serif text-2xl tracking-tight">Early access</h1>
        <p className="mb-8 text-center text-sm text-muted-foreground">
          Invite-only sign-in while Nod Notes is in coming soon.
        </p>

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="h-11 w-full rounded-xl border border-border bg-white/80 px-4 text-sm outline-none ring-blue-500/40 focus:ring-2"
          />
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="h-11 w-full rounded-xl border border-border bg-white/80 px-4 text-sm outline-none ring-blue-500/40 focus:ring-2"
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

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Prefer a magic link?{' '}
          <Link href="/" className="text-blue-600 underline-offset-2 hover:underline">
            Request one on the home page
          </Link>
        </p>
      </main>
    </div>
  )
}
