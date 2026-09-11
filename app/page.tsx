import Image from 'next/image'
import Link from 'next/link'
import { ComingSoonPage } from '@/components/coming-soon-page'
import { HomeBoardPreview } from '@/components/home-board-preview'
import { HomeHeroIntro } from '@/components/home-hero-intro'
import { HomeHeroThread } from '@/components/home-hero-thread'
import { HomeFooter } from '@/components/home-footer'
import { HomeTopNav } from '@/components/home-top-nav'
import { HomeAiInterlude } from '@/components/home-ai-interlude'
import { HomeFlashcardInterlude } from '@/components/home-flashcard-interlude'
import { isComingSoon, isEarlyAccessEmail } from '@/lib/coming-soon'
import { createClient } from '@/lib/supabase/server'
import { OpenShowcaseBoardLink } from '@/components/open-showcase-board-link'
import {
  getResolvedShowcaseBoards,
  type ResolvedShowcaseBoard,
} from '@/lib/public-showcase-boards'

function SplitShowcase({
  board,
  reversed,
  previewSlot,
  copySlot,
  imageAbove,
  imagesRow,
  imagesBelow,
  id,
}: {
  board: ResolvedShowcaseBoard
  reversed?: boolean
  previewSlot?: 1 | 2 | 3
  copySlot?: 1 | 2 | 3
  imageAbove?: { src: string; alt: string }
  imagesRow?: { src: string; alt: string }[]
  imagesBelow?: { src: string; alt: string }[]
  id?: string
}) {
  const hasImage = Boolean(
    imageAbove || (imagesRow && imagesRow.length > 0) || (imagesBelow && imagesBelow.length > 0)
  )
  // Extra image stacks need room; don’t lock to preview height
  const copyHeightClass =
    imagesRow?.length || imagesBelow?.length
      ? 'min-[900px]:min-h-[min(420px,55vh)]'
      : 'min-[900px]:h-[min(420px,55vh)]'

  const copyBlock = (
    <div className={hasImage && !imageAbove ? 'shrink-0' : undefined}>
      <h2 className="mb-3 text-2xl font-semibold tracking-tight min-[900px]:text-3xl">
        {board.title}
      </h2>
      <p className="mb-4 text-muted-foreground">{board.description}</p>
      <OpenShowcaseBoardLink
        masterBoardId={board.id}
        className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
      >
        Open board →
      </OpenShowcaseBoardLink>
    </div>
  )

  // Section 1: image + copy stack to the same height as the live preview
  if (imageAbove) {
    return (
      <article
        id={id}
        className="grid w-full scroll-mt-20 items-start gap-8 px-8 min-[900px]:grid-cols-2"
      >
        <div
          className="relative z-10 flex min-w-0 flex-col gap-6 bg-background max-[899px]:gap-4 min-[900px]:h-[min(420px,55vh)]"
          {...(copySlot != null ? { 'data-home-showcase-copy': String(copySlot) } : {})}
        >
          {/* Flex-1 image shrinks so image + copy match the right preview height */}
          <div className="relative min-h-[160px] flex-1 overflow-hidden rounded-xl border-2 border-gray-700 bg-muted/30 shadow-lg max-[899px]:aspect-[4/3] max-[899px]:flex-none">
            <Image
              src={imageAbove.src}
              alt={imageAbove.alt}
              fill
              unoptimized // Static public assets — optimizer returns invalid upstream in local/prod edge cases
              sizes="(min-width: 900px) 40vw, 100vw"
              className="object-contain p-1"
            />
          </div>
          <div className="shrink-0">{copyBlock}</div>
        </div>
        <div className="relative z-10 min-w-0">
          <HomeBoardPreview
            boardId={board.id}
            title={board.title}
            previewSlot={previewSlot}
          />
        </div>
      </article>
    )
  }

  // Gutter = side padding so window-edge margins match the gap between panel and copy
  return (
    <article
      id={id}
      className="grid w-full scroll-mt-20 items-center gap-8 px-8 min-[900px]:grid-cols-2 min-[900px]:items-stretch"
    >
      <div
        className={
          reversed
            ? `relative z-10 flex min-w-0 flex-col justify-center gap-8 bg-background ${copyHeightClass} min-[900px]:order-2`
            : `relative z-10 flex min-w-0 flex-col justify-center gap-8 bg-background ${copyHeightClass}`
        }
        {...(copySlot != null ? { 'data-home-showcase-copy': String(copySlot) } : {})}
      >
        {copyBlock}
        {imagesRow && imagesRow.length > 0 ? (
          <div className="flex shrink-0 gap-2 overflow-hidden">
            {imagesRow.map((image) => (
              <div
                key={image.src}
                className="relative h-14 w-20 shrink-0 overflow-hidden rounded-lg border-2 border-gray-700 bg-muted/30 shadow-lg min-[900px]:h-16 min-[900px]:w-24"
              >
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  unoptimized
                  sizes="96px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        ) : null}
        {imagesBelow && imagesBelow.length > 0 ? (
          <div className="grid h-[min(160px,28vh)] shrink-0 grid-cols-2 grid-rows-2 gap-2">
            {imagesBelow.map((image) => (
              <div
                key={image.src}
                className="relative min-h-0 min-w-0 overflow-hidden rounded-xl border-2 border-gray-700 bg-muted/30 shadow-lg"
              >
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  unoptimized
                  sizes="(min-width: 900px) 20vw, 50vw"
                  className="object-contain p-0.5"
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div
        className={
          reversed
            ? 'relative z-10 min-w-0 min-[900px]:h-[min(420px,55vh)] min-[900px]:self-center min-[900px]:order-1'
            : 'relative z-10 min-w-0 min-[900px]:h-[min(420px,55vh)] min-[900px]:self-center'
        }
      >
        <HomeBoardPreview
          boardId={board.id}
          title={board.title}
          previewSlot={previewSlot}
        />
      </div>
    </article>
  )
}

function FullWidthShowcase({
  board,
  previewSlot = 2,
  copySlot = 2,
  id,
}: {
  board: ResolvedShowcaseBoard
  previewSlot?: 1 | 2 | 3
  copySlot?: 1 | 2 | 3
  id?: string
}) {
  // Side inset ≈ 3× section-1 panel gap (gap-8 → 96px) so the preview reads wider than the split rows
  return (
    <article
      id={id}
      className="w-full scroll-mt-20 space-y-6 px-8 min-[900px]:px-24"
    >
      <div
        className="relative z-10 bg-background text-center"
        data-home-showcase-copy={String(copySlot)}
      >
        <h2 className="mb-3 text-2xl font-semibold tracking-tight min-[900px]:text-3xl">
          {board.title}
        </h2>
        <p className="mx-auto mb-2 max-w-2xl text-muted-foreground">{board.description}</p>
        <OpenShowcaseBoardLink
          masterBoardId={board.id}
          className="text-sm font-medium text-primary transition-opacity hover:opacity-80"
        >
          Open board →
        </OpenShowcaseBoardLink>
      </div>
      <div className="relative z-10">
        <HomeBoardPreview
          boardId={board.id}
          title={board.title}
          fullWidth
          previewSlot={previewSlot}
          showAiSidebar
        />
      </div>
    </article>
  )
}

export default async function Home() {
  // Coming soon: marketing homepage only for signed-in allowlisted users; others see the gate
  if (isComingSoon()) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const mayViewHome =
      Boolean(user?.email_confirmed_at) && isEarlyAccessEmail(user?.email)
    if (!mayViewHome) {
      return <ComingSoonPage />
    }
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
        <section className="relative z-10 px-8 py-20 text-center min-[900px]:py-28">
          <div className="mx-auto flex w-fit flex-col items-center bg-background">
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
          <section className="space-y-32 pb-24 min-[900px]:space-y-40">
            {first ? (
              <SplitShowcase
                id="notes-and-presentations"
                board={first}
                previewSlot={1}
                copySlot={1}
                imageAbove={{
                  src: '/home/home-notes-presentations-example.png',
                  alt: 'Notes arranged as frames on a board for presentations',
                }}
              />
            ) : null}
            <HomeFlashcardInterlude />
            {third ? (
              <SplitShowcase
                id="connections-and-automations"
                board={third}
                reversed
                previewSlot={2}
                copySlot={2}
                imagesRow={[
                  {
                    src: '/home/home-carousel-1.png',
                    alt: 'Frames linked by threads across a board',
                  },
                  {
                    src: '/home/home-carousel-2.png',
                    alt: 'Frame automations syncing connected work',
                  },
                  {
                    src: '/home/home-carousel-3.png',
                    alt: 'A branching network of connected frames',
                  },
                  {
                    src: '/home/home-connections-automations.png',
                    alt: 'Frames connected by threads',
                  },
                  {
                    src: '/home/home-connections-automations-2.png',
                    alt: 'Frame automations linking related work',
                  },
                  {
                    src: '/home/home-connections-automations-3.png',
                    alt: 'A network of connected frames on a board',
                  },
                  {
                    src: '/home/home-connections-automations-4.png',
                    alt: 'Automated sync between connected frames',
                  },
                ]}
                imagesBelow={[
                  {
                    src: '/home/home-connections-automations.png',
                    alt: 'Frames connected by threads',
                  },
                  {
                    src: '/home/home-connections-automations-2.png',
                    alt: 'Frame automations linking related work',
                  },
                  {
                    src: '/home/home-connections-automations-3.png',
                    alt: 'A network of connected frames on a board',
                  },
                  {
                    src: '/home/home-connections-automations-4.png',
                    alt: 'Automated sync between connected frames',
                  },
                ]}
              />
            ) : null}
            <HomeAiInterlude />
            {second ? (
              <FullWidthShowcase
                id="brainstorm-with-ai"
                board={second}
                previewSlot={3}
                copySlot={3}
              />
            ) : null}
          </section>
        ) : (
          <section className="px-8 pb-20 text-center">
            <p className="text-muted-foreground">
              Showcase boards are not configured yet. Set{' '}
              <code className="text-sm">NEXT_PUBLIC_SHOWCASE_*_BOARD_ID</code> in your environment.
            </p>
          </section>
        )}

        <section id="get-started" className="w-full scroll-mt-20 bg-neutral-100">
          <div className="px-8 py-16 text-center min-[900px]:py-20">
            <h2 className="mb-3 font-young-serif text-2xl tracking-tight min-[900px]:text-3xl">
              Ready to map your ideas?
            </h2>
            <p className="mx-auto mb-8 max-w-xl font-notes-sans text-muted-foreground">
              Start with a blank board or let AI help you build your first visual mind map.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-gray-950 px-8 py-3 font-young-serif text-sm text-white transition-opacity hover:opacity-90 min-[900px]:text-base"
            >
              Get started free
            </Link>
          </div>
        </section>
      </main>

      <HomeFooter />
    </div>
  )
}
