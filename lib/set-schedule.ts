// Spaced-repetition schedule for a set — FSRS-6 (DSR) memory model.
// Based on Woźniak’s Difficulty–Stability–Retrievability model as implemented in
// FSRS-6 (Ye / open-spaced-repetition; default weights trained on Anki review logs).
// Forgetting curve + stability updates match the public FSRS-6 algorithm wiki.
// Deadline packing reviews when R hits desired retention, maximizing R on the end date.

/** Editable planner knobs (full FSRS-6 weight vector stays at published defaults). */
export type ScheduleParams = {
  desiredRetention: number // Target R before each scheduled review (FSRS Rd), default 0.9
  difficulty: number // Card difficulty D ∈ [1, 10] (FSRS D); higher → slower S growth
  sdFloor: number // Minimum ± percentage points on error bars
}

/** Defaults: FSRS request_retention 0.9 + mean initial difficulty from w[4]. */
export const DEFAULT_SCHEDULE_PARAMS: ScheduleParams = {
  desiredRetention: 0.9,
  difficulty: 6.4133, // w[4] — FSRS-6 default initial difficulty (Good)
  sdFloor: 4,
}

/**
 * FSRS-6 default weights (open-spaced-repetition / ts-fsrs / fsrs-rs).
 * w[0..3] init S for Again/Hard/Good/Easy; w[4..] difficulty & stability updates; w[20] decay.
 */
export const FSRS6_W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
] as const

const GRADE_GOOD = 3 // Assumed successful study session grade
const S_MIN = 0.01
const S_MAX = 36500
const MIN_GAP_HOURS = 1
const DAY_END_HOUR = 21
const DAY_START_HOUR = 8

/** FSRS-6 forgetting-curve factor from decay so R(S,S)=0.9. */
function fsrsFactor(decay: number = FSRS6_W[20]): number {
  return Math.pow(0.9, -1 / decay) - 1
}

/** Retrievability R(t,S) — FSRS-6 power-law forgetting curve (probability of recall). */
export function fsrsRetrievability(elapsedDays: number, stability: number, decay = FSRS6_W[20]): number {
  if (elapsedDays <= 0) return 1
  const S = Math.max(stability, S_MIN)
  const factor = fsrsFactor(decay)
  return Math.pow(1 + (factor * elapsedDays) / S, -decay)
}

/** Days until R falls to `r` given stability S — closed-form FSRS interval. */
export function fsrsIntervalDays(stability: number, r: number, decay = FSRS6_W[20]): number {
  const Rd = clamp(r, 0.7, 0.99)
  const S = Math.max(stability, S_MIN)
  const factor = fsrsFactor(decay)
  return (S / factor) * (Math.pow(Rd, -1 / decay) - 1)
}

/**
 * Stability after a successful long-term review (Good).
 * S′_r(D,S,R,G) = S·(1 + e^{w8}·(11−D)·S^{−w9}·(e^{w10·(1−R)}−1)·…)
 */
export function fsrsNextStability(
  difficulty: number,
  stability: number,
  retrievability: number,
  grade: number = GRADE_GOOD
): number {
  const w = FSRS6_W
  const D = clamp(difficulty, 1, 10)
  const S = Math.max(stability, S_MIN)
  const R = clamp(retrievability, 0.0001, 0.9999)
  const hard = grade === 2 ? w[15] : 1
  const easy = grade === 4 ? w[16] : 1
  const next =
    S *
    (1 +
      Math.exp(w[8]) *
        (11 - D) *
        Math.pow(S, -w[9]) *
        (Math.exp(w[10] * (1 - R)) - 1) *
        hard *
        easy)
  return clamp(next, S_MIN, S_MAX)
}

/**
 * Same-day / short-term stability update (FSRS-6).
 * S′ = S · e^{w17·(G−3+w18)} · S^{−w19}
 */
export function fsrsSameDayStability(stability: number, grade: number = GRADE_GOOD): number {
  const w = FSRS6_W
  const S = Math.max(stability, S_MIN)
  const next = S * Math.exp(w[17] * (grade - 3 + w[18])) * Math.pow(S, -w[19])
  return clamp(Math.max(next, S), S_MIN, S_MAX) // Hard+ non-decrease style floor at S
}

