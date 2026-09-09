import Link from 'next/link'
import { ComingSoonPage } from '@/components/coming-soon-page'
import { HomeBoardPreview } from '@/components/home-board-preview'
import { HomeHeroIntro } from '@/components/home-hero-intro'
import { HomeHeroThread } from '@/components/home-hero-thread'
import { HomeTopNav } from '@/components/home-top-nav'
import { isComingSoon } from '@/lib/coming-soon'
import {
  getResolvedShowcaseBoards,
  type ResolvedShowcaseBoard,
} from '@/lib/public-showcase-boards'

function SplitShowcase({
  board,
  reversed,
  previewSlot,
  copySlot,
}: {
  board: ResolvedShowcaseBoard
  reversed?: boolean
  previewSlot?: 1 | 2 | 3
  copySlot?: 1 | 2 | 3
}) {
  return (
    <article className="container mx-auto grid items-center gap-8 px-4 min-[900px]:grid-cols-2 min-[900px]:gap-12 min-[900px]:px-6">
      <div
        className={
          reversed
            ? 'relative z-10 bg-background max-[899px]:-mx-1 max-[899px]:px-1 min-[900px]:order-2'
            : 'relative z-10 bg-background max-[899px]:-mx-1 max-[899px]:px-1'
        }
        {...(copySlot != null ? { 'data-home-showcase-copy': String(copySlot) } : {})}
      >
        <h2 className="mb-3 text-2xl font-semibold tracking-tight min-[900px]:text-3xl">
          {board.title}
        </h2>
        <p className="mb-4 text-muted-foreground">{board.description}</p>
        <Link
          href={`/view/${board.id}`}
          className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          Open full board →
        </Link>
      </div>
      <div className={reversed ? 'relative z-10 min-[900px]:order-1' : 'relative z-10'}>
        <HomeBoardPreview
          boardId={board.id}
          title={board.title}
          previewSlot={previewSlot}
        />
      </div>
    </article>
  )
}

function FullWidthShowcase({ board }: { board: ResolvedShowcaseBoard }) {
  return (
    <article className="mx-auto w-full max-w-6xl space-y-6 px-4 min-[900px]:px-6">
      <div
        className="relative z-10 bg-background text-center max-[899px]:-mx-1 max-[899px]:px-1"
        data-home-showcase-copy="2"
      >
        <h2 className="mb-3 text-2xl font-semibold tracking-tight min-[900px]:text-3xl">
          {board.title}
        </h2>
        <p className="mx-auto mb-2 max-w-2xl text-muted-foreground">{board.description}</p>
        <Link
          href={`/view/${board.id}`}
          className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          Open full board →
        </Link>
      </div>
      <div className="relative z-10">
        <HomeBoardPreview boardId={board.id} title={board.title} fullWidth previewSlot={2} showAiSidebar />
      </div>
    </article>
  )
}

export default function Home() {
  // Launch gate: public visitors only see the placeholder until COMING_SOON is cleared
  if (isComingSoon()) {
    return <ComingSoonPage />
  }

  const showcaseBoards = getResolvedShowcaseBoards()
  const first = showcaseBoards[0]
  const second = showcaseBoards[1]
  const third = showcaseBoards[2]

  return (
    <div className="relative min-h-screen bg-background text-foreground" data-home-page>
      <HomeTopNav />
      <HomeHeroThread />

      <main>
        <section className="relative z-10 container mx-auto px-4 min-[900px]:px-6 py-20 min-[900px]:py-28 text-center">
          <div className="mx-auto flex w-fit flex-col items-center bg-background max-[899px]:px-2">
            <HomeHeroIntro />

            <p className="mb-10 w-fit text-center font-notes-sans text-lg min-[900px]:text-xl lg:text-2xl text-gray-600">
              Turn your pages into visual boards and automations.
            </p>
          </div>

          <Link
            href="/login"
            className="relative z-10 inline-flex items-center justify-center rounded-full bg-gray-950 px-8 py-3 font-young-serif text-sm min-[900px]:text-base text-white hover:opacity-90 transition-opacity"
          >
            Get started free
          </Link>
        </section>

        {showcaseBoards.length > 0 ? (
          <section className="space-y-20 pb-20">
            {first ? <SplitShowcase board={first} previewSlot={1} copySlot={1} /> : null}
            {second ? <FullWidthShowcase board={second} /> : null}
            {third ? (
              <SplitShowcase board={third} reversed previewSlot={3} copySlot={3} />
            ) : null}
          </section>
        ) : (
          <section className="container mx-auto px-4 min-[900px]:px-6 pb-20 text-center">
            <p className="text-muted-foreground">
              Showcase boards are not configured yet. Set{' '}
              <code className="text-sm">NEXT_PUBLIC_SHOWCASE_*_BOARD_ID</code> in your environment.
            </p>
          </section>
        )}

        <section className="border-t border-border bg-muted/20">
          <div className="container mx-auto px-4 min-[900px]:px-6 py-16 text-center">
            <h2 className="text-2xl min-[900px]:text-3xl font-semibold tracking-tight mb-3">
              Ready to map your ideas?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Start with a blank board or let AI help you build your first visual mind map.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center bg-primary text-primary-foreground px-6 h-10 rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
            >
              Get started
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
