'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  DOCS_CATEGORIES,
  categoryHref,
  articleHref,
} from '@/lib/docs/content'
import { cn } from '@/lib/utils'

/** Left rail — Notion Help Center style expandable categories */
export function DocsSidebar({ className }: { className?: string }) {
  const pathname = usePathname()
  const activeCategory = DOCS_CATEGORIES.find((c) =>
    pathname?.startsWith(`/docs/${c.slug}`)
  )?.slug

  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      DOCS_CATEGORIES.map((c) => [c.slug, c.slug === activeCategory])
    )
  )

  useEffect(() => {
    if (!activeCategory) return
    setOpen((prev) =>
      prev[activeCategory] ? prev : { ...prev, [activeCategory]: true }
    )
  }, [activeCategory])

  return (
    <nav
      aria-label="Help Center"
      className={cn('flex flex-col gap-6 text-[15px]', className)}
    >
      <div>
        <Link
          href="/docs"
          className={cn(
            'mb-2 block text-sm font-semibold tracking-tight',
            pathname === '/docs'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Help Center
        </Link>
        <ul className="space-y-0.5">
          {DOCS_CATEGORIES.map((category) => {
            const isOpen = open[category.slug]
            const isCatActive = pathname?.startsWith(`/docs/${category.slug}`)
            return (
              <li key={category.slug}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/70',
                    isCatActive ? 'text-foreground font-medium' : 'text-foreground/80'
                  )}
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen((prev) => ({
                      ...prev,
                      [category.slug]: !prev[category.slug],
                    }))
                  }
                >
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  )}
                  <span className="truncate">{category.title}</span>
                </button>
                {isOpen ? (
                  <ul className="mb-1 ml-2 border-l border-border pl-3">
                    <li>
                      <Link
                        href={categoryHref(category.slug)}
                        className={cn(
                          'block rounded-md px-2 py-1 text-[13px] transition-colors hover:bg-muted/70',
                          pathname === `/docs/${category.slug}`
                            ? 'bg-muted font-medium text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        Overview
                      </Link>
                    </li>
                    {category.articles.map((article) => {
                      const href = articleHref(category.slug, article.slug)
                      const active = pathname === href
                      return (
                        <li key={article.slug}>
                          <Link
                            href={href}
                            className={cn(
                              'block rounded-md px-2 py-1 text-[13px] transition-colors hover:bg-muted/70',
                              active
                                ? 'bg-muted font-medium text-foreground'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            {article.title}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>
      </div>

      <div>
        <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Support
        </p>
        <ul className="space-y-0.5">
          <li>
            <Link
              href="/support"
              className="block rounded-md px-2 py-1.5 text-foreground/80 transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              Contact support
            </Link>
          </li>
          <li>
            <Link
              href="/pricing"
              className="block rounded-md px-2 py-1.5 text-foreground/80 transition-colors hover:bg-muted/70 hover:text-foreground"
            >
              Pricing
            </Link>
          </li>
        </ul>
      </div>
    </nav>
  )
}