/** Initial stability after first Good learning review (w[2]). */
export function fsrsInitialStability(): number {
  return FSRS6_W[2]
}

/** Human-readable FSRS-6 formula shown under the review count; editable Rd / D. */
export function formatScheduleFormula(params: ScheduleParams): string {
  const decay = FSRS6_W[20]
  const factor = fsrsFactor(decay)
  return (
    `R=(1+${trimNum(factor)}·Δt/S)^(-${trimNum(decay)})  ` +
    `Rd=${trimNum(params.desiredRetention)}  D=${trimNum(params.difficulty)}  ` +
    `FSRS-6`
  )
}

/** Pull Rd and D from an edited formula string. */
export function parseScheduleFormula(
  text: string,
  fallback: ScheduleParams = DEFAULT_SCHEDULE_PARAMS
): ScheduleParams {
  const rdMatch = text.match(/Rd\s*=\s*([0-9]*\.?[0-9]+)/i)
  const dMatch = text.match(/\bD\s*=\s*([0-9]*\.?[0-9]+)/i)
  const desiredRetention = clamp(
    parseFloat(rdMatch?.[1] ?? String(fallback.desiredRetention)),
    0.7,
    0.99
  )
  const difficulty = clamp(parseFloat(dMatch?.[1] ?? String(fallback.difficulty)), 1, 10)
  return { desiredRetention, difficulty, sdFloor: fallback.sdFloor }
}

/** One planned review session for the forgetting curve + calendar marks. */
export type ScheduleReview = {
  index: number
  date: Date
  at: Date
  deltaDays: number // Fractional days since previous review
  retentionPct: number // FSRS R just before this review × 100
  sdPct: number
  stability: number // S after this session (days to R=90%)
}

