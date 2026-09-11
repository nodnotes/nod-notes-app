'use client'

import { useEffect, useRef, useState } from 'react' // Hover/click + scroll-middle peek state

/** Soft glints along the flashcard edges — sparse + slow (same as AI interlude) */
function FleetingBrights({ edge }: { edge: 'top' | 'bottom' }) {
  // Two spots per edge; delays spread across the 5.6s cycle so peaks rarely overlap
  const spots =
    edge === 'top'
      ? [
          { left: '22%', delay: '0s', size: 3 },
          { left: '72%', delay: '2.9s', size: 2 },
        ]
      : [
          { left: '28%', delay: '1.4s', size: 2 },
          { left: '78%', delay: '4.3s', size: 3 },
        ]

  return (
    <div
      className={
        edge === 'top'
          ? 'pointer-events-none absolute inset-x-0 top-0 h-4 overflow-visible'
          : 'pointer-events-none absolute inset-x-0 bottom-0 h-4 overflow-visible'
      }
      aria-hidden
    >
      {spots.map((spot) => (
        <span
          key={`${edge}-${spot.left}`}
          className="home-fleeting-bright-slow absolute rounded-full bg-blue-400/90"
          style={{
            left: spot.left,
            top: edge === 'top' ? '0px' : 'auto',
            bottom: edge === 'bottom' ? '0px' : 'auto',
            width: spot.size,
            height: spot.size,
            animationDelay: spot.delay,
            boxShadow: '0 0 6px 1px rgba(59, 130, 246, 0.55)', // Soft blue halo like board accents
          }}
        />
      ))}
    </div>
  )
}

const SCROLL_PEEK_MS = 2200 // Clear beat after ~480ms fade-in, then fade back out
const MIDDLE_BAND = '-38% 0px -38% 0px' // ~middle 24% of the viewport

/**
 * Landing interlude: contextual flashcards demo — haze blur like board hide-text,
 * hover peek, click toggle, and a short auto-reveal when scrolled into mid-viewport.
 */
