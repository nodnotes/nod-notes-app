// Top-bar clip border — hairline around the bar slice that covers a non-board-color object.

import {
  parseFrameShape, // Silhouette id from data-tt-shape-fill / data-frame-shape
  frameShapeScanlineXRanges, // Circle chord / polygon spans at the cutoff Y
  type FrameShapeType, // Silhouette id
} from '@/lib/frame-shape'

const BOARD_LIGHT = { r: 249, g: 250, b: 251 } // Tailwind gray-50 — board + top bar
const BOARD_DARK = { r: 15, g: 15, b: 15 } // dark:bg-[#0f0f0f]
const COLOR_EPS2 = 36 // ~6/255 — treat near-board fills as the board (no border)
const MIN_SPAN_PX = 2 // Ignore sub-pixel slivers from sampling

type ClipRange = { left: number; right: number } // Local X on the top bar

/** Parse hex / rgb / rgba into channels; null when the string is not a color. */
function parseCssColor(raw: string): { r: number; g: number; b: number; a: number } | null {
  const s = raw.trim().toLowerCase() // Normalize for compares
  if (!s || s === 'none' || s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 } // Board shows through
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/) // #rgb / #rrggbb
  if (hex) {
    const h = hex[1] // Digits only
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h // Expand shorthand
    return {
      r: parseInt(full.slice(0, 2), 16), // Red
      g: parseInt(full.slice(2, 4), 16), // Green
      b: parseInt(full.slice(4, 6), 16), // Blue
      a: 1, // Hex is opaque
    }
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/) // rgb/rgba
  if (!rgb) return null // Unknown format — do not guess
  return {
    r: Number(rgb[1]), // Red
    g: Number(rgb[2]), // Green
    b: Number(rgb[3]), // Blue
    a: rgb[4] == null ? 1 : Number(rgb[4]), // Missing alpha = opaque
  }
}

/** True when the paint is transparent or matches the board (object would not read as a cutoff). */
function isBoardLikeColor(css: string, dark: boolean): boolean {
  const c = parseCssColor(css) // Channels or null
  if (!c || c.a < 0.04) return true // Empty / sheer fill — board color shows through
  const board = dark ? BOARD_DARK : BOARD_LIGHT // Theme board fill
  const dr = c.r - board.r // Red delta
  const dg = c.g - board.g // Green delta
  const db = c.b - board.b // Blue delta
  return dr * dr + dg * dg + db * db < COLOR_EPS2 // Near-board pastel counts as the board
}

/** Painted fill/stroke for an RF node — transparent when the board shows through. */
function paintedFillCss(nodeEl: HTMLElement): string {
  if (nodeEl.classList.contains('react-flow__node-freehand')) {
    const path = nodeEl.querySelector('path') // Stroke lives on the path
    const stroke = path?.getAttribute('stroke') || (path ? getComputedStyle(path).stroke : '') // Ink color
    return stroke && stroke !== 'none' ? stroke : '#111827' // Bare ink still counts as non-board
  }
  if (nodeEl.classList.contains('react-flow__node-shape')) {
    const painted = nodeEl.querySelector<SVGElement>('[fill]') // Shape SVG fill
    const fill = painted?.getAttribute('fill') || '' // Author fill
    return fill && fill !== 'none' ? fill : 'transparent' // Missing fill = board
  }
  const panel = (nodeEl.querySelector('[data-panel-container]') as HTMLElement | null) || nodeEl // Frame root
  const fillShell = panel.querySelector('[data-tt-shape-fill]') as HTMLElement | null // Inner fill / silhouette host
  const shapeId = fillShell?.getAttribute('data-tt-shape-fill') // Silhouette when set
  if (shapeId && fillShell) {
    const painted = fillShell.querySelector<SVGElement>('[fill]') // Backdrop SVG
    const fill = painted?.getAttribute('fill') || '' // Solid pastel on the silhouette
    if (fill && fill !== 'none' && fill !== 'transparent') return fill // Shaped frame fill
    return 'transparent' // Default silhouette — board shows through
  }
  if (fillShell) return getComputedStyle(fillShell).backgroundColor // Unshaped fill shell
  return getComputedStyle(panel).backgroundColor // Fallback: panel paint
}

/** Merge overlapping local-X spans so one object cluster becomes one bordered section. */
function mergeRanges(ranges: ClipRange[]): ClipRange[] {
  if (ranges.length === 0) return [] // Nothing to paint
  const sorted = ranges.slice().sort((a, b) => a.left - b.left) // Left-to-right
  const out: ClipRange[] = [{ ...sorted[0] }] // Seed with the first span
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i] // Next span
    const last = out[out.length - 1] // Open span
    if (cur.left <= last.right + 1) last.right = Math.max(last.right, cur.right) // Coalesce
    else out.push({ ...cur }) // New discrete section
  }
  return out
}