/** One sample on the continuous FSRS forgetting curve (time vs retrievability). */
export type ForgettingCurvePoint = {
  at: Date
  tDays: number // Days since the first review (x-axis)
  retentionPct: number // R × 100 after the last completed session
  sdPct: number // ± band around this sample
  reviewIndex: number | null // Set when this sample is exactly a review instant
}

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function diffLocalDays(a: Date, b: Date): number {
  const ms = startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function formatSessionTime(at: Date): string {
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function reviewsByDayKey(reviews: ScheduleReview[]): Map<string, ScheduleReview[]> {
  const map = new Map<string, ScheduleReview[]>()
  for (const r of reviews) {
    const key = localDateKey(r.date)
    const list = map.get(key)
    if (list) list.push(r)
    else map.set(key, [r])
  }
  for (const list of map.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime())
  return map
}

/**
 * Same-day packing has positive ROI when the FSRS interval at initial S is still
 * well under one day at the chosen desired retention (early reviews are sub-day).
 */
export function shouldUseIntraDayReviews(
  start: Date,
  end: Date,
  params: ScheduleParams = DEFAULT_SCHEDULE_PARAMS
): boolean {
  const span = Math.max(0, diffLocalDays(start, end))
  return span <= intraDayRoiHorizonDays(params)
}

export function intraDayRoiHorizonDays(params: ScheduleParams = DEFAULT_SCHEDULE_PARAMS): number {
  const S0 = fsrsInitialStability()
  const firstGap = fsrsIntervalDays(S0, params.desiredRetention)
  // If the first post-learn interval is < ~1.25d, short deadlines benefit from hourly packing
  const horizon = Math.ceil(Math.max(1, firstGap * 2.5))
  return clamp(horizon, 1, 5)
}

export function retentionAtEndDate(
  reviews: ScheduleReview[],
  end: Date,
  _params: ScheduleParams
): number {
  if (reviews.length === 0) return 0
  const last = reviews[reviews.length - 1]
  const endMoment = endOfStudyDay(end)
  const dtDays = (endMoment.getTime() - last.at.getTime()) / 86_400_000
  if (dtDays <= 0) return 100
  // R after last session uses post-session stability
  return clamp(100 * fsrsRetrievability(dtDays, last.stability), 0, 100)
}

/**
 * Dense FSRS forgetting curve from first Learn → end date.
 * After each study R jumps to 100%, then decays until the next session’s bar height
 * (`ScheduleReview.retentionPct` — same values the old bar chart plotted).
 * Includes a (t=0, 0%) point so session 1 matches the 0% bar (not yet reviewed).
 */
export function sampleForgettingCurve(
  reviews: ScheduleReview[],
  end: Date,
  params: ScheduleParams = DEFAULT_SCHEDULE_PARAMS,
  samplesPerSegment = 24
): ForgettingCurvePoint[] {
  if (reviews.length === 0) return []
  const t0 = reviews[0].at.getTime()
  const endMoment = endOfStudyDay(end)
  const points: ForgettingCurvePoint[] = []
  const push = (
    at: Date,
    retentionPct: number,
    reviewIndex: number | null,
    sessionIndex: number
  ) => {
    const pct = clamp(retentionPct, 0, 100)
    points.push({
      at,
      tDays: (at.getTime() - t0) / 86_400_000,
      retentionPct: pct,
      sdPct: retentionSd(pct, Math.max(1, sessionIndex), params.sdFloor),
      reviewIndex,
    })
  }

  // Bar #1 was 0% (zero reviews) — keep that as the curve origin before Learn
  push(reviews[0].at, reviews[0].retentionPct, null, 0)

  for (let i = 0; i < reviews.length; i++) {
    const session = reviews[i]
    // Just after study: R = 100%, then forget toward the next bar height
    push(session.at, 100, session.index, session.index)
    const nextAt = i + 1 < reviews.length ? reviews[i + 1].at : endMoment
    const spanMs = nextAt.getTime() - session.at.getTime()
    if (spanMs <= 0) continue
    const steps = Math.max(2, samplesPerSegment)
    for (let s = 1; s <= steps; s++) {
      const at = new Date(session.at.getTime() + (spanMs * s) / steps)
      const dtDays = (at.getTime() - session.at.getTime()) / 86_400_000
      // Land exactly on the next session’s bar % (or end-date R)
      const r =
        i + 1 < reviews.length && s === steps
          ? reviews[i + 1].retentionPct
          : 100 * fsrsRetrievability(dtDays, session.stability)
      push(at, r, null, session.index)
    }
  }

  const last = points[points.length - 1]
  if (!last || Math.abs(last.at.getTime() - endMoment.getTime()) > 60_000) {
    push(endMoment, retentionAtEndDate(reviews, end, params), null, reviews.length)
  }
  return points
}

/** Split the flat sample list into continuous decay segments (no vertical review jumps). */
export function forgettingCurveSegments(
  points: ForgettingCurvePoint[]
): ForgettingCurvePoint[][] {
  if (points.length === 0) return []
  const segs: ForgettingCurvePoint[][] = []
  let cur: ForgettingCurvePoint[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const p = points[i]
    // Same timestamp + R jump = review boost — start a new ribbon segment
    if (p.tDays <= prev.tDays + 1e-9) {
      if (cur.length) segs.push(cur)
      cur = [p]
    } else {
      cur.push(p)
    }
  }
  if (cur.length) segs.push(cur)
  return segs
}

/**
 * Dashed “what if I stopped reviewing” curves: from each post-session peak, keep decaying
 * with that session’s stability out to the end date (no further jumps).
 */
export function sampleProjectedDecays(
  reviews: ScheduleReview[],
  end: Date,
  params: ScheduleParams = DEFAULT_SCHEDULE_PARAMS,
  samples = 36
): Array<{ reviewIndex: number; points: ForgettingCurvePoint[] }> {
  if (reviews.length === 0) return []
  const t0 = reviews[0].at.getTime()
  const endMoment = endOfStudyDay(end)
  const endT = Math.max(0, (endMoment.getTime() - t0) / 86_400_000)
  const out: Array<{ reviewIndex: number; points: ForgettingCurvePoint[] }> = []

  for (const session of reviews) {
    const spanMs = endMoment.getTime() - session.at.getTime()
    if (spanMs <= 0) continue
    const points: ForgettingCurvePoint[] = []
    const steps = Math.max(4, samples)
    for (let s = 0; s <= steps; s++) {
      const at = new Date(session.at.getTime() + (spanMs * s) / steps)
      const dtDays = (at.getTime() - session.at.getTime()) / 86_400_000
      const pct = clamp(100 * fsrsRetrievability(dtDays, session.stability), 0, 100)
      points.push({
        at,
        tDays: (at.getTime() - t0) / 86_400_000,
        retentionPct: pct,
        sdPct: retentionSd(pct, session.index, params.sdFloor),
        reviewIndex: null,
      })
    }
    if (points.length >= 2 && endT > 0) out.push({ reviewIndex: session.index, points })
  }
  return out
}

/** Milestone matching a bar-chart session: timesReviewed + that session’s retentionPct. */
export type ForgettingCurveMarker = {
  tDays: number
  retentionPct: number
  sdPct: number
  timesReviewed: number // 0 for first session (bar was 0%), then 1, 2, …
  at: Date
}

/**
 * Yellow path + axis marks = the old bar heights exactly.
 * Session i uses `reviews[i].retentionPct` (0% → ~Rd → …), not the post-study 100% peaks.
 */
export function sampleRetentionFloor(
  reviews: ScheduleReview[],
  end: Date,
  params: ScheduleParams = DEFAULT_SCHEDULE_PARAMS
): ForgettingCurvePoint[] {
  return forgettingCurveMarkers(reviews, end, params).map((m) => ({
    at: m.at,
    tDays: m.tDays,
    retentionPct: m.retentionPct,
    sdPct: m.sdPct,
    reviewIndex: m.timesReviewed,
  }))
}

/** One marker per planned session — same % the bar chart showed. */
export function forgettingCurveMarkers(
  reviews: ScheduleReview[],
  end: Date,
  params: ScheduleParams = DEFAULT_SCHEDULE_PARAMS
): ForgettingCurveMarker[] {
  if (reviews.length === 0) return []
  const t0 = reviews[0].at.getTime()
  return reviews.map((r) => ({
    tDays: (r.at.getTime() - t0) / 86_400_000,
    retentionPct: clamp(r.retentionPct, 0, 100),
    sdPct: r.sdPct,
    timesReviewed: r.index - 1, // bar #1 → 0×, bar #2 → 1×, …
    at: r.at,
  }))
}

export function suggestReviewCount(start: Date, end: Date, params: ScheduleParams): number {
  return buildSetSchedule(start, end, params).length
}

/**
 * Build study times with FSRS-6: review when R hits Rd; update S after each Good recall.
 * Short ROI horizons use same-day stability updates; longer ones use day-spaced intervals.
 */
export function buildSetSchedule(
  start: Date,
  end: Date,
  params: ScheduleParams,
  reviewCount?: number
): ScheduleReview[] {
  const from = startOfLocalDay(start)
  const to = startOfLocalDay(end)
  const intra = shouldUseIntraDayReviews(from, to, params)
  const times = packFsrsTimes(from, to, params, reviewCount, intra)
  return timesToReviews(times, params, intra)
}

export function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function endOfStudyDay(day: Date): Date {
  const d = startOfLocalDay(day)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), DAY_END_HOUR, 0, 0, 0)
}

