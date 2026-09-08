import Link from 'next/link'
import { Menu } from 'lucide-react'
import { HomeBoardPreview } from '@/components/home-board-preview'
import { HomeHeroIntro } from '@/components/home-hero-intro'
import { NodNotesIcon } from '@/components/nod-notes-icon'
import { getResolvedShowcaseBoards } from '@/lib/public-showcase-boards'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function Home() {
  const showcaseBoards = getResolvedShowcaseBoards()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="sticky top-0 z-50 h-[52px] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b border-border">
        <div className="container mx-auto h-full px-4 min-[900px]:px-6 flex justify-between items-center gap-2">
          <Link href="/" className="opacity-90 hover:opacity-100 transition-opacity" aria-label="Nod Notes">
            <NodNotesIcon className="h-6 w-6" />
          </Link>
          <div className="flex items-center gap-2">
          <Link
              href="/login"
              className="bg-primary text-primary-foreground px-3 min-[900px]:px-4 h-8 rounded-lg hover:opacity-90 transition-opacity text-sm font-medium flex items-center justify-center"
            >
              Get started
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  aria-label="Menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[160px]">
                <DropdownMenuItem asChild>
                  <Link href="/help">Help</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/developer">Developer</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/pricing">Pricing</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      <main>
        <section className="container mx-auto px-4 min-[900px]:px-6 py-20 min-[900px]:py-28 text-center">
          <HomeHeroIntro />

          <p className="mx-auto mb-10 max-w-xl font-notes-sans text-base min-[900px]:text-lg text-gray-600">
            Turn your pages and databases into connected visual boards.
          </p>

          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full bg-gray-950 px-8 py-3 font-young-serif text-sm min-[900px]:text-base text-white hover:opacity-90 transition-opacity"
          >
            Get started free
          </Link>
        </section>

        {showcaseBoards.length > 0 ? (
          <section className="container mx-auto px-4 min-[900px]:px-6 pb-20 space-y-20">
            {showcaseBoards.map((board, index) => {
              const reversed = index % 2 === 1
              return (
                <article
                  key={board.id}
                  className="grid gap-8 min-[900px]:gap-12 items-center min-[900px]:grid-cols-2"
                >
                  <div className={reversed ? 'min-[900px]:order-2' : ''}>
                    <h2 className="text-2xl min-[900px]:text-3xl font-semibold tracking-tight mb-3">
                      {board.title}
                    </h2>
                    <p className="text-muted-foreground mb-4">{board.description}</p>
                    <Link
                      href={`/view/${board.id}`}
                      className="text-sm font-medium text-primary hover:opacity-80 transition-opacity"
                    >
                      Open full board →
                    </Link>
                  </div>
                  <div className={reversed ? 'min-[900px]:order-1' : ''}>
                    <HomeBoardPreview boardId={board.id} title={board.title} />
                  </div>
                </article>
              )
            })}
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
