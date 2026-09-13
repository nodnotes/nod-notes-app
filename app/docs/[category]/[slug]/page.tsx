import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { DocsArticleBody } from '@/components/docs/docs-article-body'
import {
  categoryHref,
  getArticle,
  getAllArticles,
} from '@/lib/docs/content'

type Props = {
  params: Promise<{ category: string; slug: string }>
}

export function generateStaticParams() {
  return getAllArticles().map(({ category, article }) => ({
    category: category.slug,
    slug: article.slug,
  }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: categorySlug, slug } = await params
  const resolved = getArticle(categorySlug, slug)
  if (!resolved) return { title: 'Docs — Nod Notes' }
  return {
    title: `${resolved.article.title} — Nod Notes Help`,
    description: resolved.article.description,
  }
}

export default async function DocsArticlePage({ params }: Props) {
  const { category: categorySlug, slug } = await params
  const resolved = getArticle(categorySlug, slug)
  if (!resolved) notFound()

  const { category, article } = resolved
  const index = category.articles.findIndex((a) => a.slug === slug)
  const prev = index > 0 ? category.articles[index - 1] : null
  const next =
    index >= 0 && index < category.articles.length - 1
      ? category.articles[index + 1]
      : null

  return (
    <div className="min-w-0">
      <p className="mb-3 text-sm text-muted-foreground">
        <Link href="/docs" className="hover:text-foreground">
          Help Center
        </Link>
        <span className="mx-1.5 opacity-40">/</span>
        <Link href={categoryHref(category.slug)} className="hover:text-foreground">
          {category.title}
        </Link>
      </p>

      <h1 className="mb-3 font-young-serif text-[clamp(1.75rem,3.5vw,2.5rem)] tracking-tight">
        {article.title}
      </h1>
      <p className="mb-10 max-w-2xl text-[16px] leading-7 text-muted-foreground">
        {article.description}
      </p>

      <DocsArticleBody article={article} />

      <nav className="mt-14 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
        {prev ? (
          <Link
            href={`/docs/${category.slug}/${prev.slug}`}
            className="rounded-xl border border-border p-4 transition-colors hover:bg-muted/40"
          >
            <span className="block text-xs uppercase tracking-wider text-muted-foreground">
              Previous
            </span>
            <span className="mt-1 block text-sm font-medium text-foreground">
              ← {prev.title}
            </span>
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link
            href={`/docs/${category.slug}/${next.slug}`}
            className="rounded-xl border border-border p-4 text-right transition-colors hover:bg-muted/40"
          >
            <span className="block text-xs uppercase tracking-wider text-muted-foreground">
              Next
            </span>
            <span className="mt-1 block text-sm font-medium text-foreground">
              {next.title} →
            </span>
          </Link>
        ) : null}
      </nav>
    </div>
  )
}
