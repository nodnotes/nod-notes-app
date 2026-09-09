import { cn } from '@/lib/utils'
import type { CSSProperties } from 'react'

type NodNotesIconProps = {
  className?: string
  /** Play the load greeting: T hinges on the blob, then returns to rest */
  nod?: boolean
  /** Empty board: nod after load, then again every so often while you sit there */
  nodIdle?: boolean
  /** Keep nodding — AI chat loading (no entrance delay) */
  nodLoop?: boolean
}

/** Blob centroid in viewBox units — the T rotates around this point */
const DOT_CX = 43.26
const DOT_CY = 25.08

/** Hinge as viewBox % so rotation stays on the blob at any icon size */
const NOD_ORIGIN_STYLE = {
  ['--nn-nod-cx']: `${(DOT_CX / 54.62) * 100}%`,
  ['--nn-nod-cy']: `${(DOT_CY / 62.98) * 100}%`,
} as CSSProperties

/** Hand-drawn Nod Notes mark — from `Nod notes icon 3.svg` */
export function NodNotesIcon({ className, nod = false, nodIdle = false, nodLoop = false }: NodNotesIconProps) {
  const nodding = nod || nodIdle || nodLoop // Hinge CSS vars whenever the T animates
  const armClass = nodLoop
    ? 'nn-icon-nod-arm-loop'
    : nodIdle
      ? 'nn-icon-nod-arm-idle'
      : nod
        ? 'nn-icon-nod-arm'
        : undefined
  return (
    <svg
      viewBox="0 0 54.62 62.98"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('overflow-visible text-foreground', className)}
      style={nodding ? NOD_ORIGIN_STYLE : undefined}
      aria-hidden
    >
      {/* T / table-leg — left of the blob; CSS rotate hinges on the dot */}
      <g
        className={armClass}
      >
        <path
          fill="currentColor"
          d="M34.34,52.91l-.76,9.15c-.05.55-.52.96-1.06.92-3.23-.22-7.63-.41-10.46-1.34-7.13-2.35-11.55-8.44-11.57-15.95,0-.05,0-.11.01-.17.23-1.61,3.01-27.4,4.08-33.85.13-.76-.47-1.45-1.24-1.44l-12.33.23c-.59,0-1.06-.5-1.01-1.09L.7.92c.04-.52.48-.92,1-.92h21.74c1.84,0,3.26,1.6,3.04,3.43l-4.94,41.31c-.2,2.38,1.98,6.4,4.59,6.62l7.27.47c.56.04.98.52.94,1.08Z"
        />
      </g>
      {/* Blob stays planted — the hinge; idle empty-board also winks every other rest */}
      <path
        className={nodIdle ? 'nn-icon-nod-dot-idle' : undefined}
        fill="currentColor"
        d="M51.97,33.47c-6.93,7.29-18.63,1.62-17.56-8.27.46-4.25,4.79-8.21,8.99-8.63,8.84-.89,14.98,10.17,8.57,16.9Z"
      />
    </svg>
  )
}
