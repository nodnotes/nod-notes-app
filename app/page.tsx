import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ComingSoonPage } from '@/components/coming-soon-page'
import { HomeBoardPreview } from '@/components/home-board-preview'
import { HomeHeroIntro } from '@/components/home-hero-intro'
import { HomeHeroThread } from '@/components/home-hero-thread'
import { HomeImagesCarousel } from '@/components/home-images-carousel'
import { HomeFooter } from '@/components/home-footer'
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
  imageAbove,
  imagesCarousel,
  imagesBelow,
  id,
}: {
  board: ResolvedShowcaseBoard
  reversed?: boolean
  previewSlot?: 1 | 2 | 3
  copySlot?: 1 | 2 | 3
  imageAbove?: { src: string; alt: string }
  imagesCarousel?: { src: string; alt: string }[]
  imagesBelow?: { src: string; alt: string }[]
  id?: string
}) {
  const hasImage = Boolean(
    imageAbove || (imagesCarousel && imagesCarousel.length > 0) || (imagesBelow && imagesBelow.length > 0)
  )
  // Carousel + 2×2 needs room; don’t lock to preview height
  const copyHeightClass = imagesCarousel?.length
    ? 'min-[900px]:min-h-[min(420px,55vh)]'
    : 'min-[900px]:h-[min(420px,55vh)]'

  return (
    <article
      id={id}
      className="container mx-auto grid scroll-mt-20 items-center gap-8 px-4 min-[900px]:grid-cols-2 min-[900px]:items-stretch min-[900px]:gap-12 min-[900px]:px-6"
    >
      <div
        className={
          reversed
            ? `relative z-10 flex flex-col justify-center bg-background max-[899px]:-mx-1 max-[899px]:px-1 ${copyHeightClass} min-[900px]:order-2`
            : `relative z-10 flex flex-col justify-center bg-background max-[899px]:-mx-1 max-[899px]:px-1 ${copyHeightClass}`
        }
        {...(copySlot != null ? { 'data-home-showcase-copy': String(copySlot) } : {})}
      >
        {imageAbove ? (
          <div className="relative mb-5 min-h-[160px] flex-1 overflow-hidden rounded-xl border-2 border-gray-700 bg-muted/30 shadow-lg max-[899px]:aspect-[4/3] max-[899px]:flex-none min-[900px]:mb-4">
            <Image
              src={imageAbove.src}
              alt={imageAbove.alt}
              fill
              sizes="(min-width: 900px) 40vw, 100vw"
              className="object-contain p-1"
            />
          </div>
        ) : null}
        <div className={hasImage ? 'shrink-0' : undefined}>
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
        {imagesCarousel && imagesCarousel.length > 0 ? (
          <HomeImagesCarousel images={imagesCarousel} className="mt-4" />
        ) : null}
        {imagesBelow && imagesBelow.length > 0 ? (
          <div className="mt-4 grid h-[min(160px,28vh)] shrink-0 grid-cols-2 grid-rows-2 gap-2">
            {imagesBelow.map((image) => (
              <div
                key={image.src}
                className="relative min-h-0 min-w-0 overflow-hidden rounded-xl border-2 border-gray-700 bg-muted/30 shadow-lg"
              >
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
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
            ? 'relative z-10 min-[900px]:h-[min(420px,55vh)] min-[900px]:self-center min-[900px]:order-1'
            : 'relative z-10 min-[900px]:h-[min(420px,55vh)] min-[900px]:self-center'
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

function ShowcaseInterlude({
  slot,
  children,
}: {
  slot: 1 | 2
  children: ReactNode
}) {
  return (
    <div
      className="relative z-50 bg-background px-4 py-6 text-center max-[899px]:-mx-1 max-[899px]:px-5 min-[900px]:px-6"
      data-home-interlude={String(slot)}
    >
      <p className="mx-auto max-w-3xl font-notes-sans text-lg text-gray-600 min-[900px]:text-xl lg:text-2xl">
        {children}
      </p>
    </div>
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
  return (
    <article
      id={id}
      className="mx-auto w-full max-w-6xl scroll-mt-20 space-y-6 px-4 min-[900px]:px-6"
    >
      <div
        className="relative z-10 bg-background text-center max-[899px]:-mx-1 max-[899px]:px-1"
        data-home-showcase-copy={String(copySlot)}
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
          <section className="space-y-32 pb-24 min-[900px]:space-y-40">
            {first ? (
              <SplitShowcase
                id="notes-and-presentations"
                board={first}
                previewSlot={1}
                copySlot={1}
                imageAbove={{
                  src: '/home/home-notes-presentations.png',
                  alt: 'Notes arranged as frames on a board for presentations',
                }}
              />
            ) : null}
            <ShowcaseInterlude slot={1}>
              From scattered notes to a board you can present — then connect the frames that matter.
            </ShowcaseInterlude>
            {third ? (
              <SplitShowcase
                id="connections-and-automations"
                board={third}
                reversed
                previewSlot={2}
                copySlot={2}
                imagesCarousel={[
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
                  {
                    src: '/home/home-notes-presentations.png',
                    alt: 'Notes arranged as frames on a board',
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
            <ShowcaseInterlude slot={2}>
              Prefer to start with a conversation? Let AI grow the board as you brainstorm.
            </ShowcaseInterlude>
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
          <section className="container mx-auto px-4 min-[900px]:px-6 pb-20 text-center">
            <p className="text-muted-foreground">
              Showcase boards are not configured yet. Set{' '}
              <code className="text-sm">NEXT_PUBLIC_SHOWCASE_*_BOARD_ID</code> in your environment.
            </p>
          </section>
        )}

        <section id="get-started" className="w-full scroll-mt-20 bg-neutral-100">
          <div className="container mx-auto px-4 min-[900px]:px-6 py-16 min-[900px]:py-20 text-center">
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