function firstStudyTimeOnDay(day: Date, now: Date = new Date()): Date {
  const base = startOfLocalDay(day)
  const startSlot = new Date(base.getFullYear(), base.getMonth(), base.getDate(), DAY_START_HOUR, 0, 0, 0)
  if (localDateKey(day) !== localDateKey(now)) return startSlot
  const rounded = new Date(now)
  rounded.setMinutes(0, 0, 0)
  if (now.getMinutes() > 0 || now.getSeconds() > 0) rounded.setHours(rounded.getHours() + 1)
  if (rounded.getTime() < startSlot.getTime()) return startSlot
  if (rounded.getHours() > DAY_END_HOUR) return endOfStudyDay(day)
  return rounded
}

/**
 * Pack FSRS review times from first study → deadline.
 *
 * Scientific stop rule (FSRS desired retention):
 * - Schedule the next session only when R would fall to Rd (interval I(Rd,S)).
 * - After each session, if predicted R on the end date is already ≥ Rd, stop —
 *   further reviews are below the official ROI / confidence benchmark.
 * - Add a deadline session only when R(end) would otherwise slip below Rd.
 * - Never insert a session that would fire while R is still well above Rd
 *   (massed practice with no spacing benefit).
 */
function packFsrsTimes(
  from: Date,
  to: Date,
  params: ScheduleParams,
  reviewCount: number | undefined,
  intra: boolean
): Date[] {
  const windowStart = firstStudyTimeOnDay(from)
  const windowEnd = endOfStudyDay(to)
  if (windowEnd.getTime() <= windowStart.getTime()) return [windowEnd]

  const Rd = params.desiredRetention
  const maxN = reviewCount ?? 16
  const times: Date[] = [windowStart]
  let S = fsrsInitialStability()
  let cursor = windowStart

  // After first learn: no extra spaced reviews if end-date R already meets Rd,
  // but still add one retrieval on the end date when it is a later day.
  if (rAt(windowEnd, cursor, S) >= Rd && reviewCount == null) {
    if (localDateKey(cursor) !== localDateKey(windowEnd)) times.push(windowEnd)
    return times
  }

  while (times.length < maxN) {
    const longGap = Math.max(MIN_GAP_HOURS / 24, fsrsIntervalDays(S, Rd))
    const remainingDays = (windowEnd.getTime() - cursor.getTime()) / 86_400_000
    if (remainingDays <= MIN_GAP_HOURS / 24) break

    // Next review is due when R hits Rd — that is the only scientifically justified gap
    let stepDays = longGap
    let useShort = false

    if (longGap >= remainingDays - 0.02) {
      // Full Rd interval does not fit before the deadline
      break // Decide below whether a single deadline session is still needed
    }

    if (intra && longGap < 1) {
      useShort = true
      stepDays = longGap
    } else {
      stepDays = Math.max(1, Math.round(longGap))
    }

    let next = new Date(cursor.getTime() + stepDays * 86_400_000)
    if (useShort || stepDays < 1) {
      next = snapToStudyWindow(next)
    } else {
      const day = startOfLocalDay(next)
      next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 17, 0, 0, 0)
      if (next.getTime() <= cursor.getTime()) {
        next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1, 17, 0, 0, 0)
      }
    }

    if (next.getTime() >= windowEnd.getTime() - 60_000) break
    if (next.getTime() <= cursor.getTime()) break

    // Skip if we'd review while still above Rd (no spacing benefit)
    const elapsed = (next.getTime() - cursor.getTime()) / 86_400_000
    const RBefore = fsrsRetrievability(elapsed, S)
    if (RBefore > Rd + 0.02) break

    times.push(next)
    S =
      useShort || elapsed < 1
        ? fsrsSameDayStability(S, GRADE_GOOD)
        : fsrsNextStability(params.difficulty, S, RBefore, GRADE_GOOD)
    cursor = next

    // Confidence benchmark met for the end date — stop extra spaced reviews
    if (reviewCount == null && rAt(windowEnd, cursor, S) >= Rd) break
  }

  // One retrieval on the end date offsets forgetting since the last review
  // (testing effect). Skip if a session is already on that calendar day.
  if (
    localDateKey(times[times.length - 1]) !== localDateKey(windowEnd) &&
    (reviewCount == null || times.length < reviewCount)
  ) {
    times.push(windowEnd)
  }

  // Manual count: stretch/trim to N, but still avoid inventing sub-Rd gaps when possible
  return fitTimeCount(times, windowStart, windowEnd, reviewCount)
}

