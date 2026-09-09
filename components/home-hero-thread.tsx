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

function setPath(
  el: SVGPathElement | null,
  d: string | null
) {
  if (!el) return
  if (!d) {
    el.style.display = 'none'
    return
  }
  el.style.display = ''
  el.setAttribute('d', d)
}

/** Decorative threads in document space — scroll with the page. */
export function HomeHeroThread() {
  const pathRefs = [
    useRef<SVGPathElement>(null),
    useRef<SVGPathElement>(null),
    useRef<SVGPathElement>(null),
    useRef<SVGPathElement>(null),
  ]

  useLayoutEffect(() => {
    const paint = () => {
      const root = document.querySelector<HTMLElement>('[data-home-page]')
      const nod = document.querySelector<HTMLElement>('[data-home-brand-nod]')
      const headline = document.querySelector<HTMLElement>('[data-home-headline]')
      const preview1 = document.querySelector<HTMLElement>('[data-home-preview="1"]')
      const preview2 = document.querySelector<HTMLElement>('[data-home-preview="2"]')
      const copy2 = document.querySelector<HTMLElement>('[data-home-showcase-copy="2"]')
      const copy3 = document.querySelector<HTMLElement>('[data-home-showcase-copy="3"]')
      if (!root || !nod || !headline) return

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

      // 2: first preview → second section text
      if (preview1 && copy2) {
        const p1 = boxInRoot(preview1, root)
        const c2 = boxInRoot(copy2, root)
        setPath(
          pathRefs[2].current,
          threadPath(
            p1.left + p1.width / 2,
            p1.top + p1.height,
            c2.left + c2.width / 2,
            c2.top,
            Position.Bottom,
            Position.Top
          )
        )
      } else {
        setPath(pathRefs[2].current, null)
      }

      // 3: second preview → third section text
      if (preview2 && copy3) {
        const p2 = boxInRoot(preview2, root)
        const c3 = boxInRoot(copy3, root)
        setPath(
          pathRefs[3].current,
          threadPath(
            p2.left + p2.width / 2,
            p2.top + p2.height,
            c3.left + c3.width / 2,
            c3.top,
            Position.Bottom,
            Position.Top
          )
        )
      } else {
        setPath(pathRefs[3].current, null)
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
      document.querySelector('[data-home-showcase-copy="2"]'),
      document.querySelector('[data-home-showcase-copy="3"]'),
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
          strokeDasharray="5 5"
        />
      ))}
    </svg>
  )
}
