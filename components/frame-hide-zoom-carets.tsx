// Outward double carets on a selected frame. Opacity is the inverse of the overlap hide
// (`1 - --tt-overlap-fade`) so they ease in as the fill hides and out as it returns.

/** One corner: anchor on the box, shift outside along the diagonal, rotate a right-pointing » to match. */
const CORNERS = [
  { id: 'tl', left: '0%', top: '0%', dx: -12, dy: -12, rot: -135 }, // Up-left
  { id: 'tr', left: '100%', top: '0%', dx: 12, dy: -12, rot: -45 }, // Up-right
  { id: 'bl', left: '0%', top: '100%', dx: -12, dy: 12, rot: 135 }, // Down-left
  { id: 'br', left: '100%', top: '100%', dx: 12, dy: 12, rot: 45 }, // Down-right
] as const

/** Same outside corner seats; glyph turned 180° so the tips face into the box. */
const INWARD_CORNERS = CORNERS.map((c) => ({
  ...c,
  id: `${c.id}-in`,
  rot: c.rot + 180, // Same outset as zoom-hidden; tips point in
}))

/** Light blue, same as the faded adjust ring (`#93c5fd`). */
export const HIDE_ZOOM_CARET_STROKE = '#93c5fd'

/** » points right; 135° turns the tips down and to the left (nav cue + bottom-left frame corner). */
export const HIDE_ZOOM_CARET_ROT_DOWN_LEFT = 135

/** Shared » pair — rotate so the tips face the given heading. */
export function HideZoomCaretSvg({ rot }: { rot: number }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      style={{ transform: `rotate(${rot}deg)` }} // Base paths point right; rot aims the tips
    >
      <path
        d="M1.2 3.2 L6 7 L1.2 10.8" // Inner caret
        stroke={HIDE_ZOOM_CARET_STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 3.2 L11 7 L6.2 10.8" // Outer caret — the pair reads as a double chevron
        stroke={HIDE_ZOOM_CARET_STROKE}
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** One » mark — screen size tracks `--tt-frame-ui-scale` so zoom does not grow it. */
function CornerCaret({
  corner,
  inward,
}: {
  corner: { id: string; left: string; top: string; dx: number; dy: number; rot: number }
  inward: boolean
}) {
  return (
    <div
      key={corner.id} // One mark per adjust-box corner
      aria-hidden // Affordance only
      {...(inward
        ? { 'data-tt-cover-inward-caret': true } // Opacity follows the fill — out as the selected frame hides
        : { 'data-tt-hide-zoom-caret': true })} // Opacity is 1 − fill so they ease in as the frame hides
      className="pointer-events-none absolute z-[21]" // Above the ring, outside its clip
      style={{
        left: corner.left, // Corner of the panel (the adjust box)
        top: corner.top,
        width: 14, // Local px; scale below keeps it constant on screen
        height: 14,
        marginLeft: `calc(${corner.dx}px * var(--tt-frame-ui-scale, 1.4))`, // Outside the adjust box, same as zoom-hidden
        marginTop: `calc(${corner.dy}px * var(--tt-frame-ui-scale, 1.4))`,
        transform: 'translate(-50%, -50%) scale(var(--tt-frame-ui-scale, 1.4))', // Center on that point
        transformOrigin: 'center center',
      }}
    >
      <HideZoomCaretSvg rot={corner.rot} />
    </div>
  )
}

/** Outward carets when this frame is zoom-hidden; inward when it covers another and is still showing. */
export function FrameHideZoomCarets({ inward = false }: { inward?: boolean }) {
  return (
    <>
      {CORNERS.map((corner) => (
        <CornerCaret key={corner.id} corner={corner} inward={false} />
      ))}
      {inward &&
        INWARD_CORNERS.map((corner) => (
          <CornerCaret key={corner.id} corner={corner} inward />
        ))}
    </>
  )
}
