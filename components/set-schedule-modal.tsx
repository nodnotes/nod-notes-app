'use client'

// Full-screen Sets Schedule popup — forgetting curve (left) + end-date calendar (right).

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  buildSetSchedule,
  DEFAULT_SCHEDULE_PARAMS,
  formatScheduleFormula,
  formatSessionTime,
  localDateKey,
  parseScheduleFormula,
  retentionAtEndDate,
  reviewsByDayKey,
  sampleForgettingCurve,
  forgettingCurveMarkers,
  forgettingCurveSegments,
  sampleProjectedDecays,
  sampleRetentionFloor,
  shouldUseIntraDayReviews,
  startOfLocalDay,
  suggestReviewCount,
  type ScheduleParams,
  type ScheduleReview,
} from '@/lib/set-schedule'

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] // Calendar column headers

type Props = {
  open: boolean // Controlled by the Sets ⋯ menu
  onOpenChange: (open: boolean) => void
  setName: string // Shown in the title
}

/** Full-screen spaced-repetition planner for one set. */
export function SetScheduleModal({ open, onOpenChange, setName }: Props) {
  const today = useMemo(() => startOfLocalDay(new Date()), [open]) // Freeze "today" per open
  const [endDate, setEndDate] = useState<Date | null>(null) // Blank graph until picked
  const [params, setParams] = useState<ScheduleParams>(DEFAULT_SCHEDULE_PARAMS)
  const [formulaText, setFormulaText] = useState(() => formatScheduleFormula(DEFAULT_SCHEDULE_PARAMS))
  const [reviewCount, setReviewCount] = useState<number | null>(null) // null → auto from end date
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))

  // Reset planner state whenever the dialog opens fresh
  useEffect(() => {
    if (!open) return
    setEndDate(null)
    setParams(DEFAULT_SCHEDULE_PARAMS)
    setFormulaText(formatScheduleFormula(DEFAULT_SCHEDULE_PARAMS))
    setReviewCount(null)
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1))
  }, [open, today])

  const reviews: ScheduleReview[] = useMemo(() => {
    if (!endDate) return [] // Graph stays empty until an end date exists
    // Omit count when auto so packing can maximize end-date retention
    return buildSetSchedule(today, endDate, params, reviewCount ?? undefined)
  }, [endDate, today, params, reviewCount])

  const studyByDay = useMemo(() => reviewsByDayKey(reviews), [reviews])
  const intraDay = endDate ? shouldUseIntraDayReviews(today, endDate, params) : false

  const displayCount = endDate
    ? (reviewCount ?? reviews.length ?? suggestReviewCount(today, endDate, params))
    : ''
  const endRetention = endDate && reviews.length ? retentionAtEndDate(reviews, endDate, params) : null

  const pickEndDate = (day: Date) => {
    const picked = startOfLocalDay(day)
    if (picked.getTime() < today.getTime()) return // Past days are not valid deadlines
    setEndDate(picked)
    setReviewCount(null) // Re-auto count when the deadline moves
  }

  const commitFormula = () => {
    const next = parseScheduleFormula(formulaText, params)
    setParams(next)
    setFormulaText(formatScheduleFormula(next)) // Normalize after edit
  }

  const onReviewCountChange = (raw: string) => {
    if (!endDate) return
    const n = parseInt(raw, 10)
    if (Number.isNaN(n)) {
      setReviewCount(null) // Empty → fall back to auto
      return
    }
    setReviewCount(Math.min(24, Math.max(1, n)))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[min(680px,calc(100vh-2rem))] w-[min(840px,calc(100vw-2rem))] max-w-none',
          'p-0 gap-0 overflow-hidden',
          'rounded-xl border border-black/10 bg-white shadow-xl dark:border-white/10 dark:bg-[#171717]',
          '[&>button]:hidden' // Use our header close; hide the default X
        )}
      >
        <DialogTitle className="sr-only">Schedule {setName}</DialogTitle>
        <DialogDescription className="sr-only">
          Pick an end date to plan spaced-repetition reviews and see predicted percent memorized
        </DialogDescription>

        {/* Header */}
        <div className="absolute inset-x-0 top-0 z-10 flex h-12 items-center justify-between border-b border-black/10 bg-[var(--nod-chat-prompt)] px-4 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-2">
            <CalendarDays className="h-4 w-4 flex-shrink-0 text-gray-700 dark:text-gray-200" />
            <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
              Schedule · {setName}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 hover:bg-black/5 hover:text-gray-900 dark:hover:bg-white/10 dark:hover:text-gray-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: graph | calendar — stack on narrow viewports */}
        <div className="flex max-h-[calc(min(680px,100vh-2rem)-3rem)] min-h-0 w-full flex-col overflow-y-auto pt-12 md:h-[calc(min(680px,100vh-2rem)-3rem)] md:flex-row md:overflow-hidden">
          {/* Left — fields + forgetting curve */}
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-b border-black/10 p-4 md:border-b-0 md:border-r dark:border-white/10">
            <div className="mb-3 shrink-0 space-y-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                # of reviews before end date
              </label>
              <input
                type="number"
                min={1}
                max={24}
                disabled={!endDate}
                value={displayCount}
                onChange={(e) => onReviewCountChange(e.target.value)}
                placeholder={endDate ? undefined : '—'}
                className={cn(
                  'h-9 w-full max-w-[12rem] rounded-md border border-black/10 bg-white px-3 text-sm outline-none',
                  'focus:border-[var(--nod-blue)] dark:border-white/10 dark:bg-[#0f0f0f] dark:text-gray-100',
                  !endDate && 'cursor-not-allowed opacity-50'
                )}
              />
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                Formula
              </label>
              <input
                type="text"
                disabled={!endDate}
                value={formulaText}
                onChange={(e) => setFormulaText(e.target.value)}
                onBlur={commitFormula}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur() // Commit on Enter
                  }
                }}
                spellCheck={false}
                className={cn(
                  'h-9 w-full rounded-md border border-black/10 bg-white px-3 font-mono text-xs outline-none',
                  'focus:border-[var(--nod-blue)] dark:border-white/10 dark:bg-[#0f0f0f] dark:text-gray-100',
                  !endDate && 'cursor-not-allowed opacity-50'
                )}
              />
              <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                FSRS-6: reviews when R hits <span className="font-medium">Rd</span> (default 90%).
                Yellow points are the same % as the old bars (R just before each session: 0% → ~Rd → …).
                Blue is the live path (spike to 100% after study, then forget). Dashed = if you stopped
                (±1 SD on yellow).
                {intraDay ? ' Short deadlines may pack same-day reviews.' : ''}
              </p>
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-black/10 bg-gray-50/80 p-3 dark:border-white/10 dark:bg-[#0f0f0f]/60">
              {!endDate ? (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center">
                  <CalendarDays className="h-8 w-8 text-gray-400" />
                  <p className="max-w-xs text-sm text-gray-600 dark:text-gray-300">
                    Pick an end date on the calendar to generate your review plan.
                  </p>
                </div>
              ) : (
                <ForgettingCurveChart reviews={reviews} endDate={endDate} params={params} />
              )}
            </div>
          </section>

          {/* Right — month calendar */}
          <section className="flex w-full flex-shrink-0 flex-col p-4 md:max-w-[300px] md:w-[300px]">
            <p className="mb-3 text-xs text-gray-600 dark:text-gray-300">
              {endDate
                ? 'Study days are marked. Click another day to change the end date.'
                : 'Select your end date (exam / goal day).'}
            </p>
            <ScheduleCalendar
              viewMonth={viewMonth}
              onViewMonthChange={setViewMonth}
              today={today}
              endDate={endDate}
              studyByDay={studyByDay}
              onPickEndDate={pickEndDate}
            />
            {endDate && (
              <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                End date{' '}
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {endDate.toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                {' · '}
                {reviews.length} study session{reviews.length === 1 ? '' : 's'}
                {endRetention != null && (
                  <>
                    {' · '}
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      ~{Math.round(endRetention)}% on end date
                    </span>
                  </>
                )}
              </p>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** FSRS path (blue) + bar-equivalent session % (yellow) with ±SD. */
function ForgettingCurveChart({
  reviews,
  endDate,
  params,
}: {
  reviews: ScheduleReview[]
  endDate: Date
  params: ScheduleParams
}) {
  const points = useMemo(
    () => sampleForgettingCurve(reviews, endDate, params),
    [reviews, endDate, params]
  )
  const segments = useMemo(() => forgettingCurveSegments(points), [points])
  const projections = useMemo(
    () => sampleProjectedDecays(reviews, endDate, params),
    [reviews, endDate, params]
  )
  // Same heights as the old bar chart (one point per session)
  const markers = useMemo(
    () => forgettingCurveMarkers(reviews, endDate, params),
    [reviews, endDate, params]
  )
  const floor = useMemo(
    () => sampleRetentionFloor(reviews, endDate, params),
    [reviews, endDate, params]
  )
  const W = 640
  const H = 280
  const padL = 44
  const padR = 16
  const padT = 18
  const padB = 28 // Only N× labels on the axis (no day numbers between them)
  const innerW = W - padL - padR
  const innerH = H - padT - padB
  const maxT = Math.max(points[points.length - 1]?.tDays ?? 1, 0.01)
  const xFor = (tDays: number) => padL + (tDays / maxT) * innerW
  const yFor = (pct: number) => padT + innerH * (1 - pct / 100)
  const pathFrom = (pts: { tDays: number; retentionPct: number }[]) =>
    pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(p.tDays).toFixed(2)} ${yFor(p.retentionPct).toFixed(2)}`)
      .join(' ')

  const linePath = pathFrom(points)
  const floorPath = floor.length >= 2 ? pathFrom(floor) : ''

  const bandPaths = segments
    .filter((seg) => seg.length >= 2 && seg.some((p) => p.retentionPct < 99.5))
    .map((seg) => {
      const top = seg.map((p) => ({
        x: xFor(p.tDays),
        y: yFor(Math.min(100, p.retentionPct + p.sdPct)),
      }))
      const bot = seg.map((p) => ({
        x: xFor(p.tDays),
        y: yFor(Math.max(0, p.retentionPct - p.sdPct)),
      }))
      const forward = top
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ')
      const back = [...bot]
        .reverse()
        .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(' ')
      return `${forward} ${back} Z`
    })

  // Unlabeled post-study peaks (blue)
  const peakMarks = points.filter((p) => p.reviewIndex != null)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="mb-1 flex shrink-0 items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
        <span>% memorized (R)</span>
        <span>Reviews →</span>
      </div>
      <div className="min-h-0 w-full flex-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-full w-full"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Forgetting curve over the study plan"
        >
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line
                x1={padL}
                x2={W - padR}
                y1={yFor(tick)}
                y2={yFor(tick)}
                className="stroke-black/10 dark:stroke-white/10"
                strokeWidth={1}
              />
              <text
                x={padL - 6}
                y={yFor(tick) + 3}
                textAnchor="end"
                className="fill-gray-500 dark:fill-gray-400"
                fontSize={10}
              >
                {tick}
              </text>
            </g>
          ))}

          {/* Guides from each bar-equivalent point down to its N× label */}
          {markers.map((m) => (
            <line
              key={`guide-${m.timesReviewed}`}
              x1={xFor(m.tDays)}
              x2={xFor(m.tDays)}
              y1={yFor(m.retentionPct)}
              y2={H - padB + 2}
              className="stroke-black/15 dark:stroke-white/15"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
          ))}

          {bandPaths.map((d, i) => (
            <path key={`band-${i}`} d={d} className="fill-[var(--nod-blue)] opacity-15" />
          ))}

          {projections.map((proj) => (
            <path
              key={`proj-${proj.reviewIndex}`}
              d={pathFrom(proj.points)}
              fill="none"
              className="stroke-[var(--nod-blue)]"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              strokeOpacity={0.45}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {floorPath ? (
            <path
              d={floorPath}
              fill="none"
              stroke="#e6b422"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {linePath ? (
            <path
              d={linePath}
              fill="none"
              className="stroke-[var(--nod-blue)]"
              strokeWidth={2.25}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}

          {peakMarks.map((p) => (
            <circle
              key={`peak-${p.reviewIndex}`}
              cx={xFor(p.tDays)}
              cy={yFor(p.retentionPct)}
              r={2.5}
              className="fill-[var(--nod-blue)] stroke-white dark:stroke-[#0f0f0f]"
              strokeWidth={1}
            >
              <title>{`Just studied (session ${p.reviewIndex}) · ${p.at.toLocaleString()}`}</title>
            </circle>
          ))}

          {/* Yellow = bar heights; whiskers = same ±SD the bars used */}
          {markers.map((m) => {
            const x = xFor(m.tDays)
            const y = yFor(m.retentionPct)
            const yHi = yFor(Math.min(100, m.retentionPct + m.sdPct))
            const yLo = yFor(Math.max(0, m.retentionPct - m.sdPct))
            return (
              <g key={`bar-${m.timesReviewed}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={yHi}
                  y2={yLo}
                  stroke="#e6b422"
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                />
                <line x1={x - 4} x2={x + 4} y1={yHi} y2={yHi} stroke="#e6b422" strokeWidth={1.5} />
                <line x1={x - 4} x2={x + 4} y1={yLo} y2={yLo} stroke="#e6b422" strokeWidth={1.5} />
                <circle
                  cx={x}
                  cy={y}
                  r={5}
                  fill="#e6b422"
                  className="stroke-white dark:stroke-[#0f0f0f]"
                  strokeWidth={1.5}
                />
                <text
                  x={x}
                  y={yHi - 6}
                  textAnchor="middle"
                  fill="#b8860b"
                  fontSize={10}
                  fontWeight={600}
                >
                  {Math.round(m.retentionPct)}%
                </text>
                <title>{`${m.timesReviewed}× reviewed · ${Math.round(m.retentionPct)}% (±${Math.round(m.sdPct)}) · ${m.at.toLocaleString()}`}</title>
              </g>
            )
          })}

          {/* Only N× on the axis — no day numbers between them */}
          {markers.map((m) => (
            <text
              key={`lbl-${m.timesReviewed}`}
              x={xFor(m.tDays)}
              y={H - 8}
              textAnchor="middle"
              fill="#b8860b"
              fontSize={10}
              fontWeight={600}
            >
              {m.timesReviewed}×
            </text>
          ))}
        </svg>
      </div>
    </div>
  )
}

