'use client'

// Toggles html[data-presenting] so board chrome CSS-hides. Escape exits.

import { useEffect, useSyncExternalStore } from 'react'
import { getPresenting, stopPresenting, subscribePresenting } from '@/lib/presentation-present'

/** Mounted in the board layout so the flag survives /board → /board/{id}. */
export function PresentingMode() {
  const presenting = useSyncExternalStore(subscribePresenting, getPresenting, () => false)

  useEffect(() => {
    if (presenting) document.documentElement.setAttribute('data-presenting', '') // CSS hides menus
    else document.documentElement.removeAttribute('data-presenting')
    return () => {
      document.documentElement.removeAttribute('data-presenting') // Don't leak the flag if this unmounts
    }
  }, [presenting])

  useEffect(() => {
    if (!presenting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      stopPresenting() // Only way out — no chrome is on screen
    }
    window.addEventListener('keydown', onKey, true) // Before the board's own Escape handlers
    return () => window.removeEventListener('keydown', onKey, true)
  }, [presenting])

  return null
}
