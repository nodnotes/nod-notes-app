'use client'

import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { DocsSidebar } from '@/components/docs/docs-sidebar'
import { cn } from '@/lib/utils'

/** Mobile drawer + sticky desktop rail for the docs shell */
export function DocsShellNav({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="relative mx-auto flex w-full max-w-6xl gap-10 px-5 pb-20 pt-6 min-[900px]:px-8 min-[900px]:pt-10">
      <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-56 shrink-0 overflow-y-auto min-[900px]:block">
        <DocsSidebar />
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-4 min-[900px]:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground/80"
          >
            <Menu className="h-4 w-4" aria-hidden />
            Browse docs
          </button>
        </div>
        {children}
      </div>

      <div
        className={cn(
          'fixed inset-0 z-[60] min-[900px]:hidden',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          type="button"
          className={cn(
            'absolute inset-0 bg-black/30 transition-opacity',
            mobileOpen ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        />
        <div
          className={cn(
            'absolute left-0 top-0 flex h-full w-[min(300px,88vw)] flex-col bg-background shadow-xl transition-transform',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Help Center</p>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-4">
            <DocsSidebar />
          </div>
        </div>
      </div>
    </div>
  )
}
