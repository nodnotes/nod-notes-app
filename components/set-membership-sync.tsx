'use client'

// Re-stamp frames that belong to a set after they mount, so the selected-frame glow survives remounts.

import { useEffect, useSyncExternalStore } from 'react'
import { frameIdsInSets, stampFramesInSets, subscribeSets } from '@/lib/sets-list'

function frameKey(): string {
  return frameIdsInSets().join('|') // Stable snapshot string
}

/** Mount once under the sidebar provider. Renders nothing. */
export function SetMembershipSync() {
  const key = useSyncExternalStore(subscribeSets, frameKey, () => '') // Changes when frame membership changes

  useEffect(() => {
    let timer = 0 // Debounce mount bursts
    let attempts = 0 // Bounded retries until the board / chat scroller exists
    let retry = 0 // setTimeout id for the attach retry
    const obs = new MutationObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(stampFramesInSets, 40) // After the new node is in the DOM
    })
    const attach = () => {
      obs.disconnect()
      const roots = document.querySelectorAll('.react-flow, [data-ai-transcript-scroll]')
      if (!roots.length && attempts < 8) {
        attempts += 1
        retry = window.setTimeout(attach, 200) // Board may mount after this effect
        return
      }
      roots.forEach((root) => obs.observe(root, { childList: true, subtree: true }))
      stampFramesInSets()
    }
    attach()
    return () => {
      window.clearTimeout(timer)
      window.clearTimeout(retry)
      obs.disconnect()
    }
  }, [key])

  return null
}
