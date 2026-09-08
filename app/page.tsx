import Link from 'next/link'
import { Menu } from 'lucide-react'
import { HomeBoardPreview } from '@/components/home-board-preview'
import { NodNotesWordmark } from '@/components/nod-notes-wordmark'
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
            <svg
              viewBox="0 0 106.13 105.51"
              width={24}
              height={24}
              className="h-6 w-6 text-foreground"
              aria-hidden
            >
              <path
                fill="currentColor"
                d="M79.57,52.24c-6.93,7.29-18.63,1.62-17.56-8.27.46-4.25,4.79-8.21,8.99-8.63,8.84-.89,14.98,10.17,8.57,16.9Z"
              />
              <path
                fill="currentColor"
                d="M62.28,71.24v11.2c-3.27.01-6.5.15-9.7-.61-7.33-1.76-12.24-7.5-12.85-15.03V31.06s-19.26,0-19.26,0v-10.52h30.2v44.48c0,2.39,2.5,6.22,5.12,6.22h6.49Z"
              />
            </svg>
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
        <section className="container mx-auto px-4 min-[900px]:px-6 py-16 min-[900px]:py-24 text-center">
          <h1 className="text-4xl min-[900px]:text-5xl font-bold tracking-tight mb-4">
            AI chat for visual mind mapping
          </h1>
          <div className="inline-flex items-center justify-center gap-0.5 mb-4">
            <svg
              viewBox="0 0 106.13 105.51"
              width={48}
              height={48}
              className="h-11 w-11 min-[900px]:h-14 min-[900px]:w-14 text-foreground shrink-0"
              aria-hidden
            >
              <path
                fill="currentColor"
                d="M79.57,52.24c-6.93,7.29-18.63,1.62-17.56-8.27.46-4.25,4.79-8.21,8.99-8.63,8.84-.89,14.98,10.17,8.57,16.9Z"
              />
              <path
                fill="currentColor"
                d="M62.28,71.24v11.2c-3.27.01-6.5.15-9.7-.61-7.33-1.76-12.24-7.5-12.85-15.03V31.06s-19.26,0-19.26,0v-10.52h30.2v44.48c0,2.39,2.5,6.22,5.12,6.22h6.49Z"
              />
            </svg>
            <NodNotesWordmark sizeClass="text-4xl min-[900px]:text-5xl" />
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Transform conversations into interactive boards. Learn visually with AI-powered chat,
            frames, and threads on one infinite canvas.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center bg-primary text-primary-foreground px-6 h-10 rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
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
