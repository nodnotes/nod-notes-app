'use client'

import { useLayoutEffect, useRef } from 'react'
import { Position } from 'reactflow'
import { getSmoothThreadBezier } from '@/components/threads/path/bezier'
import {
  THREAD_DEFAULT_COLOR,
  THREAD_DEFAULT_STROKE_WIDTH,
} from '@/components/threads/constants'

function threadPath(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  sourcePosition: Position,
  targetPosition: Position
) {
  return getSmoothThreadBezier({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  }).path
}

type Box = { left: number; top: number; width: number; height: number }

function boxInRoot(el: HTMLElement, root: HTMLElement, sticky = false): Box {
  if (sticky) {
    const nav = el.closest('nav') as HTMLElement | null
    if (nav && root.contains(nav)) {
      const elRect = el.getBoundingClientRect()
      const navRect = nav.getBoundingClientRect()
      return {
        left: nav.offsetLeft + (elRect.left - navRect.left),
        top: nav.offsetTop + (elRect.top - navRect.top),
        width: elRect.width,
        height: elRect.height,
      }
    }
  }
  const rootRect = root.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  return {
    left: r.left + window.scrollX - (rootRect.left + window.scrollX),
    top: r.top + window.scrollY - (rootRect.top + window.scrollY),
    width: r.width,
    height: r.height,
  }
}

/** Dash / gap lengths — must match the visible stroke-dasharray. */
const THREAD_DASH = 5
const THREAD_GAP = 5
const THREAD_PERIOD = THREAD_DASH + THREAD_GAP
/** Keep whole dashes (+ round caps) clear of the interlude’s opaque background. */
const INTERLUDE_CLEAR = THREAD_DEFAULT_STROKE_WIDTH * 2 + THREAD_DASH

function setPath(
  el: SVGPathElement | null,
  d: string | null,
  /** When false, `d` already encodes complete dashes (no CSS dasharray). */
  patternDashed = true
) {
  if (!el) return
  if (!d) {
    el.style.display = 'none'
    return
  }
  el.style.display = ''
  el.setAttribute('d', d)
  el.setAttribute('stroke-dasharray', patternDashed ? `${THREAD_DASH} ${THREAD_GAP}` : 'none')
}

/** Probe path for getTotalLength / getPointAtLength (same SVG coordinate space). */
function ensureProbe(svg: SVGSVGElement): SVGPathElement {
  let probe = svg.querySelector<SVGPathElement>('[data-home-thread-probe]')
  if (!probe) {
    probe = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    probe.setAttribute('data-home-thread-probe', '')
    probe.setAttribute('fill', 'none')
    probe.style.display = 'none'
    svg.appendChild(probe)
  }
  return probe
}

