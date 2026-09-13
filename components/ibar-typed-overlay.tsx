'use client'

// Cheap I-bar letters: BoardFlow must not re-render on every key while ChatPanelNode is still mounting.

import { useEffect, useState } from 'react'
import { placeFrameScale } from '@/lib/ibar-place-scale' // Match I-bar / place frame screen size

/** Visible typed buffer at the I-bar until TipTap has painted (tt-ibar-editor-ready). */
export function IBarTypedText({ zoom }: { zoom: number }) {
  const [text, setText] = useState('') // Local so BoardFlow stays idle during capture keys
  useEffect(() => {
    const onSeed = (event: Event) => {
      const next = (event as CustomEvent<{ text?: string }>).detail?.text // Full capture buffer
      if (typeof next === 'string') setText(next) // Paint letters immediately (no TipTap wait)
    }
    const onReady = () => setText('') // Frame owns the glyphs now — drop the overlay copy
    window.addEventListener('tt-ibar-typed-seed', onSeed)
    window.addEventListener('tt-ibar-editor-ready', onReady)
    window.addEventListener('tt-ibar-seed-applied', onReady) // Fallback if ready never fires
    return () => {
      window.removeEventListener('tt-ibar-typed-seed', onSeed)
      window.removeEventListener('tt-ibar-editor-ready', onReady)
      window.removeEventListener('tt-ibar-seed-applied', onReady)
    }
  }, [])
  if (!text) return null // Idle I-bar is just the caret
  const phone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches) // Board TipTap is 16px on touch
  const screenMul = zoom * placeFrameScale(zoom) // ≈1 unclamped — same as I-bar paneScale
  return (
    <span
      className="pointer-events-none whitespace-pre text-gray-900 dark:text-gray-100"
      style={{
        fontSize: `${(phone ? 16 : 14) * screenMul}px`, // Place-stable; not linear zoom shrink
        lineHeight: 1.25, // Same as board `.react-flow .prose p`
        fontFamily: 'inherit', // Match the board font
      }}
    >
      {text}
    </span>
  )
}