/** Month grid — hover a dotted day for session times; click always sets the end date. */
function ScheduleCalendar({
  viewMonth,
  onViewMonthChange,
  today,
  endDate,
  studyByDay,
  onPickEndDate,
}: {
  viewMonth: Date
  onViewMonthChange: (d: Date) => void
  today: Date
  endDate: Date | null
  studyByDay: Map<string, ScheduleReview[]>
  onPickEndDate: (d: Date) => void
}) {
  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const firstDow = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const label = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const endKey = endDate ? localDateKey(endDate) : null
  const todayKey = localDateKey(today)
  const [timesPopup, setTimesPopup] = useState<{
    key: string
    sessions: ScheduleReview[]
    left: number
    top: number
  } | null>(null)
  const calRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null) // Grace so pointer can enter the popup

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current)
      hideTimer.current = null
    }
  }

  const showTimes = (key: string, sessions: ScheduleReview[], el: HTMLElement) => {
    if (sessions.length === 0) return
    clearHideTimer()
    const parent = calRef.current?.getBoundingClientRect()
    const cell = el.getBoundingClientRect()
    const left = Math.min(
      Math.max(8, cell.left - (parent?.left ?? 0)),
      (parent?.width ?? 240) - 200
    )
    const top = cell.bottom - (parent?.top ?? 0) + 4
    setTimesPopup({ key, sessions, left, top })
  }

  const scheduleHideTimes = () => {
    clearHideTimer()
    hideTimer.current = setTimeout(() => setTimesPopup(null), 120) // Brief leave grace into the popup
  }

  useEffect(() => () => clearHideTimer(), [])

  return (
    <div
      ref={calRef}
      className="relative rounded-lg border border-black/10 bg-white p-3 dark:border-white/10 dark:bg-[#0f0f0f]"
    >
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
          aria-label="Previous month"
          onClick={() => onViewMonthChange(new Date(year, month - 1, 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10"
          aria-label="Next month"
          onClick={() => onViewMonthChange(new Date(year, month + 1, 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium text-gray-500 dark:text-gray-400">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} className="h-9" />
          const key = localDateKey(day)
          const isPast = day.getTime() < today.getTime()
          const isToday = key === todayKey
          const isEnd = key === endKey
          const sessions = studyByDay.get(key) ?? []
          const sessionCount = sessions.length
          return (
            <button
              key={key}
              type="button"
              disabled={isPast}
              onClick={() => {
                if (isPast) return
                setTimesPopup(null)
                onPickEndDate(day) // Click always adjusts the end date
              }}
              onPointerEnter={(e) => {
                if (sessionCount > 0) showTimes(key, sessions, e.currentTarget)
              }}
              onPointerLeave={scheduleHideTimes}
              className={cn(
                'relative flex h-9 flex-col items-center justify-center rounded-md text-xs transition-colors',
                isPast && 'cursor-not-allowed text-gray-300 dark:text-gray-600',
                !isPast && 'text-gray-800 hover:bg-black/5 dark:text-gray-100 dark:hover:bg-white/10',
                isToday && !isEnd && 'ring-1 ring-black/15 dark:ring-white/20',
                isEnd && 'bg-[var(--nod-blue)] text-white hover:bg-[var(--nod-blue)]'
              )}
              title={
                isPast
                  ? undefined
                  : sessionCount > 0
                    ? `${sessionCount} study session${sessionCount === 1 ? '' : 's'} — hover for times`
                    : isEnd
                      ? 'End date'
                      : 'Set as end date'
              }
            >
              {day.getDate()}
              {sessionCount > 0 && (
                <span className="absolute bottom-0.5 flex max-w-[90%] items-center justify-center gap-0.5">
                  {Array.from({ length: Math.min(sessionCount, 4) }).map((_, di) => (
                    <span
                      key={di}
                      className={cn(
                        'h-1 w-1 flex-shrink-0 rounded-full',
                        isEnd ? 'bg-white' : 'bg-[var(--nod-blue)]'
                      )}
                    />
                  ))}
                  {sessionCount > 4 && (
                    <span
                      className={cn(
                        'text-[8px] leading-none',
                        isEnd ? 'text-white/90' : 'text-[var(--nod-blue)]'
                      )}
                    >
                      +
                    </span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {timesPopup && (
        <div
          role="tooltip"
          aria-label="Study times"
          className="absolute z-20 w-48 rounded-lg border border-black/10 bg-white p-2 shadow-lg dark:border-white/10 dark:bg-[#171717]"
          style={{ left: timesPopup.left, top: timesPopup.top }}
          onPointerEnter={clearHideTimer}
          onPointerLeave={scheduleHideTimes}
        >
          <p className="mb-1.5 px-1 text-[11px] font-medium text-gray-700 dark:text-gray-200">
            {timesPopup.sessions[0]?.date.toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </p>
          <ul className="max-h-40 space-y-0.5 overflow-y-auto">
            {timesPopup.sessions.map((s) => (
              <li
                key={s.index}
                className="flex items-center justify-between rounded-md px-1.5 py-1 text-xs text-gray-800 dark:text-gray-100"
              >
                <span className="text-gray-500 dark:text-gray-400">#{s.index}</span>
                <span className="font-medium">{formatSessionTime(s.at)}</span>
                <span className="tabular-nums text-gray-500 dark:text-gray-400">
                  {Math.round(s.retentionPct)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
