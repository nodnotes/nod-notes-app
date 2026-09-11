'use client'

// Empty-board onboarding — Virgil handwriting + curved arrows (mindmap.so style).
// Replaces the old centered “Organize your thoughts” copy. Hides once any RF node exists.

import { useReactFlowContext } from './react-flow-context' // Empty = no frames / drawings
import { useEffect, useLayoutEffect, useRef, useState } from 'react' // Poll nodes + measure chrome
import { NodNotesIcon } from '@/components/nod-notes-icon' // Same mark as the home top bar
import { createClient } from '@/lib/supabase/client' // Count boards so returning users skip chrome hints

type HintId = 'nav' | 'move' | 'notion' | 'more' | 'chat' // One callout per chrome cluster
type BowSide = 'left' | 'right' | 'up' | 'down' // Which way the quadratic bows off the chord

type HintLayout = {
  id: HintId // Which callout
  text: string // Virgil copy
  textX: number // Overlay-local left of the text box
  textY: number // Overlay-local top of the text box
  textW: number // Measured text width
  textH: number // Measured text height
  align: 'left' | 'center' | 'right' // Text-align inside the box
  thread: { path: string; head: string } | null // Shaft + rounded head; null = copy only
}

type Rect = { left: number; top: number; right: number; bottom: number; cx: number; cy: number; w: number; h: number } // Overlay-local box

const HINT_COLOR = '#c4c4c4' // Light annotation gray — Virgil + arrows (reads on light + dark dotted boards)
const TEXT_MAX = 220 // Wrap width — matches the three-line Notion callout
const GAP = 52 // Air between chrome and copy — room for a curve that never tucks under the bar
const TEXT_PAD = 10 // Shaft leaves this far off the glyph box so stroke never covers Virgil
const CHROME_PAD = 16 // Shaft + head stop short of chrome so they sit on the board
const HEAD_SIZE = 13 // Tip-to-base length — small like mindmap.so / Excalidraw
const SHAFT_W = 1.75 // Thin handwritten stroke (matches Virgil weight more than a 2px thread)
const CHROME_HINTS_KEY = 'nodnotes-chrome-hints-shown' // Set after first board is no longer empty (or user already has boards)

/** Returning users / already-onboarded — chrome Virgil + arrows stay off. */
function chromeHintsAlreadyShown(): boolean {
  try {
    return window.localStorage.getItem(CHROME_HINTS_KEY) === '1' // One-shot per browser
  } catch {
    return false
  }
}

/** Persist so later empty boards (and other devices on this browser) don’t replay chrome hints. */
function markChromeHintsShown() {
  try {
    window.localStorage.setItem(CHROME_HINTS_KEY, '1')
  } catch {
    /* private mode */
  }
}

/** First matching element, overlay-local box (or null if missing / off-overlay). */
function localRect(root: DOMRect, selector: string): Rect | null {
  const el = document.querySelector(selector) as HTMLElement | null // Chrome target
  if (!el) return null // Not mounted (e.g. Notion pin unpinned)
  const r = el.getBoundingClientRect() // Viewport box
  return {
    left: r.left - root.left,
    top: r.top - root.top,
    right: r.right - root.left,
    bottom: r.bottom - root.top,
    cx: r.left - root.left + r.width / 2,
    cy: r.top - root.top + r.height / 2,
    w: r.width,
    h: r.height,
  }
}

/** Quadratic control bowed off the chord, picking the perpendicular that matches `prefer`. */
function bowControl(
  x1: number, // Shaft start (off the glyphs)
  y1: number,
  x2: number, // Shaft tip (just short of chrome)
  y2: number,
  prefer: BowSide // Side the arc should lean so it doesn’t tuck under chrome
): { cx: number; cy: number } {
  const dx = x2 - x1 // Chord x
  const dy = y2 - y1 // Chord y
  const dist = Math.hypot(dx, dy) || 1 // Length
  let nx = -dy / dist // Unit perpendicular
  let ny = dx / dist
  const wantX = prefer === 'left' ? -1 : prefer === 'right' ? 1 : 0 // Preferred screen X
  const wantY = prefer === 'up' ? -1 : prefer === 'down' ? 1 : 0 // Preferred screen Y
  if (nx * wantX + ny * wantY < 0) {
    nx = -nx // Flip so the bow leans the way mindmap.so does
    ny = -ny
  }
  const bow = Math.min(34, dist * 0.26) // Modest arc — a deep bow past the tip reads as two arrows
  return { cx: (x1 + x2) / 2 + nx * bow, cy: (y1 + y2) / 2 + ny * bow }
}

