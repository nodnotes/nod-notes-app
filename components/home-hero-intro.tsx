'use client'

import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Position } from 'reactflow'
import { NodNotesIcon } from '@/components/nod-notes-icon'
import { getSmoothThreadBezier } from '@/components/threads/path/bezier'
import {
  THREAD_DEFAULT_COLOR,
  THREAD_DEFAULT_STROKE_WIDTH,
} from '@/components/threads/constants'

type Point = { x: number; y: number }
type BowRatios = { outward: number; along: number }

const BOW_STORAGE_KEY = 'nodnotes-home-hero-thread-bow'

function threadPathThroughBow(start: Point, end: Point, bow: Point) {
  return `M ${start.x} ${start.y} Q ${bow.x} ${bow.y} ${end.x} ${end.y}`
}

function ratiosFromBow(start: Point, end: Point, bow: Point): BowRatios {
  const spanY = end.y - start.y
  const span = Math.max(Math.abs(spanY), 1)
  const baseX = Math.max(start.x, end.x)
  return {
    outward: (bow.x - baseX) / span,
    along: spanY === 0 ? 0.5 : (bow.y - start.y) / spanY,
  }
}

function bowFromRatios(start: Point, end: Point, ratios: BowRatios): Point {
  const spanY = end.y - start.y
  const span = Math.max(Math.abs(spanY), 1)
  const baseX = Math.max(start.x, end.x)
  return {
    x: baseX + span * ratios.outward,
    y: start.y + spanY * ratios.along,
  }
}

function readStoredBowRatios(): BowRatios | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(BOW_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BowRatios
    if (
      typeof parsed.outward === 'number' &&
      typeof parsed.along === 'number' &&
      Number.isFinite(parsed.outward) &&
      Number.isFinite(parsed.along)
    ) {
      return parsed
    }
  } catch {
    return null
  }
  return null
}

export function HomeHeroIntro() {
  const containerRef = useRef<HTMLDivElement>(null)
  const nodRef = useRef<HTMLSpanElement>(null)
  const headlineRef = useRef<HTMLHeadingElement>(null)
  const bowRatiosRef = useRef<BowRatios | null>(readStoredBowRatios())
  const [endpoints, setEndpoints] = useState<{ start: Point; end: Point } | null>(null)
  const [bowPoint, setBowPoint] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)
  const [bowLocked, setBowLocked] = useState(() => readStoredBowRatios() !== null)

  const measureThread = useCallback(() => {
    const container = containerRef.current
    const nod = nodRef.current
    const headline = headlineRef.current
    if (!container || !nod || !headline) return

    const containerRect = container.getBoundingClientRect()
    const nodRect = nod.getBoundingClientRect()
    const headlineRect = headline.getBoundingClientRect()

    const start = {
      x: nodRect.right - containerRect.left,
      y: nodRect.top + nodRect.height / 2 - containerRect.top,
    }
    const end = {
      x: headlineRect.right - containerRect.left,
      y: headlineRect.top + headlineRect.height / 2 - containerRect.top,
    }

    setEndpoints({ start, end })

    const stored = bowRatiosRef.current
    if (stored) {
      setBowPoint(bowFromRatios(start, end, stored))
      return
    }

    const { mid } = getSmoothThreadBezier({
      sourceX: start.x,
      sourceY: start.y,
      sourcePosition: Position.Right,
      targetX: end.x,
      targetY: end.y,
      targetPosition: Position.Right,
    })
    setBowPoint(mid)
  }, [])

  useLayoutEffect(() => {
    measureThread()
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(measureThread)
    observer.observe(container)
    const nodEl = nodRef.current
    const headlineEl = headlineRef.current
    if (nodEl) observer.observe(nodEl)
    if (headlineEl) observer.observe(headlineEl)
    window.addEventListener('resize', measureThread)

    if (document.fonts?.ready) {
      document.fonts.ready.then(measureThread)
    }

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measureThread)
    }
  }, [measureThread])

  const onBowPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const container = containerRef.current
    if (!container || !endpoints) return

    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)

    const containerRect = container.getBoundingClientRect()

    const move = (e: PointerEvent) => {
      setBowPoint({
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top,
      })
    }

    const up = (e: PointerEvent) => {
      setDragging(false)
      const point = {
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top,
      }
      const ratios = ratiosFromBow(endpoints.start, endpoints.end, point)
      bowRatiosRef.current = ratios
      window.localStorage.setItem(BOW_STORAGE_KEY, JSON.stringify(ratios))
      setBowLocked(true)
      setBowPoint(point)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const path =
    endpoints && bowPoint
      ? threadPathThroughBow(endpoints.start, endpoints.end, bowPoint)
      : null

  return (
    <div ref={containerRef} className="relative mx-auto mb-6 w-full max-w-3xl overflow-visible">
      {path ? (
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
          aria-hidden
        >
          <path
            d={path}
            fill="none"
            stroke={THREAD_DEFAULT_COLOR}
            strokeWidth={THREAD_DEFAULT_STROKE_WIDTH}
            strokeLinecap="round"
          />
        </svg>
      ) : null}

      {bowPoint && !bowLocked ? (
        <button
          type="button"
          aria-label="Drag to position hero thread"
          onPointerDown={onBowPointerDown}
          className={`absolute z-20 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow-sm ${
            dragging ? 'cursor-grabbing scale-110' : 'cursor-grab'
          }`}
          style={{ left: bowPoint.x, top: bowPoint.y }}
        />
      ) : null}

      <div className="mb-10 flex w-full justify-center text-6xl min-[900px]:text-7xl lg:text-8xl">
        <div className="relative inline-block leading-none">
          <span
            ref={nodRef}
            className="relative block font-young-serif font-normal text-blue-500"
          >
            Nod
            <NodNotesIcon className="absolute right-full top-1/2 mr-2 h-[0.79cap] w-auto -translate-y-[calc(50%+0.03em)] shrink-0 text-gray-700" />
          </span>
          <span
            className="absolute left-[0.1em] top-full -translate-y-[0.52em] inline-block bg-[#fef9c3] px-[0.1em] py-[0.1em] font-notes-sans text-[0.24em] font-semibold leading-none tracking-normal text-gray-700 uppercase"
            aria-hidden
          >
            Notes
          </span>
        </div>
      </div>

      <h1
        ref={headlineRef}
        className="font-young-serif text-4xl min-[900px]:text-5xl lg:text-6xl font-bold tracking-[0.02em] text-foreground"
      >
        The visual workspace built for Notion
      </h1>
    </div>
  )
}
