import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  DOCS_CATEGORIES,
  articleHref,
  getCategory,
} from '@/lib/docs/content'
import { DocsTopicIcon } from '@/components/docs/docs-topic-icon'

type Props = { params: Promise<{ category: string }> }

export function generateStaticParams() {
  return DOCS_CATEGORIES.map((c) => ({ category: c.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: slug } = await params
  const category = getCategory(slug)
  if (!category) return { title: 'Docs — Nod Notes' }
  return {
    title: `${category.title} — Nod Notes Help`,
    description: category.description,
  }
}

export default async function DocsCategoryPage({ params }: Props) {
  const { category: slug } = await params
  const category = getCategory(slug)
  if (!category) notFound()

  return (
    <div className="min-w-0">
      <div className="mb-8 flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-muted">
          <DocsTopicIcon id={category.icon} className="h-6 w-6" />
        </span>
        <div>
          <p className="mb-1 text-sm text-muted-foreground">
            <Link href="/docs" className="hover:text-foreground">
              Help Center
            </Link>
            <span className="mx-1.5 opacity-40">/</span>
            {category.title}
          </p>
          <h1 className="font-young-serif text-[clamp(1.75rem,3.5vw,2.5rem)] tracking-tight">
            {category.title}
          </h1>
          <p className="mt-2 max-w-2xl text-[16px] leading-7 text-muted-foreground">
            {category.description}
          </p>
        </div>
      </div>

      <ul className="divide-y divide-border rounded-2xl border border-border">
        {category.articles.map((article) => (
          <li key={article.slug}>
            <Link
              href={articleHref(category.slug, article.slug)}
              className="flex flex-col gap-1 px-5 py-4 transition-colors hover:bg-muted/40 min-[900px]:flex-row min-[900px]:items-baseline min-[900px]:justify-between min-[900px]:gap-8"
            >
              <span className="text-[15px] font-semibold text-foreground">
                {article.title}
              </span>
              <span className="text-sm text-muted-foreground min-[900px]:max-w-md min-[900px]:text-right">
                {article.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