/** Filled triangle with round joins and a flat back — sits on the shaft’s last tangent. */
function roundedHead(
  tipX: number, // Point just short of chrome
  tipY: number,
  fromX: number, // Quadratic control — end tangent is control → tip so the head matches the curve
  fromY: number,
  size = HEAD_SIZE
): string {
  const angle = Math.atan2(tipY - fromY, tipX - fromX) // Same direction the shaft arrives
  const cos = Math.cos(angle) // Along the shaft
  const sin = Math.sin(angle)
  const px = -sin // Perp x
  const py = cos // Perp y
  const bx = tipX - cos * size // Base center, back along the shaft
  const by = tipY - sin * size
  const w = size * 0.48 // Half-width — classic triangle, not a chevron
  const leftX = bx + px * w // Wing
  const leftY = by + py * w
  const rightX = bx - px * w
  const rightY = by - py * w
  return `M ${leftX} ${leftY} L ${tipX} ${tipY} L ${rightX} ${rightY} Z` // Flat back — no concave Q
}

/** Pull the shaft end back along the same tangent as the head so they meet. */
function shortenAlong(
  fromX: number, // Quadratic control
  fromY: number,
  toX: number, // Tip
  toY: number,
  by: number // Distance to pull back
): { x: number; y: number } {
  const dx = toX - fromX // End tangent
  const dy = toY - fromY
  const dist = Math.hypot(dx, dy) || 1
  const t = Math.max(0, 1 - by / dist) // Stay on the control→tip segment
  return { x: fromX + dx * t, y: fromY + dy * t }
}

