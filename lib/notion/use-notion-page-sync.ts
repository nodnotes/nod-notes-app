'use client'

// Connected frames always push NodNotes → Notion (debounced).
// Notion → NodNotes is detect-only; blue sync icon only after a newer remote edit is found.

import { useCallback, useEffect, useRef } from 'react'

const PUSH_DEBOUNCE_MS = 2000
const DETECT_INTERVAL_MS = 60_000

/** Outcome of one frame’s last_edited_time check. */
export type NotionDetectOutcome =
  | 'noop' // No pageId / skipped
  | 'busy' // Already detecting
  | 'baseline' // First sighting — stored baseline only
  | 'up_to_date' // Remote ≤ local
  | 'updates' // Remote newer → pending flag set
  | 'error' // Fetch / API failure

type UpdateChecker = () => Promise<NotionDetectOutcome>

/** Top-bar / global listeners that re-run page update detection. */
const updateCheckers = new Set<UpdateChecker>()

/** Register a frame’s detect fn so the sync icon can trigger a manual check. */
export function registerNotionUpdateChecker(fn: UpdateChecker): () => void {
  updateCheckers.add(fn) // One checker per synced frame
  return () => {
    updateCheckers.delete(fn) // Drop on unmount / pageId clear
  }
}

export type NotionUpdateCheckSummary = {
  checked: number // Frames that ran a real check
  updates: number // Frames with newer Notion content
  errors: number // Failed checks
  baselines: number // First-time baselines established
}

/** Ask every registered Notion page frame to re-check last_edited_time. */
export async function requestNotionUpdateCheck(): Promise<NotionUpdateCheckSummary> {
  const runners = [...updateCheckers]
  if (!runners.length) {
    return { checked: 0, updates: 0, errors: 0, baselines: 0 }
  }
  const outcomes = await Promise.all(runners.map((fn) => fn()))
  let checked = 0
  let updates = 0
  let errors = 0
  let baselines = 0
  for (const o of outcomes) {
    if (o === 'noop' || o === 'busy') continue
    checked += 1
    if (o === 'updates') updates += 1
    else if (o === 'error') errors += 1
    else if (o === 'baseline') baselines += 1
  }
  return { checked, updates, errors, baselines }
}

export function useNotionPageBodySync(opts: {
  pageId: string | null
  lastEditedTime: string | null | undefined
  /** Current frame HTML — seeded so TipTap remount/normalize does not push a wipe. */
  initialHtml?: string | null
  onNotionUpdatesAvailable: (payload: { lastEditedTime: string }) => void
  onLastEditedTime: (iso: string) => void
}) {
  const { pageId, lastEditedTime, initialHtml, onNotionUpdatesAvailable, onLastEditedTime } =
    opts

  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Treat loaded content as already synced so first editor normalize ≠ Notion wipe
  const lastPushedHtmlRef = useRef<string | null>(null)
  const seededPageIdRef = useRef<string | null>(null) // Which pageId lastPushedHtml was seeded for
  const detectingRef = useRef(false)
  const pushingRef = useRef(false)

  // Seed once per pageId (and upgrade empty → loaded). Never reset on every keystroke.
  useEffect(() => {
    if (!pageId) {
      seededPageIdRef.current = null
      lastPushedHtmlRef.current = null
      return
    }
    const html = initialHtml ?? null
    if (seededPageIdRef.current !== pageId) {
      seededPageIdRef.current = pageId
      lastPushedHtmlRef.current = html
      return
    }
    const seed = lastPushedHtmlRef.current
    const seedEmpty =
      seed == null || seed === '' || seed === '<p></p>' || seed === '<p><br></p>'
    if (seedEmpty && html && html !== seed) {
      lastPushedHtmlRef.current = html // Late-arriving import body
    }
  }, [pageId, initialHtml])

  const detectUpdates = useCallback(async (): Promise<NotionDetectOutcome> => {
    if (!pageId) return 'noop'
    if (detectingRef.current) return 'busy'
    detectingRef.current = true
    try {
      const res = await fetch(`/api/notion/page/${encodeURIComponent(pageId)}/content`)
      const json = (await res.json().catch(() => ({}))) as {
        lastEditedTime?: string | null
        error?: string
      }
      if (!res.ok) {
        console.warn('Notion page update check failed:', json.error)
        return 'error'
      }
      const remoteTime = json.lastEditedTime ?? null
      if (!remoteTime) return 'error'
      // First sighting: store baseline only — do not treat as “updates available”
      if (!lastEditedTime) {
        onLastEditedTime(remoteTime)
        return 'baseline'
      }
      if (remoteTime <= lastEditedTime) return 'up_to_date'
      onNotionUpdatesAvailable({ lastEditedTime: remoteTime }) // Newer on Notion → blue icon
      return 'updates'
    } catch (err) {
      console.warn('Notion page update check threw:', err)
      return 'error'
    } finally {
      detectingRef.current = false
    }
  }, [pageId, lastEditedTime, onNotionUpdatesAvailable, onLastEditedTime])

  const push = useCallback(
    async (htmlToPush: string) => {
      if (!pageId) return
      if (pushingRef.current) return
      if (htmlToPush === lastPushedHtmlRef.current) return
      pushingRef.current = true
      try {
        const res = await fetch(`/api/notion/page/${encodeURIComponent(pageId)}/content`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ html: htmlToPush }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          lastEditedTime?: string | null
          error?: string
        }
        if (!res.ok) {
          console.warn('Notion page push failed:', json.error)
          return
        }
        lastPushedHtmlRef.current = htmlToPush
        if (json.lastEditedTime) onLastEditedTime(json.lastEditedTime)
      } finally {
        pushingRef.current = false
      }
    },
    [pageId, onLastEditedTime]
  )

  const schedulePush = useCallback(
    (htmlToPush: string) => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
      pushTimerRef.current = setTimeout(() => {
        void push(htmlToPush)
      }, PUSH_DEBOUNCE_MS)
    },
    [push]
  )

  useEffect(() => {
    if (!pageId) return
    void detectUpdates() // Background — no toast
    const intervalId = setInterval(() => void detectUpdates(), DETECT_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [pageId, detectUpdates])

  // Manual check from the top-bar sync icon (detect only — apply goes through checkBoardNotionPages)
  useEffect(() => {
    if (!pageId) return
    return registerNotionUpdateChecker(() => detectUpdates())
  }, [pageId, detectUpdates])

  // After a manual apply, treat pulled HTML as already pushed so we don't echo it back to Notion
  useEffect(() => {
    if (!pageId) return
    const onApplied = (event: Event) => {
      const detail = (event as CustomEvent<{
        contentUpdates?: Array<{ pageId: string; content: string }>
      }>).detail
      const hit = detail?.contentUpdates?.find((u) => u.pageId === pageId)
      if (!hit) return
      lastPushedHtmlRef.current = hit.content
    }
    window.addEventListener('notion-pages-applied', onApplied)
    return () => window.removeEventListener('notion-pages-applied', onApplied)
  }, [pageId])

  useEffect(() => {
    return () => {
      if (pushTimerRef.current) clearTimeout(pushTimerRef.current)
    }
  }, [])

  return { schedulePush, detectUpdates }
}