/** Predicted R at `when`, given last review at `lastAt` with stability `S`. */
function rAt(when: Date, lastAt: Date, S: number): number {
  const dt = (when.getTime() - lastAt.getTime()) / 86_400_000
  if (dt <= 0) return 1
  return fsrsRetrievability(dt, S)
}

function fitTimeCount(
  times: Date[],
  windowStart: Date,
  windowEnd: Date,
  reviewCount: number | undefined
): Date[] {
  if (reviewCount == null) return times
  const n = clamp(reviewCount, 1, 24)
  if (n === 1) return [windowEnd]
  const out: Date[] = []
  for (let i = 0; i < n; i++) {
    const t = windowStart.getTime() + ((windowEnd.getTime() - windowStart.getTime()) * i) / (n - 1)
    out.push(snapToStudyWindow(new Date(t)))
  }
  out[0] = windowStart
  out[out.length - 1] = windowEnd
  for (let i = 1; i < out.length; i++) {
    const minT = out[i - 1].getTime() + MIN_GAP_HOURS * 3_600_000
    if (out[i].getTime() < minT) out[i] = snapToStudyWindow(new Date(minT))
  }
  out[out.length - 1] = windowEnd
  return out
}

function snapToStudyWindow(at: Date): Date {
  const h = at.getHours() + at.getMinutes() / 60
  if (h < DAY_START_HOUR) {
    return new Date(at.getFullYear(), at.getMonth(), at.getDate(), DAY_START_HOUR, 0, 0, 0)
  }
  if (h > DAY_END_HOUR) {
    const next = addLocalDays(startOfLocalDay(at), 1)
    return new Date(next.getFullYear(), next.getMonth(), next.getDate(), DAY_START_HOUR, 0, 0, 0)
  }
  const minutes = at.getMinutes()
  const rounded = Math.round(minutes / 15) * 15
  const out = new Date(at)
  if (rounded === 60) out.setHours(out.getHours() + 1, 0, 0, 0)
  else out.setMinutes(rounded, 0, 0)
  if (out.getHours() > DAY_END_HOUR) {
    const next = addLocalDays(startOfLocalDay(out), 1)
    return new Date(next.getFullYear(), next.getMonth(), next.getDate(), DAY_START_HOUR, 0, 0, 0)
  }
  return out
}