/** Local-X spans on `bar` where a non-board-color object crosses the bar’s bottom edge. */
export function measureTopBarClipRanges(bar: HTMLElement): ClipRange[] {
  const barRect = bar.getBoundingClientRect() // Screen box of the top bar
  if (barRect.width < 1 || barRect.height < 1) return [] // Hidden / not laid out
  const dark = document.documentElement.classList.contains('dark') // Theme for board-color compare
  const scanY = barRect.bottom // Cutoff line — objects crossing this are clipped
  const nodes = document.querySelectorAll<HTMLElement>('.react-flow__node') // All RF objects
  const ranges: ClipRange[] = [] // Accumulator in bar-local X
  for (const nodeEl of nodes) {
    if (nodeEl.classList.contains('react-flow__node-blockGroup')) continue // Legacy wrapper chrome
    if (nodeEl.classList.contains('react-flow__node-placeholder')) continue // Layout stub
    if (nodeEl.classList.contains('react-flow__node-frameShimmer')) continue // Load shell
    const nodeRect = nodeEl.getBoundingClientRect() // Screen AABB
    if (nodeRect.bottom <= scanY || nodeRect.top >= scanY) continue // Does not cross the cutoff
    if (nodeRect.right <= barRect.left || nodeRect.left >= barRect.right) continue // Off to the side
    if (isBoardLikeColor(paintedFillCss(nodeEl), dark)) continue // Transparent / board-colored — no seam
    const panel = (nodeEl.querySelector('[data-panel-container]') as HTMLElement | null) || nodeEl // Frame box
    const fillEl =
      (panel.querySelector('[data-tt-shape-fill]') as HTMLElement | null) || panel // Paint box
    const fillRect = fillEl.getBoundingClientRect() // Fill AABB (rotated = upright bounds)
    if (fillRect.height < 1 || fillRect.width < 1) continue // Nothing to clip
    if (fillRect.bottom <= scanY || fillRect.top >= scanY) continue // Fill itself misses the line
    const shapeAttr =
      fillEl.getAttribute('data-tt-shape-fill') || panel.getAttribute('data-frame-shape') // Silhouette id
    const shape: FrameShapeType | null = parseFrameShape(shapeAttr || null) // null = default rect
    const rotated = /rotate\(/.test(fillEl.style.transform || '') // Content-rotated fill shell
    const unitY = (scanY - fillRect.top) / fillRect.height // 0..1 down the AABB
    const unitRanges = rotated
      ? ([[0, 1]] as Array<[number, number]>) // Rotated: AABB is safe (chord math is in unrotated space)
      : frameShapeScanlineXRanges(shape, unitY) // Circle chord / polygon spans
    for (const [u0, u1] of unitRanges) {
      const left = fillRect.left + u0 * fillRect.width - barRect.left // Bar-local left
      const right = fillRect.left + u1 * fillRect.width - barRect.left // Bar-local right
      const clampedLeft = Math.max(0, left) // Stay inside the bar
      const clampedRight = Math.min(barRect.width, right) // Stay inside the bar
      if (clampedRight - clampedLeft >= MIN_SPAN_PX) {
        ranges.push({ left: clampedLeft, right: clampedRight }) // Keep this section
      }
    }
  }
  return mergeRanges(ranges) // One box per cluster
}

/** Write left/right/bottom hairlines for each clip section (no React state). */
export function paintTopBarClipBorder(paint: HTMLElement, ranges: ClipRange[]): void {
  const next = ranges
    .map((r) => `${Math.round(r.left)}:${Math.round(r.right)}`) // Stable key
    .join('|') // Compare to last paint
  if (paint.dataset.clipKey === next) return // Unchanged — skip DOM writes mid-pan
  paint.dataset.clipKey = next // Remember this set
  paint.replaceChildren() // Drop previous sections
  for (const r of ranges) {
    const el = document.createElement('div') // One bordered slice
    el.setAttribute('data-top-bar-clip-section', '') // Hook for tests / CSS
    el.className =
      'absolute top-0 bottom-0 box-border pointer-events-none border-l border-r border-b border-black/10 dark:border-white/10' // Section chrome
    el.style.left = `${r.left}px` // Start of the cutoff
    el.style.width = `${Math.max(0, r.right - r.left)}px` // Span of the cutoff
    paint.appendChild(el) // Sit under the icons (first child of the bar)
  }
}

/** Measure + paint; rAF-coalesced so pan/drag only pay one layout pass per frame. */
export function attachTopBarClipBorder(bar: HTMLElement, paint: HTMLElement): () => void {
  let raf = 0 // Coalesce token
  const tick = () => {
    raf = 0 // Allow the next schedule
    paintTopBarClipBorder(paint, measureTopBarClipRanges(bar)) // Live sections
  }
  const schedule = () => {
    if (raf) return // Already queued this frame
    raf = window.requestAnimationFrame(tick) // After the RF transform paints
  }
  tick() // First paint before the next pan
  const viewport = document.querySelector('.react-flow__viewport') as HTMLElement | null // Camera
  const rfRoot =
    (document.querySelector('.react-flow') as HTMLElement | null) ||
    (bar.closest('[data-board-root]') as HTMLElement | null) // Exists before nodes mount
  const viewObs = viewport
    ? new MutationObserver(schedule) // Pan / zoom writes viewport style
    : null
  if (viewport && viewObs) viewObs.observe(viewport, { attributes: true, attributeFilter: ['style'] })
  const nodeObs = rfRoot
    ? new MutationObserver(schedule) // Drag / add / remove / late RF mount
    : null
  if (rfRoot && nodeObs) {
    nodeObs.observe(rfRoot, {
      attributes: true, // Node transform + viewport
      attributeFilter: ['style', 'class'], // Position + type class
      childList: true, // Nodes added / removed
      subtree: true, // Nested fill updates
    })
  }
  window.addEventListener('resize', schedule) // Bar width changes
  const ro = new ResizeObserver(schedule) // Chat column / top-bar fit
  ro.observe(bar) // Live bar size
  return () => {
    if (raf) window.cancelAnimationFrame(raf) // Drop a pending tick
    viewObs?.disconnect() // Camera
    nodeObs?.disconnect() // Objects
    ro.disconnect() // Bar size
    window.removeEventListener('resize', schedule) // Viewport
  }
}
