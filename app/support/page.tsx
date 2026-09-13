import type { Metadata } from 'next'
import Link from 'next/link'
import { HomeTopNav } from '@/components/home-top-nav'
import { HomeFooter } from '@/components/home-footer'

export const metadata: Metadata = {
  title: 'Support — Nod Notes',
  description: 'Contact Nod Notes support for account, billing, boards, and Notion sync help.',
}

export default function SupportPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground" data-docs-page>
      <HomeTopNav />
      <main className="mx-auto max-w-2xl px-5 py-16 min-[900px]:px-8 min-[900px]:py-24">
        <p className="mb-3 text-sm text-muted-foreground">
          <Link href="/docs" className="hover:text-foreground">
            Help Center
          </Link>
          <span className="mx-1.5 opacity-40">/</span>
          Support
        </p>
        <h1 className="mb-4 font-young-serif text-[clamp(1.75rem,4vw,2.75rem)] tracking-tight">
          Contact support
        </h1>
        <p className="mb-8 text-[16px] leading-7 text-muted-foreground">
          For account access, billing, Notion connection issues, or board recovery, email us and
          include your account email plus the board title if relevant.
        </p>
        <a
          href="mailto:support@nodnotes.com"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-500 px-6 text-base font-medium text-white hover:bg-blue-600"
        >
          Email support@nodnotes.com
        </a>
        <p className="mt-10 text-sm text-muted-foreground">
          Looking for guides instead?{' '}
          <Link href="/docs" className="font-medium text-blue-600 hover:text-blue-700">
            Browse the Help Center →
          </Link>
        </p>
      </main>
      <HomeFooter />
    </div>
  )
}