export function HomeFlashcardInterlude() {
  const [pinned, setPinned] = useState(false) // Click keeps the answer clear
  const [hovered, setHovered] = useState(false) // Hover peeks without committing
  const [suppressHover, setSuppressHover] = useState(false) // After un-pin, stay hazed until leave
  const [scrollPeek, setScrollPeek] = useState(false) // Brief clear when card hits mid-viewport
  const cardRef = useRef<HTMLButtonElement>(null) // Observe this for mid-band intersection
  const peekTimerRef = useRef<number | null>(null) // Clears scroll peek after SCROLL_PEEK_MS
  const peekedThisVisitRef = useRef(false) // One auto-peek per entry into the middle band
  const revealed = pinned || (hovered && !suppressHover) || scrollPeek // Any path clears blur

  useEffect(() => {
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (peekedThisVisitRef.current) return // Already peeped this pass through mid-band
          peekedThisVisitRef.current = true
          setScrollPeek(true) // Reveal briefly while centered
          if (peekTimerRef.current != null) window.clearTimeout(peekTimerRef.current)
          peekTimerRef.current = window.setTimeout(() => {
            setScrollPeek(false) // Re-haze after a short beat
            peekTimerRef.current = null
          }, SCROLL_PEEK_MS)
        } else {
          peekedThisVisitRef.current = false // Leaving mid-band arms the next visit
          setScrollPeek(false)
          if (peekTimerRef.current != null) {
            window.clearTimeout(peekTimerRef.current)
            peekTimerRef.current = null
          }
        }
      },
      { root: null, rootMargin: MIDDLE_BAND, threshold: 0 }
    )

    observer.observe(el)
    return () => {
      observer.disconnect()
      if (peekTimerRef.current != null) window.clearTimeout(peekTimerRef.current)
    }
  }, [])

  return (
    <div
      className="relative z-50 bg-background px-8 py-10"
      data-home-interlude="1" // Keeps the hero thread routed through this interlude
    >
      {/* Science left · headline + demo right; stacks on narrow viewports */}
      <div className="mx-auto grid w-full max-w-5xl items-center gap-10 min-[900px]:grid-cols-2 min-[900px]:gap-16">
        <aside className="text-left">
          <p className="font-notes-sans text-base leading-relaxed text-gray-600 min-[900px]:text-lg">
            Distributed practice — spreading review over time instead of cramming — is one of
            the highest-utility learning techniques in cognitive psychology. Across hundreds of
            studies, spacing and retrieval practice improve long-term retention far more than
            massed rereading.
          </p>
          <p className="mt-4 font-notes-sans text-sm leading-relaxed text-gray-500">
            <a
              href="https://doi.org/10.1177/1529100612453266"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline-offset-2 hover:underline"
            >
              Dunlosky et al., 2013
            </a>
            <span className="text-gray-400"> · </span>
            <cite className="not-italic">
              Psychological Science in the Public Interest
            </cite>
            {' '}
            (“Improving Students’ Learning With Effective Learning Techniques”)
          </p>
        </aside>

        {/* Headline + flashcard in a light grey well (no border) — matches AI interlude */}
        <div className="rounded-xl bg-neutral-100 px-5 py-6 text-center min-[900px]:px-6 min-[900px]:py-7 min-[900px]:text-left">
          <p className="mb-6 font-notes-sans text-lg text-gray-600 min-[900px]:text-xl lg:text-2xl">
            Turn notes into contextual flashcards for spaced repetition.
          </p>

          <button
            ref={cardRef}
            type="button"
            className="home-flashcard-demo relative w-full max-w-md rounded-xl bg-transparent px-2 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 min-[900px]:mx-0 mx-auto"
            onMouseEnter={() => {
              setHovered(true) // Peek while pointer rests on the card
              setSuppressHover(false) // Re-entering allows hover peek again
            }}
            onMouseLeave={() => {
              setHovered(false) // Re-haze unless click pinned it
              setSuppressHover(false) // Clear suppress so next hover peeks
            }}
            onFocus={() => {
              setHovered(true) // Keyboard parity with hover peek
              setSuppressHover(false)
            }}
            onBlur={() => {
              setHovered(false)
              setSuppressHover(false)
            }}
            onClick={() => {
              // Focus/mid-viewport peek: click dismisses back to haze (does not pin open)
              if (!pinned && scrollPeek) {
                setScrollPeek(false)
                if (peekTimerRef.current != null) {
                  window.clearTimeout(peekTimerRef.current)
                  peekTimerRef.current = null
                }
                setSuppressHover(true) // Stay hazed even if the pointer is still over it
                return
              }
              setPinned((was) => {
                if (was) {
                  setSuppressHover(true) // Click-to-hide even while still hovering
                  return false
                }
                setSuppressHover(false)
                return true // Pin clear until toggled off
              })
            }}
            aria-pressed={pinned}
            aria-label={
              revealed
                ? 'Flashcard answer revealed: Threads between frames'
                : 'Flashcard answer hidden. Hover to peek, click to keep revealed.'
            }
          >
            <FleetingBrights edge="top" />

            <p className="mb-3 font-notes-sans text-sm text-gray-500 min-[900px]:text-base">
              How do related frames stay linked on a board?
            </p>

            {/* Answer uses board haze blur; Nod blue when clear — like colored board text */}
            <p
              className={
                revealed
                  ? 'home-flashcard-answer font-notes-sans text-lg font-medium text-blue-500 min-[900px]:text-xl'
                  : 'home-flashcard-answer home-flashcard-answer--hazed font-notes-sans text-lg font-medium text-blue-500 min-[900px]:text-xl'
              }
            >
              Threads between frames
            </p>

            <FleetingBrights edge="bottom" />
          </button>

          <p className="mt-3 font-notes-sans text-xs text-gray-400 min-[900px]:text-sm">
            {pinned ? 'Click again to hide' : 'Hover to peek · click to keep'}
          </p>
        </div>
      </div>
    </div>
  )
}
