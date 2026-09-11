'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { articleHref, searchDocs, DOCS_SEARCH_CHIPS } from '@/lib/docs/content'
import { cn } from '@/lib/utils'

/** Notion-style help search with live results + chip shortcuts */
export function DocsSearch({ className }: { className?: string }) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchDocs(query).slice(0, 8), [query])

  return (
    <div className={cn('mx-auto w-full max-w-xl', className)}>
      <label className="relative block">
        <span className="sr-only">Search help center</span>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for anything…"
          className="h-12 w-full rounded-full border border-border bg-background pl-11 pr-4 text-[15px] shadow-sm outline-none transition-[box-shadow,border-color] placeholder:text-muted-foreground focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20"
          autoComplete="off"
        />
      </label>

      {query.trim() ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No results for “{query.trim()}”. Try frames, threads, Notion, or billing.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {results.map(({ category, article }) => (
                <li key={`${category.slug}/${article.slug}`}>
                  <Link
                    href={articleHref(category.slug, article.slug)}
                    className="block px-4 py-3 transition-colors hover:bg-muted/50"
                    onClick={() => setQuery('')}
                  >
                    <p className="text-sm font-medium text-foreground">{article.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {category.title} · {article.description}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {DOCS_SEARCH_CHIPS.map((chip) => (
            <Link
              key={chip.label}
              href={articleHref(chip.category, chip.slug)}
              className="rounded-full bg-muted/80 px-3.5 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
            >
              {chip.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