/** Length along a mostly top→bottom path where Y first reaches targetY. */
function findLengthAtY(pathEl: SVGPathElement, targetY: number, total: number): number {
  let lo = 0
  let hi = total
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    if (pathEl.getPointAtLength(mid).y < targetY) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Only full dash segments along [fromLen, toLen] — never a half-cut dash at the gap.
 * Returns a multi-subpath `d` drawn with a solid stroke.
 */
function completeDashesAlong(
  pathEl: SVGPathElement,
  fromLen: number,
  toLen: number
): string | null {
  if (!(toLen > fromLen + THREAD_DASH)) return null
  const parts: string[] = []
  let t = fromLen
  // Strict fit: whole dash must sit inside the range (no +epsilon that admits a sliver)
  while (t + THREAD_DASH <= toLen) {
    const dashEnd = t + THREAD_DASH
    for (let s = 0; s <= THREAD_DASH; s += 1) {
      const p = pathEl.getPointAtLength(t + s)
      parts.push(`${s === 0 ? 'M' : 'L'}${p.x},${p.y}`)
    }
    t += THREAD_PERIOD
  }
  return parts.length > 0 ? parts.join(' ') : null
}

/**
 * One natural A→B curve, gapped through an interlude with only complete dashes
 * (no mid-dash leftovers at the text).
 */
function pathsAroundInterlude(
  probe: SVGPathElement,
  fullD: string,
  interlude: Box | null
): [{ d: string; patternDashed: boolean } | null, { d: string; patternDashed: boolean } | null] {
  probe.setAttribute('d', fullD)
  const total = probe.getTotalLength()
  if (!(total > 0)) return [{ d: fullD, patternDashed: true }, null]
  if (!interlude) return [{ d: fullD, patternDashed: true }, null]

  // Pull the gap inward so the last/first dash + round caps never meet the text bg
  const gapTop = findLengthAtY(probe, interlude.top, total) - INTERLUDE_CLEAR
  const gapBot = findLengthAtY(probe, interlude.top + interlude.height, total) + INTERLUDE_CLEAR
  const before = completeDashesAlong(probe, 0, Math.max(0, gapTop))
  const after = completeDashesAlong(probe, Math.min(total, gapBot), total)
  return [
    before ? { d: before, patternDashed: false } : null,
    after ? { d: after, patternDashed: false } : null,
  ]
}

/** Decorative threads in document space — scroll with the page. */
export function HomeHeroThread() {
  const svgRef = useRef<SVGSVGElement>(null)
  const pathRefs = [
    useRef<SVGPathElement>(null),
    useRef<SVGPathElement>(null),
    useRef<SVGPathElement>(null),
    useRef<SVGPathElement>(null),
    useRef<SVGPathElement>(null),
    useRef<SVGPathElement>(null),
    useRef<SVGPathElement>(null),
  ]

  useLayoutEffect(() => {
    const paint = () => {
      const root = document.querySelector<HTMLElement>('[data-home-page]')
      const svg = svgRef.current
      const nod = document.querySelector<HTMLElement>('[data-home-brand-nod]')
      const headline = document.querySelector<HTMLElement>('[data-home-headline]')
      const preview1 = document.querySelector<HTMLElement>('[data-home-preview="1"]')
      const preview2 = document.querySelector<HTMLElement>('[data-home-preview="2"]')
      const preview3 = document.querySelector<HTMLElement>('[data-home-preview="3"]')
      const interlude1 = document.querySelector<HTMLElement>('[data-home-interlude="1"]')
      const interlude2 = document.querySelector<HTMLElement>('[data-home-interlude="2"]')
      const copy3 = document.querySelector<HTMLElement>('[data-home-showcase-copy="3"]')
      const cta = document.querySelector<HTMLElement>('[data-home-cta]')
      if (!root || !svg || !nod || !headline) return

      const probe = ensureProbe(svg)
      const nodBox = boxInRoot(nod, root, true)
      const headlineBox = boxInRoot(headline, root)

      // 0: Nod → headline
      setPath(
        pathRefs[0].current,
        threadPath(
          nodBox.left + nodBox.width / 2,
          nodBox.top + nodBox.height,
          headlineBox.left,
          headlineBox.top + headlineBox.height / 2,
          Position.Bottom,
          Position.Left
        )
      )

      // 1: headline → first preview
      if (preview1) {
        const p1 = boxInRoot(preview1, root)
        setPath(
          pathRefs[1].current,
          threadPath(
            headlineBox.left + headlineBox.width,
            headlineBox.top + headlineBox.height / 2,
            p1.left + p1.width / 2,
            p1.top,
            Position.Right,
            Position.Top
          )
        )
      } else {
        setPath(pathRefs[1].current, null)
      }

      // 2–3: first → second preview (one natural curve, gapped at interlude 1)
      if (preview1 && preview2) {
        const p1 = boxInRoot(preview1, root)
        const p2 = boxInRoot(preview2, root)
        const full = threadPath(
          p1.left + p1.width / 2,
          p1.top + p1.height,
          p2.left + p2.width / 2,
          p2.top,
          Position.Bottom,
          Position.Top
        )
        const i1 = interlude1 ? boxInRoot(interlude1, root) : null
        const [before, after] = pathsAroundInterlude(probe, full, i1)
        setPath(pathRefs[2].current, before?.d ?? null, before?.patternDashed ?? true)
        setPath(pathRefs[3].current, after?.d ?? null, after?.patternDashed ?? true)
      } else {
        setPath(pathRefs[2].current, null)
        setPath(pathRefs[3].current, null)
      }

      // 4–5: second preview → third copy (one natural curve, gapped at interlude 2)
      if (preview2 && copy3) {
        const p2 = boxInRoot(preview2, root)
        const c3 = boxInRoot(copy3, root)
        const full = threadPath(
          p2.left + p2.width / 2,
          p2.top + p2.height,
          c3.left + c3.width / 2,
          c3.top,
          Position.Bottom,
          Position.Top
        )
        const i2 = interlude2 ? boxInRoot(interlude2, root) : null
        const [before, after] = pathsAroundInterlude(probe, full, i2)
        setPath(pathRefs[4].current, before?.d ?? null, before?.patternDashed ?? true)
        setPath(pathRefs[5].current, after?.d ?? null, after?.patternDashed ?? true)
      } else {
        setPath(pathRefs[4].current, null)
        setPath(pathRefs[5].current, null)
      }

      // 6: third preview bottom → get started section bottom (approach from above)
      if (preview3 && cta) {
        const p3 = boxInRoot(preview3, root)
        const ctaBox = boxInRoot(cta, root)
        setPath(
          pathRefs[6].current,
          threadPath(
            p3.left + p3.width / 2,
            p3.top + p3.height,
            ctaBox.left + ctaBox.width / 2,
            ctaBox.top + ctaBox.height,
            Position.Bottom,
            Position.Top
          )
        )
      } else {
        setPath(pathRefs[6].current, null)
      }
    }

    paint()
    window.addEventListener('resize', paint)

    const observer = new ResizeObserver(paint)
    const els = [
      document.querySelector('[data-home-page]'),
      document.querySelector('[data-home-brand-nod]'),
      document.querySelector('[data-home-headline]'),
      document.querySelector('[data-home-preview="1"]'),
      document.querySelector('[data-home-preview="2"]'),
      document.querySelector('[data-home-preview="3"]'),
      document.querySelector('[data-home-interlude="1"]'),
      document.querySelector('[data-home-interlude="2"]'),
      document.querySelector('[data-home-showcase-copy="3"]'),
      document.querySelector('[data-home-cta]'),
    ]
    for (const el of els) {
      if (el) observer.observe(el)
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(paint)
    }
    const retry = window.setTimeout(paint, 400)

    return () => {
      observer.disconnect()
      window.clearTimeout(retry)
      window.removeEventListener('resize', paint)
    }
  }, [])

  return (
    <svg
      ref={svgRef}
      className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible min-[900px]:z-40"
      aria-hidden
    >
      {pathRefs.map((ref, i) => (
        <path
          key={i}
          ref={ref}
          className="animate-thread-flow"
          fill="none"
          stroke={THREAD_DEFAULT_COLOR}
          strokeWidth={THREAD_DEFAULT_STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${THREAD_DASH} ${THREAD_GAP}`}
        />
      ))}
    </svg>
  )
}
