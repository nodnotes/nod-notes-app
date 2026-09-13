/**
 * Soft glints outside the AI panel — sparse + slow so only a few glow at once
 * (`.home-fleeting-bright-slow` in globals.css).
 */
function FleetingBrights({ edge }: { edge: 'top' | 'bottom' | 'left' | 'right' }) {
  // Two spots per edge; delays spread across the 5.6s cycle so peaks rarely overlap
  const spots =
    edge === 'top'
      ? [
          { along: '22%', delay: '0s', size: 3 },
          { along: '72%', delay: '2.9s', size: 2 },
        ]
      : edge === 'bottom'
        ? [
            { along: '28%', delay: '1.4s', size: 2 },
            { along: '78%', delay: '4.3s', size: 3 },
          ]
        : edge === 'left'
          ? [
              { along: '30%', delay: '0.7s', size: 2 },
              { along: '70%', delay: '3.6s', size: 3 },
            ]
          : [
              { along: '35%', delay: '2.1s', size: 3 },
              { along: '75%', delay: '5.0s', size: 2 },
            ]

  const isVertical = edge === 'left' || edge === 'right'

  return (
    <div
      className={
        edge === 'top'
          ? 'pointer-events-none absolute inset-x-0 -top-5 h-5 overflow-visible'
          : edge === 'bottom'
            ? 'pointer-events-none absolute inset-x-0 -bottom-5 h-5 overflow-visible'
            : edge === 'left'
              ? 'pointer-events-none absolute inset-y-0 -left-5 w-5 overflow-visible'
              : 'pointer-events-none absolute inset-y-0 -right-5 w-5 overflow-visible'
      }
      aria-hidden
    >
      {spots.map((spot) => (
        <span
          key={`${edge}-${spot.along}`}
          className="home-fleeting-bright-slow absolute rounded-full bg-blue-400/90"
          style={{
            left: isVertical
              ? edge === 'left'
                ? '0px'
                : 'auto'
              : spot.along,
            right: isVertical && edge === 'right' ? '0px' : undefined,
            top: isVertical
              ? spot.along
              : edge === 'top'
                ? '0px'
                : 'auto',
            bottom: !isVertical && edge === 'bottom' ? '0px' : undefined,
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

/**
 * Landing interlude: collaborative, board-aware AI — science note + mini demo.
 * Left: headline + board-aware vignette · right: guidelines cite.
 */
export function HomeAiInterlude() {
  return (
    <div
      className="relative z-50 bg-background px-8 py-10"
      data-home-interlude="2" // Keeps the hero thread routed through this interlude
    >
      {/* Headline + demo left · science right; stacks on narrow viewports */}
      <div className="mx-auto grid w-full max-w-5xl items-center gap-10 min-[900px]:grid-cols-2 min-[900px]:gap-16">
        {/* Extra margin so all-around sparkles have room outside the grey fill */}
        <div className="relative m-5">
          <FleetingBrights edge="top" />
          <FleetingBrights edge="right" />
          <FleetingBrights edge="bottom" />
          <FleetingBrights edge="left" />

          <div className="rounded-xl bg-neutral-100 px-5 py-6 text-center min-[900px]:px-6 min-[900px]:py-7 min-[900px]:text-left">
            <p className="mb-6 font-notes-sans text-lg text-gray-600 min-[900px]:text-xl lg:text-2xl">
              We strive for collaborative, board-aware AI—partners that work with you on the map,
              not just in chat.
            </p>

            <div className="mx-auto w-full max-w-md min-[900px]:mx-0" aria-hidden>
              <div className="space-y-3">
                <p className="rounded-lg bg-white px-3 py-2 font-notes-sans text-sm text-gray-700 shadow-sm">
                  Map the risks for launch week.
                </p>
                <div className="flex items-center gap-2 px-1">
                  <span className="rounded-md bg-blue-500/10 px-2 py-0.5 font-notes-sans text-xs font-medium text-blue-600">
                    Board-aware · grow the map
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="rounded-md border border-gray-200 bg-white px-3 py-2 font-notes-sans text-xs text-gray-700 shadow-sm">
                    Scope creep
                  </span>
                  <span className="h-px w-4 bg-gray-300" />
                  <span className="rounded-md border border-gray-200 bg-white px-3 py-2 font-notes-sans text-xs text-gray-700 shadow-sm">
                    Vendor delay
                  </span>
                  <span className="h-px w-4 bg-gray-300" />
                  <span className="rounded-md border border-gray-200 bg-white px-3 py-2 font-notes-sans text-xs text-gray-700 shadow-sm">
                    QA gap
                  </span>
                </div>
              </div>
              <p className="mt-3 font-notes-sans text-xs text-gray-400 min-[900px]:text-sm">
                Talk once · the board grows with you
              </p>
            </div>
          </div>
        </div>

        <aside className="text-left">
          <p className="font-notes-sans text-base leading-relaxed text-gray-600 min-[900px]:text-lg">
            The strongest AI experiences are collaborative: they share context with people,
            act at the right moment, and support how work already happens—rather than dumping
            answers in a separate window. Board-aware AI goes further: it sees your frames and
            threads, and helps grow the board beside you.
          </p>
          <p className="mt-4 font-notes-sans text-sm leading-relaxed text-gray-500">
            <a
              href="https://doi.org/10.1145/3290605.3300233"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 underline-offset-2 hover:underline"
            >
              Amershi et al., 2019
            </a>
            <span className="text-gray-400"> · </span>
            <cite className="not-italic">
              CHI Conference on Human Factors in Computing Systems
            </cite>
            {' '}
            (“Guidelines for Human-AI Interaction”)
          </p>
        </aside>
      </div>
    </div>
  )
}
