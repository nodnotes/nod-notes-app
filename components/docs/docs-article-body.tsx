import Link from 'next/link'
import type { DocsArticle, DocsBlock } from '@/lib/docs/content'
import { articleHref, getArticle } from '@/lib/docs/content'
import { cn } from '@/lib/utils'

function BlockView({ block }: { block: DocsBlock }) {
  switch (block.type) {
    case 'p':
      return <p className="text-[16px] leading-7 text-foreground/85">{block.text}</p>
    case 'h2':
      return (
        <h2 className="mt-10 scroll-mt-24 font-young-serif text-2xl tracking-tight text-foreground first:mt-0">
          {block.text}
        </h2>
      )
    case 'h3':
      return (
        <h3 className="mt-6 scroll-mt-24 text-lg font-semibold tracking-tight text-foreground">
          {block.text}
        </h3>
      )
    case 'ul':
      return (
        <ul className="list-disc space-y-2 pl-5 text-[16px] leading-7 text-foreground/85">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="list-decimal space-y-2 pl-5 text-[16px] leading-7 text-foreground/85">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      )
    case 'callout':
      return (
        <aside className="rounded-xl border border-blue-500/20 bg-blue-500/[0.06] px-4 py-3 text-[15px] leading-6 text-foreground/90">
          {block.text}
        </aside>
      )
    case 'steps':
      return (
        <ol className="space-y-4">
          {block.items.map((step, i) => (
            <li
              key={step.title}
              className="flex gap-3 rounded-xl border border-border bg-muted/30 p-4"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500 text-sm font-medium text-white">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium text-foreground">{step.title}</p>
                <p className="mt-1 text-[15px] leading-6 text-foreground/80">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )
    default:
      return null
  }
}

export function DocsArticleBody({
  article,
  className,
}: {
  article: DocsArticle
  className?: string
}) {
  return (
    <article className={cn('space-y-5', className)}>
      {article.body.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}

      {article.related && article.related.length > 0 ? (
        <section className="mt-12 border-t border-border pt-8">
          <h2 className="mb-4 font-young-serif text-xl tracking-tight">Related</h2>
          <ul className="space-y-2">
            {article.related.map((ref) => {
              const resolved = getArticle(ref.category, ref.slug)
              if (!resolved) return null
              return (
                <li key={`${ref.category}/${ref.slug}`}>
                  <Link
                    href={articleHref(ref.category, ref.slug)}
                    className="text-[15px] font-medium text-blue-600 hover:text-blue-700"
                  >
                    {resolved.article.title} →
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </article>
  )
}
