import type { Metadata } from 'next'
import { HomeTopNav } from '@/components/home-top-nav'
import { HomeFooter } from '@/components/home-footer'
import { DocsShellNav } from '@/components/docs/docs-shell-nav'

export const metadata: Metadata = {
  title: 'Help Center — Nod Notes',
  description:
    'Learn Nod Notes: boards, frames, blocks, threads, Nod AI, Notion sync, flashcards, and more.',
}

/** Notion-style help center chrome — marketing nav + scrollable docs shell */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground" data-docs-page>
      <HomeTopNav />
      <DocsShellNav>{children}</DocsShellNav>
      <HomeFooter />
    </div>
  )
}