function timesToReviews(
  times: Date[],
  params: ScheduleParams,
  intra: boolean
): ScheduleReview[] {
  const reviews: ScheduleReview[] = []
  let S = fsrsInitialStability()
  for (let i = 0; i < times.length; i++) {
    const at = times[i]
    const delta = i === 0 ? 0 : (at.getTime() - times[i - 1].getTime()) / 86_400_000
    const R = i === 0 ? 0 : fsrsRetrievability(delta, S)
    const retentionPct = i === 0 ? 0 : 100 * R
    // Update S after this successful session
    let SAfter: number
    if (i === 0) {
      SAfter = S // Already initial Good stability
    } else {
      const sameDay = localDateKey(times[i - 1]) === localDateKey(at)
      SAfter =
        sameDay || (intra && delta < 1)
          ? fsrsSameDayStability(S)
          : fsrsNextStability(params.difficulty, S, R)
    }
    reviews.push({
      index: i + 1,
      date: startOfLocalDay(at),
      at,
      deltaDays: delta,
      retentionPct: clamp(retentionPct, 0, 100),
      sdPct: retentionSd(retentionPct, i + 1, params.sdFloor),
      stability: SAfter,
    })
    S = SAfter
  }
  return reviews
}

function retentionSd(retentionPct: number, index: number, floor: number): number {
  const p = clamp(retentionPct / 100, 0, 1)
  // Approximate ±1 SE for a Bernoulli recall event, shrinks with more reviews
  const binomial = 100 * Math.sqrt(Math.max(p * (1 - p), 0.01) / Math.max(index, 1))
  return clamp(Math.max(floor, binomial + 6 / Math.sqrt(index)), floor, 22)
}

function addLocalDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

function clamp(n: number, min: number, max: number): number {
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

function trimNum(n: number): string {
  return String(Number(n.toFixed(4)))
}
