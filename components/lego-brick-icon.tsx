'use client'

import { cn } from '@/lib/utils' // Merge caller size classes with dark invert

/** Lock-frames glyph: outline by default; filled when frames are locked together. */
export function LegoBrickIcon({
  className,
  filled = false, // Locked state → solid frames + padlock
}: {
  className?: string
  filled?: boolean
}) {
  return (
    <img
      src={
        filled
          ? '/group%20frames%20icon%201.svg' // Solid art — readable when locked/selected
          : '/group%20frames%20icon%202.svg' // Outline art — default unlocked look
      }
      alt="" // Decorative — parent button / menu row owns the label
      aria-hidden
      className={cn('object-contain dark:invert', className)} // Invert so black/white faces survive dark chrome
    />
  )
}