/** Empty-board hints: nav / pan / Notion / chat. Same Virgil + gray arrows as mindmap.so. */
export function WelcomeText() {
  const { reactFlowInstance, editMenuPillMode } = useReactFlowContext() // Empty board + Draw tools change hint Y
  const rootRef = useRef<HTMLDivElement>(null) // Overlay = local origin for measures
  const measureRefs = useRef<Record<HintId, HTMLDivElement | null>>({
    nav: null,
    move: null,
    notion: null,
    more: null,
    chat: null,
  }) // Hidden probes so we know text box size before placing
  const [show, setShow] = useState(true) // True while the board has no RF nodes
  const [desktop, setDesktop] = useState(false) // Skip phone chrome arrows — too tight
  const [chromeHints, setChromeHints] = useState(false) // First-board sign-in only; default off so returning users don’t flash
  const [layouts, setLayouts] = useState<HintLayout[]>([]) // Placed callouts

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 860px)') // Below this, hints collide with chrome
    const sync = () => setDesktop(mq.matches) // Track desktop vs phone
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (chromeHintsAlreadyShown()) return // Already onboarded in this browser
    let cancelled = false // Unmount during the count
    const supabase = createClient() // Shared browser client
    void (async () => {
      const { count, error } = await supabase.from('conversations').select('id', { count: 'exact', head: true }) // RLS = this user
      if (cancelled) return
      if (error) return // Stay hidden rather than flash hints
      const n = count ?? 0 // 0 = untitled /board not minted yet
      if (n >= 2) {
        markChromeHintsShown() // Returning user with existing boards
        return
      }
      setChromeHints(true) // First board creation after sign-in
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (show) return // Still empty — keep the first-board window open
    markChromeHintsShown() // Left empty (added a frame) — never replay chrome arrows
    setChromeHints(false)
  }, [show])

  useEffect(() => {
    if (!reactFlowInstance) return // RF not ready
    const check = () => {
      try {
        const nodes = reactFlowInstance.getNodes() // Frames, drawings, shapes, load shells
        setShow(nodes.length === 0) // Shimmer still means a frame is coming — don't paint callouts over it
      } catch {
        setShow(true) // Assume empty if store isn’t readable yet
      }
    }
    check()
    const id = window.setInterval(check, 200) // RF has no cheap “nodes empty” event
    return () => window.clearInterval(id)
  }, [reactFlowInstance])

  useLayoutEffect(() => {
    if (!show || !desktop || !chromeHints) {
      setLayouts([]) // Don’t leave stale boxes after the first frame / for returning users
      return
    }
    const rootEl = rootRef.current // Overlay host
    if (!rootEl) return

    const place = () => {
      const root = rootEl.getBoundingClientRect() // Overlay viewport box
      const navT = localRect(root, '[data-nav-logo-trigger] button') // Hamburger
      const navMenuT = localRect(root, '[data-minimap-toggle-context]') // Free nav — Scroll / Zoom / % (bottom nav menu)
      const pinT = localRect(root, '[data-notion-topbar-pin]') // Only when Notion is pinned left of Share
      const moreT = localRect(root, '[data-board-more]') // Board More — not other title="More" chrome
      const chatT = localRect(root, '[data-chat-sidebar-toggle]') // Brand only — skip while chat is already open

      const next: HintLayout[] = [] // Built this frame

      const push = (
        id: HintId,
        text: string,
        textX: number,
        textY: number,
        align: HintLayout['align'],
        target: Rect | null,
        from: 'top' | 'right' | 'bottom' | 'left' | null,
        bow: BowSide | null = null
      ) => {
        const probe = measureRefs.current[id] // Hidden Virgil box
        const textW = probe?.offsetWidth || TEXT_MAX // Fallback wrap
        const textH = probe?.offsetHeight || 48
        const x = Math.max(12, Math.min(textX, root.width - textW - 12)) // Keep in the board column
        const y = Math.max(12, Math.min(textY, root.height - textH - 12))
        let thread: HintLayout['thread'] = null
        if (target && from && bow) {
          const x1 =
            from === 'top'
              ? x + (x + textW / 2 > target.cx ? 28 : textW - 28)
              : from === 'bottom'
                ? x + textW * 0.7
                : from === 'right'
                  ? x + textW + TEXT_PAD
                  : x - TEXT_PAD
          const y1 =
            from === 'top'
              ? y - TEXT_PAD
              : from === 'bottom'
                ? y + textH + TEXT_PAD
                : y + textH * 0.4
          const x2 =
            from === 'top' || from === 'bottom'
              ? target.cx
              : from === 'right'
                ? target.left - CHROME_PAD
                : target.right + CHROME_PAD
          const y2 =
            from === 'top'
              ? target.bottom + CHROME_PAD
              : from === 'bottom'
                ? target.top - CHROME_PAD
                : target.cy
          const { cx, cy } = bowControl(x1, y1, x2, y2, bow) // Arc leans the mindmap.so way
          const shaft = shortenAlong(cx, cy, x2, y2, HEAD_SIZE * 0.55) // Head covers the last bit of stroke
          thread = {
            path: `M ${x1} ${y1} Q ${cx} ${cy} ${shaft.x} ${shaft.y}`, // Quadratic into chrome
            head: roundedHead(x2, y2, cx, cy), // Oriented with the shaft, flat back
          }
        }
        next.push({ id, text, textX: x, textY: y, textW, textH, align, thread })
      }

      if (navT) {
        push(
          'nav',
          'Boards, preferences, …',
          navT.left + 6,
          navT.bottom + GAP,
          'left',
          navT,
          'top',
          'left'
        ) // Arrow up-left into the hamburger
      }
      if (navMenuT) {
        const probe = measureRefs.current.move // Wrapped pan-line width
        const textW = probe?.offsetWidth || 420
        const textH = probe?.offsetHeight || 48
        push(
          'move',
          'To move the board, scroll or drag, or switch to Scroll',
          navMenuT.right + GAP, // Sit to the right of Free nav so the arrow is short
          navMenuT.cy - textH / 2, // Vertically mid with the bar
          'left',
          navMenuT,
          'left',
          'up'
        ) // Arrow left into the bottom nav menu (Scroll / Zoom)
      }
      if (pinT) {
        const probe = measureRefs.current.notion // Wrapped Virgil width
        const textW = probe?.offsetWidth || TEXT_MAX
        push(
          'notion',
          'Click here to import Notion pages!',
          pinT.right - textW - 8,
          pinT.bottom + GAP,
          'left',
          pinT,
          'top',
          'right'
        ) // Arrow up-right into the pinned Notion mark
      } else if (moreT) {
        const probe = measureRefs.current.more // Wrapped Virgil width
        const textW = probe?.offsetWidth || TEXT_MAX
        push(
          'more',
          'Share, connections, and more…',
          moreT.right - textW - 8,
          moreT.bottom + GAP,
          'left',
          moreT,
          'top',
          'right'
        ) // Arrow up-right into the board More menu when Notion isn’t pinned
      }
      if (chatT) {
        const probe = measureRefs.current.chat // Wrapped Virgil box
        const textW = probe?.offsetWidth || TEXT_MAX
        const textH = probe?.offsetHeight || 48
        push(
          'chat',
          'Ask AI, or type on the board\nto add a frame',
          chatT.left - textW - GAP,
          chatT.top - textH + 14,
          'right',
          chatT,
          'right',
          'up'
        ) // Arc from the copy into the left of the brand — bow up so it doesn’t loop under
      }

      setLayouts((prev) => {
        if (
          prev.length === next.length &&
          prev.every((h, i) => {
            const o = next[i] // Same slot
            return (
              h.id === o.id &&
              h.text === o.text &&
              h.textX === o.textX &&
              h.textY === o.textY &&
              h.thread?.path === o.thread?.path &&
              h.thread?.head === o.thread?.head
            )
          })
        ) {
          return prev // Skip — MutationObserver would loop if we always set a new array
        }
        return next
      })
    }

    place()
    void document.fonts.ready.then(place) // Virgil swap changes wrap width
    const ro = new ResizeObserver(place) // Chat column / Draw tools in the pill
    ro.observe(rootEl)
    const watched = new Set<Element>() // Chrome we already observe
    let watchT = 0 // Debounce so subtree mutations don’t place every frame
    const watchChrome = () => {
      window.clearTimeout(watchT)
      watchT = window.setTimeout(() => {
        ;['[data-edit-menu-context]', '[data-notion-topbar-pin]', '[data-chat-sidebar-toggle]', '[data-nav-logo-trigger]', '[data-minimap-toggle-context]', '[data-board-more]'].forEach(
          (sel) => {
            const el = document.querySelector(sel) // Pin often mounts after the overlay
            if (el && !watched.has(el)) {
              watched.add(el)
              ro.observe(el)
            }
          }
        )
        place() // Re-aim if Notion pin replaced the More fallback
      }, 80)
    }
    watchChrome()
    const mo = new MutationObserver(watchChrome) // Catch the pin when it pins after first paint
    mo.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', place)
    return () => {
      window.clearTimeout(watchT)
      mo.disconnect()
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [show, desktop, editMenuPillMode, chromeHints])

  if (!show) return null // First frame: no overlay (phone still gets the center brand)

  const copy: Record<HintId, string> = {
    nav: 'Boards, preferences, …',
    move: 'To move the board, scroll or drag, or switch to Scroll',
    notion: 'Click here to import Notion pages!',
    more: 'Share, connections, and more…',
    chat: 'Ask AI, or type on the board\nto add a frame',
  } // Probe + visible share the same strings

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="absolute inset-0 z-[6] pointer-events-none select-none overflow-visible"
    >
      {/* Home top-bar brand, centered — clicks pass through so the board still adds a frame */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-in fade-in duration-500">
        <div className="inline-flex items-center text-4xl min-[900px]:text-5xl leading-none opacity-90">
          <NodNotesIcon nodIdle className="mr-1.5 h-[1cap] w-auto shrink-0 text-gray-700 dark:text-gray-200" />
          <span className="font-young-serif font-normal text-blue-500">Nod</span>
        </div>
        <div
          className="mt-3 board-hint text-center whitespace-nowrap"
          style={{
            fontFamily: 'Virgil, cursive', // Same handwriting as the chrome hints
            fontSize: 20,
            lineHeight: 1.25,
            color: HINT_COLOR,
          }}
        >
          Click the board to add a frame
        </div>
      </div>

      {desktop && chromeHints ? (
        <>
      {/* Hidden probes — Virgil metrics before the first visible paint */}
      <div className="absolute -left-[9999px] top-0">
        {(Object.keys(copy) as HintId[]).map((id) => (
          <div
            key={id}
            ref={(el) => {
              measureRefs.current[id] = el
            }}
            className="board-hint whitespace-pre-line"
            style={{
              fontFamily: 'Virgil, cursive',
              fontSize: id === 'move' ? 18 : 20,
              lineHeight: 1.25,
              maxWidth: id === 'move' ? 460 : TEXT_MAX,
            }}
          >
            {copy[id]}
          </div>
        ))}
      </div>

      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        {layouts.map((h) => {
          if (!h.thread) return null
          return (
            <g key={h.id}>
              <path
                d={h.thread.path}
                fill="none"
                stroke={HINT_COLOR}
                strokeWidth={SHAFT_W}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={h.thread.head}
                fill={HINT_COLOR}
                stroke={HINT_COLOR}
                strokeWidth={SHAFT_W}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )
        })}
      </svg>

      {layouts.map((h) => (
        <div
          key={h.id}
          className="absolute board-hint whitespace-pre-line animate-in fade-in duration-500"
          style={{
            left: h.textX,
            top: h.textY,
            width: h.textW,
            fontFamily: 'Virgil, cursive',
            fontSize: h.id === 'move' ? 18 : 20,
            lineHeight: 1.25,
            color: HINT_COLOR,
            textAlign: h.align,
          }}
        >
          {h.text}
        </div>
      ))}
        </>
      ) : null}
    </div>
  )
}
