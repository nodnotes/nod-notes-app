'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

/**
 * Public launch placeholder: brand wordmark + early-access email magic link.
 */
export function ComingSoonPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'not_invited') {
      setMessage({
        type: 'error',
        text: "Couldn't sign in with that account.",
      })
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/early-access/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        // Only surface validation errors (e.g. bad email format)
        throw new Error(data.error || 'Something went wrong.')
      }
      setMessage({
        type: 'success',
        text: 'If that email has early access, you’ll get a sign-in link shortly.',
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

  return (
    <div
      className="relative min-h-[100dvh] overflow-hidden text-foreground"
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
        {/* Wordmark only — no icon on the launch placeholder */}
        <div className="mb-8 inline-flex items-center text-4xl leading-none min-[900px]:text-5xl">
          <span className="font-young-serif font-normal text-blue-500">Nod</span>
          <span className="font-young-serif font-normal text-foreground">Notes</span>
        </div>

        <h1 className="mb-10 font-young-serif text-[clamp(2.25rem,8vw,3.5rem)] font-bold tracking-[0.02em] leading-[1.05]">
          Coming soon
        </h1>

        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-3 text-left">
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
            className="h-12 w-full rounded-xl border border-border bg-white/80 px-4 text-base outline-none ring-blue-500/40 transition focus:ring-2"
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-blue-500 px-6 text-base font-medium text-white transition-colors hover:bg-blue-600 disabled:opacity-60"
          >
            {loading ? 'Sending…' : 'Email me a sign-in link'}
          </button>
        </form>

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

        <p className="mt-8 text-sm text-muted-foreground">
          Already have a password?{' '}
          <Link href="/access" className="text-blue-600 underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  )
}
