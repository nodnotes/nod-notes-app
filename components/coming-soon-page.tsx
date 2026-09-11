'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { waitForAuthUserId } from '@/lib/use-live-auth-user'

type Step = 'email' | 'code' // Request code, then enter it on this same device

/**
 * Public launch placeholder: coming soon + early-access email OTP (code).
 * Codes beat magic links here: email scanners often prefetch links and burn them,
 * and PKCE links fail when the inbox opens a different browser than the request.
 */
export function ComingSoonPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'not_invited') {
      setMessage({
        type: 'error',
        text: 'That email isn’t on the early access list.', // Own status only — never the list
      })
    }
  }, [])

  /** Normalize pasted codes (spaces / dashes) to digits only. */
  const digitsOnly = (value: string) => value.replace(/\D/g, '')

  /** Step 1: allowlist check, then send a one-time email code (same browser keeps the session). */
  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const trimmed = email.trim().toLowerCase()
      const res = await fetch('/api/early-access/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong.')
      }

      const supabase = createClient()
      // No emailRedirectTo required for code verify; omit link-oriented options
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: { shouldCreateUser: true },
      })
      if (error) {
        console.error('[coming-soon] signInWithOtp', error.message)
        throw new Error('Couldn’t send a sign-in code. Try again or use password sign-in.')
      }

      setEmail(trimmed)
      setCode('')
      setStep('code')
      setMessage({
        type: 'success',
        text: 'Check your email for an 8-digit sign-in code.',
      })
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong.',
      })
    } finally {
      setLoading(false)
    }
  }

  /** Step 2: verify the email OTP on this device, gate allowlist, ensure profile, enter app. */
  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const token = digitsOnly(code)
      if (token.length < 6) {
        throw new Error('Enter the full code from your email.')
      }

      const supabase = createClient()
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email', // Email OTP (not PKCE magic-link exchange)
      })
      if (error) {
        console.error('[coming-soon] verifyOtp', error.message)
        throw new Error('That code is invalid or expired. Request a new one.')
      }

      // Same allowlist gate as password + magic-link callback paths
      const gate = await fetch('/api/early-access/session', { method: 'POST' })
      if (!gate.ok) {
        const body = (await gate.json().catch(() => ({}))) as { error?: string }
        await supabase.auth.signOut().catch(() => {})
        throw new Error(body.error || 'Couldn’t sign in with that account.')
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user?.id) {
        throw new Error('Sign-in didn’t complete. Try again.')
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

      // Cookies must reflect this user before /board SSR + client fetch run
      await waitForAuthUserId(user.id, { timeoutMs: 8000 })
      window.location.assign('/board')
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden text-slate-900"
      data-coming-soon
    >
      {/* Soft atmospheric wash — not a flat fill; matches marketing blue without purple glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(59,130,246,0.14),transparent_55%),radial-gradient(80%_60%_at_100%_100%,rgba(15,23,42,0.06),transparent_50%),linear-gradient(180deg,#f8fafc_0%,#ffffff_45%,#f1f5f9_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(15,23,42,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
      />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
        <h1 className="mb-10 font-young-serif text-[clamp(2.25rem,8vw,3.5rem)] font-bold tracking-[0.02em] leading-[1.05] text-slate-900">
          Coming soon
        </h1>

        {step === 'email' ? (
          <form onSubmit={sendCode} className="w-full max-w-sm space-y-3 text-left">
            <label htmlFor="early-access-email" className="sr-only">
              Email
            </label>
            <input
              id="early-access-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white/80 px-4 text-base text-slate-900 outline-none ring-blue-500/40 transition placeholder:text-slate-400 focus:ring-2"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-500 px-6 text-base font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Email me a sign-in code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="w-full max-w-sm space-y-3 text-left">
            <p className="text-sm text-slate-600">
              Code sent to <span className="font-medium text-slate-900">{email}</span>
            </p>
            <label htmlFor="early-access-code" className="sr-only">
              Sign-in code
            </label>
            <input
              id="early-access-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(digitsOnly(e.target.value).slice(0, 8))}
              placeholder="8-digit code"
              className="h-12 w-full rounded-xl border border-slate-200 bg-white/80 px-4 text-center text-xl tracking-[0.35em] text-slate-900 outline-none ring-blue-500/40 transition placeholder:tracking-normal placeholder:text-slate-400 focus:ring-2"
            />
            <button
              type="submit"
              disabled={loading || digitsOnly(code).length < 6}
              className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-500 px-6 text-base font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setStep('email')
                setCode('')
                setMessage(null)
              }}
              className="inline-flex h-10 w-full items-center justify-center text-sm text-slate-500 underline-offset-2 hover:underline disabled:opacity-60"
            >
              Use a different email
            </button>
          </form>
        )}

        {message ? (
          <p
            className={`mt-4 text-sm ${
              message.type === 'success' ? 'text-emerald-700' : 'text-red-600'
            }`}
            role="status"
          >
            {message.text}
          </p>
        ) : null}

        <p className="mt-8 text-sm text-slate-500">
          Already have a password?{' '}
          <Link href="/access" className="text-blue-600 underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  )
}
