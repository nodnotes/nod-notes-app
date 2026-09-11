import { NotionMarkIcon } from '@/components/notion-mark-icon'

export function HomeHeroIntro() {
  return (
    <h1
      data-home-headline
      className="mb-6 w-fit max-w-none font-young-serif text-[clamp(2.5rem,6vw,5.5rem)] font-bold tracking-[0.02em] text-foreground leading-[1.05]"
    >
      <span className="block whitespace-nowrap">The visual workspace</span>
      <span className="mt-[0.12em] flex items-center justify-center gap-[0.06em] whitespace-nowrap">
        built for Notion
        <NotionMarkIcon className="h-[1.15em] w-[1.15em] shrink-0 -ml-[0.02em] text-foreground" />
      </span>
    </h1>
  )
}
