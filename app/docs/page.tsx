import Link from 'next/link'
import { DocsSearch } from '@/components/docs/docs-search'
import { DocsTopicIcon } from '@/components/docs/docs-topic-icon'
import {
  DOCS_CATEGORIES,
  DOCS_POPULAR,
  articleHref,
  categoryHref,
} from '@/lib/docs/content'

export default function DocsHomePage() {
  return (
    <div className="min-w-0">
      <section className="pb-12 pt-4 text-center min-[900px]:pb-16 min-[900px]:pt-8">
        <h1 className="mb-6 font-young-serif text-[clamp(1.75rem,4vw,2.75rem)] font-normal tracking-tight text-foreground">
          Hi, how can we help you?
        </h1>
        <DocsSearch />
      </section>

      <section className="pb-14">
        <h2 className="mb-5 text-lg font-semibold tracking-tight">Popular topics</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DOCS_POPULAR.map((topic) => (
            <Link
              key={`${topic.category}/${topic.slug}`}
              href={articleHref(topic.category, topic.slug)}
              className="group relative flex min-h-[132px] flex-col rounded-2xl bg-muted/60 p-5 transition-colors hover:bg-muted"
            >
              <h3 className="pr-10 text-[15px] font-semibold text-foreground">
                {topic.title}
              </h3>
              <p className="mt-1.5 pr-8 text-sm leading-6 text-muted-foreground">
                {topic.description}
              </p>
              <DocsTopicIcon
                id={topic.icon}
                className="absolute bottom-4 right-4 h-8 w-8 text-foreground/70 transition-transform group-hover:scale-105"
              />
            </Link>
          ))}
        </div>
      </section>

      <section className="pb-14">
        <h2 className="mb-5 text-lg font-semibold tracking-tight">Browse by topic</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {DOCS_CATEGORIES.map((category) => (
            <Link
              key={category.slug}
              href={categoryHref(category.slug)}
              className="flex items-start gap-3 rounded-2xl border border-border bg-background p-4 transition-colors hover:border-blue-500/30 hover:bg-muted/40"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <DocsTopicIcon id={category.icon} className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-foreground">
                  {category.title}
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {category.description}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground/80">
                  {category.articles.length === 1
                    ? '1 article'
                    : `${category.articles.length} articles`}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-muted/40 p-6 min-[900px]:p-8">
        <h2 className="mb-2 font-young-serif text-2xl tracking-tight">Still have questions?</h2>
        <p className="mb-5 max-w-lg text-sm leading-6 text-muted-foreground">
          Can’t find what you need in the Help Center? Reach out — we’re happy to help with boards,
          Notion sync, billing, and account access.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/support"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-blue-500 px-5 text-sm font-medium text-white hover:bg-blue-600"
          >
            Contact support
          </Link>
          <Link
            href="/pricing"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-medium text-foreground hover:bg-muted/60"
          >
            View pricing
          </Link>
        </div>
      </section>
    </div>
  )
}
