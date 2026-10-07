// Shadow on the board top bar only on the horizontal span where a non-board color sits behind it.
// The bar matches the board (gray-50 / #0f0f0f), so a full-width shadow looks like a seam.

type Rgb = { r: number; g: number; b: number; a: number } // Parsed paint

const LIGHT_BOARD = { r: 249, g: 250, b: 251 } // Tailwind gray-50 — light board + bar
const DARK_BOARD = { r: 15, g: 15, b: 15 } // #0f0f0f — dark board + bar

function parseCssColor(input: string): Rgb | null {
  const s = input.trim().toLowerCase() // Computed styles arrive as rgb()/rgba() or hex
  if (s === 'transparent' || s === 'none') return { r: 0, g: 0, b: 0, a: 0 } // No paint
  const rgba = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/)
  if (rgba) {
    return {
      r: Number(rgba[1]), // Red
      g: Number(rgba[2]), // Green
      b: Number(rgba[3]), // Blue
      a: rgba[4] === undefined ? 1 : Number(rgba[4]), // Missing alpha means opaque
    }
  }
  const hex = s.match(/^#([0-9a-f]{3,8})$/)
  if (!hex) return null // Unknown keyword — caller treats that as no extra paint
  let h = hex[1]
  if (h.length === 3) h = h.split('').map((c) => c + c).join('') // #abc → #aabbcc
  if (h.length !== 6 && h.length !== 8) return null
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  }
}

/** True when this paint is clear or the live board surface (theme-specific). */
function isBoardSurface(color: string): boolean {
  const c = parseCssColor(color)
  if (!c || c.a < 0.08) return true // Clear — the board shows through
  const board = document.documentElement.classList.contains('dark') ? DARK_BOARD : LIGHT_BOARD
  return Math.abs(c.r - board.r) <= 2 && Math.abs(c.g - board.g) <= 2 && Math.abs(c.b - board.b) <= 2
}

function paintCounts(color: string): boolean {
  if (!color || color === 'none') return false // SVG "none" is not ink
  return !isBoardSurface(color) // Any other opaque paint is a non-board color
}

function rectsOverlap(a: DOMRect, b: DOMRect): boolean {
  return a.width > 0 && a.height > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

const SHADOW_MAX = 8 // Fade stays on the object and stops at this depth
const SHADOW_JOIN = 16 // Screen px; letter-sized gaps share one shadow so close strokes don't skip

type Span = { left: number; right: number; depth: number; glyph?: boolean } // glyph spans are already the stroke, not the letter box

function addSpan(spans: Span[], left: number, right: number, depth: number, glyph = false) {
  const d = Math.min(SHADOW_MAX, depth) // Stop at the object's bottom
  if (right - left < 1 || d < 1) return // No visible overlap
  spans.push({ left, right, depth: d, glyph })
}

/** Where this box is cut by the bar's bottom edge — no wider, and no lower, than the box. */
function addBoxSpan(spans: Span[], box: DOMRect, bar: DOMRect) {
  if (!(box.top < bar.bottom && box.bottom > bar.bottom)) return // Not sliced by the clip line
  addSpan(
    spans,
    Math.max(box.left, bar.left),
    Math.min(box.right, bar.right),
    box.bottom - bar.bottom,
  )
}

/** Group nearby clip-line hits so one stroke stays one shadow and gaps stay empty. */
function clusterXs(xs: number[], gap: number, pad: number, depth: number, spans: Span[]) {
  if (xs.length === 0) return
  const sorted = xs.slice().sort((a, b) => a - b)
  let left = sorted[0]
  let right = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    const x = sorted[i]
    if (x - right <= gap) right = x // Same crossing
    else {
      addSpan(spans, left - pad, right + pad, depth)
      left = right = x
    }
  }
  addSpan(spans, left - pad, right + pad, depth)
}

type StrokeRun = { d: string; width: number } // Path in bar-local px; width is the on-screen stroke

/** Screen thickness of this stroke — user units × the viewport scale, same as the painted ink. */
function screenThickness(geom: SVGGeometryElement, ctm: DOMMatrix): number {
  const specified = parseFloat(getComputedStyle(geom).strokeWidth) || 2 // Local px from the thread rule
  const scale = Math.hypot(ctm.a, ctm.b) || 1 // Board zoom lives in the CTM
  return Math.max(1, specified * scale) // Do not pad past the ink
}

/**
 * Stroke shadow follows the ink in the fade band.
 * A rectangle at the crossing sits beside a diagonal and spills onto empty board.
 */
function addStrokeRun(strokes: StrokeRun[], geom: SVGGeometryElement, bar: DOMRect, ctm: DOMMatrix, len: number, thickness: number) {
  const y0 = bar.bottom // Top of the fade, on the bar's bottom edge
  const y1 = bar.bottom + SHADOW_MAX // Fade stops at the end of this band, still on the stroke
  const steps = Math.min(128, Math.max(8, Math.ceil(len / 4))) // Catch a thin diagonal
  const parts: string[] = []
  let drawing = false // True while the current subpath is inside the band
  let prev: DOMPoint | null = null
  const local = (x: number, y: number) => `${(x - bar.left).toFixed(1)} ${(y - bar.bottom).toFixed(1)}` // Bar-local px
  const move = (x: number, y: number) => {
    parts.push(`M ${local(x, y)}`) // Start on the ink
    drawing = true
  }
  const line = (x: number, y: number) => {
    if (!drawing) move(x, y) // Entering the band
    else parts.push(`L ${local(x, y)}`) // Stay on the stroke
  }
  for (let i = 0; i <= steps; i++) {
    const p = geom.getPointAtLength((len * i) / steps)
    const pt = new DOMPoint(p.x, p.y).matrixTransform(ctm) // Local path point → screen
    if (prev) {
      const crossesTop = (prev.y < y0 && pt.y >= y0) || (pt.y < y0 && prev.y >= y0)
      if (crossesTop && pt.y !== prev.y) {
        const t = (y0 - prev.y) / (pt.y - prev.y) // Hit the clip line
        move(prev.x + t * (pt.x - prev.x), y0)
      }
      if (pt.y >= y0 && pt.y <= y1 && pt.x >= bar.left && pt.x <= bar.right) line(pt.x, pt.y) // Ink inside the fade
      else if (drawing && prev.y <= y1 && pt.y > y1 && pt.y !== prev.y) {
        const t = (y1 - prev.y) / (pt.y - prev.y) // Leave the fade on the stroke, not past it
        line(prev.x + t * (pt.x - prev.x), y1)
        drawing = false
      } else if (pt.y > y1 || pt.y < y0) drawing = false // Hidden in the bar, or already below the fade
    }
    prev = pt
  }
  if (parts.length > 0) strokes.push({ d: parts.join(' '), width: thickness }) // As wide as the painted stroke
}

/**
 * Shadow only where ink crosses the bar's bottom edge.
 * A curve hidden higher in the bar must not cast a rectangle across empty board.
 */
function addGeometrySpan(spans: Span[], strokes: StrokeRun[], geom: SVGGeometryElement, bar: DOMRect) {
  const cs = getComputedStyle(geom)
  const strokeOn = paintCounts(cs.stroke)
  const fillOn = paintCounts(cs.fill)
  if (!strokeOn && !fillOn) return // Hit-area paths are invisible
  const ctm = geom.getScreenCTM()
  if (!ctm) return
  let len = 0
  try {
    len = geom.getTotalLength() // Throws if the path isn't rendered
  } catch {
    return
  }
  if (!Number.isFinite(len) || len <= 0) return
  const thickness = screenThickness(geom, ctm) // Match the painted stroke
  if (strokeOn && !fillOn) {
    addStrokeRun(strokes, geom, bar, ctm, len, thickness) // Follow the thread, don't box it
    return
  }
  const yEdge = bar.bottom // Clip line the shadow hangs from
  const steps = Math.min(96, Math.max(8, Math.ceil(len / 6))) // Dense enough to catch a thin crossing
  const xs: number[] = []
  let prev: DOMPoint | null = null
  for (let i = 0; i <= steps; i++) {
    const p = geom.getPointAtLength((len * i) / steps)
    const pt = new DOMPoint(p.x, p.y).matrixTransform(ctm) // Local path point → screen
    if (prev) {
      const dy = pt.y - prev.y
      if (dy !== 0) {
        const t = (yEdge - prev.y) / dy // 0–1 when this segment cuts the clip line
        if (t >= 0 && t <= 1) {
          const x = prev.x + t * (pt.x - prev.x)
          if (x >= bar.left && x <= bar.right) xs.push(x)
        }
      } else if (Math.abs(prev.y - yEdge) <= thickness) {
        // Fill runs along the clip line
        if (prev.x >= bar.left && prev.x <= bar.right) xs.push(prev.x)
        if (pt.x >= bar.left && pt.x <= bar.right) xs.push(pt.x)
      }
    }
    prev = pt
  }
  const box = geom.getBoundingClientRect()
  const depth = Math.min(SHADOW_MAX, box.bottom - bar.bottom) // Stop at the shape's bottom
  clusterXs(xs, bar.width, 0, depth, spans) // Chord of the fill, no pad past its edges
}

function nodeHidden(node: HTMLElement): boolean {
  if (node.style.visibility === 'hidden' || node.style.display === 'none') return true // Filter-hidden frames
  return node.getAttribute('aria-hidden') === 'true'
}

function blockHasText(el: Element): boolean {
  return (el.textContent || '').replace(/\u200b/g, '').trim().length > 0 // Ignore empty caret lines
}

let inkCtx: CanvasRenderingContext2D | null = null // Reused to read font ink, not the line box

/** Screen box of this mark's ink on one line. The line box starts above the letters, so it shadows too soon. */
function markInkBox(line: DOMRect, el: Element, text: string): DOMRect {
  const cs = getComputedStyle(el)
  const fontSize = parseFloat(cs.fontSize) || line.height // Specified size, before board zoom
  let lineHeight = parseFloat(cs.lineHeight)
  if (!Number.isFinite(lineHeight)) lineHeight = fontSize
  const scale = lineHeight > 0 ? line.height / lineHeight : 1 // getClientRects are zoomed; font metrics are not
  if (!inkCtx) inkCtx = document.createElement('canvas').getContext('2d')
  let ascent = fontSize * 0.8
  let inkAbove = ascent
  let inkBelow = fontSize * 0.2
  if (inkCtx) {
    inkCtx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}` // This mark's font, not the block
    const metrics = inkCtx.measureText(text)
    if (metrics.fontBoundingBoxAscent) ascent = metrics.fontBoundingBoxAscent
    if (metrics.actualBoundingBoxAscent) inkAbove = metrics.actualBoundingBoxAscent // Top of the letters
    if (metrics.actualBoundingBoxDescent) inkBelow = metrics.actualBoundingBoxDescent // Descenders
  }
  const half = Math.max(0, (lineHeight - fontSize) / 2) * scale // Leading above the em box — not ink
  const baseline = line.top + half + ascent * scale
  const top = baseline - inkAbove * scale
  const bottom = baseline + inkBelow * scale
  return new DOMRect(line.left, top, line.width, Math.max(0, bottom - top))
}

/** Characters of this text node that sit on this line. */
function textOnLine(node: Text, text: string, line: DOMRect): string {
  const range = document.createRange()
  let out = ''
  const limit = Math.min(text.length, 400) // A mark under the bar, not a whole document
  for (let i = 0; i < limit; i++) {
    const ch = text[i]
    if (ch === '\n' || ch === '\u200b') continue
    range.setStart(node, i)
    range.setEnd(node, i + 1)
    const rect = range.getClientRects()[0]
    if (!rect || rect.width === 0) continue
    if (rect.top < line.bottom && rect.bottom > line.top && Math.abs(rect.top - line.top) < line.height * 0.6) out += ch
  }
  return out
}

/** Shadow only the glyph pixels on the board, not the rest of the letter still under the bar. */
function addGlyphStrokeSpans(spans: Span[], node: Text, parent: Element, text: string, line: DOMRect, bar: DOMRect) {
  const slice = textOnLine(node, text, line)
  if (!slice) return
  const cs = getComputedStyle(parent)
  const fontSize = parseFloat(cs.fontSize) || 16
  let lineHeight = parseFloat(cs.lineHeight)
  if (!Number.isFinite(lineHeight)) lineHeight = fontSize
  const scale = lineHeight > 0 ? line.height / lineHeight : 1 // Screen px per font px
  const width = Math.max(1, Math.ceil(line.width))
  const height = Math.max(1, Math.ceil(line.height))
  if (width > 4096 || height > 2048) return // Skip a runaway raster
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fontSize * scale}px ${cs.fontFamily}` // Drawn at screen size
  ctx.letterSpacing = cs.letterSpacing
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'alphabetic'
  const metrics = ctx.measureText(slice)
  const half = Math.max(0, (lineHeight - fontSize) / 2) * scale
  const ascent = metrics.fontBoundingBoxAscent || fontSize * scale * 0.8
  const inkAbove = metrics.actualBoundingBoxAscent || ascent
  const inkBelow = metrics.actualBoundingBoxDescent || fontSize * scale * 0.2
  const inkTop = line.top + half + ascent - inkAbove // Screen top of these strokes
  const inkBottom = line.top + half + ascent + inkBelow
  if (!(inkTop < bar.bottom && inkBottom > bar.bottom)) return // The strokes have not reached the bar yet
  ctx.fillText(slice, 0, half + ascent) // Same baseline as the ink top above
  const y0 = Math.max(0, Math.floor(bar.bottom - line.top)) // First row on the board
  const y1 = Math.min(height, Math.ceil(bar.bottom + SHADOW_MAX - line.top)) // Don't read ink still under the bar
  if (y1 <= y0) return
  const pixels = ctx.getImageData(0, y0, width, y1 - y0)
  const rows = y1 - y0
  let runStart = -1
  let runDepth = 0
  const flush = (end: number) => {
    if (runStart < 0) return
    addSpan(spans, line.left + runStart, line.left + end, runDepth, true) // This stroke only
    runStart = -1
    runDepth = 0
  }
  for (let x = 0; x < width; x++) {
    let depth = 0
    for (let y = 0; y < rows; y++) {
      if (pixels.data[(y * width + x) * 4 + 3] > 24) depth = y + 1 // Ink in this column on the board, including a soft edge
    }
    if (depth > 0 && runStart >= 0 && Math.abs(depth - runDepth) <= 1) {
      runDepth = Math.min(runDepth, depth) // Stay inside the shorter part of this stroke
      continue
    }
    if (runStart >= 0) flush(x)
    if (depth > 0) {
      runStart = x
      runDepth = depth
    }
  }
  flush(width)
}

/** One shadow per text mark's visible strokes, not the block and not the hidden part of the letter. */
function lineSpans(block: Element, bar: DOMRect, spans: Span[]) {
  if (!blockHasText(block)) return
  const range = document.createRange()
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT) // Each mark is its own text node
  let node = walker.nextNode()
  while (node instanceof Text) {
    const text = node.textContent || ''
    const visible = text.replace(/\u200b/g, '').trim()
    const parent = node.parentElement
    if (parent && visible.length > 0 && paintCounts(getComputedStyle(parent).color)) {
      range.setStart(node, 0)
      range.setEnd(node, text.length)
      for (const line of range.getClientRects()) {
        if (line.width < 0.5 || line.height < 0.5) continue
        addGlyphStrokeSpans(spans, node, parent, text, line, bar)
      }
    }
    node = walker.nextNode()
  }
}

function proseSpans(node: HTMLElement, bar: DOMRect, spans: Span[]) {
  const prose = node.querySelector('.ProseMirror') as HTMLElement | null
  if (!prose || !rectsOverlap(prose.getBoundingClientRect(), bar)) return // Text box misses the bar
  const blocks = prose.querySelectorAll('p, h1, h2, h3, h4, li, pre, td, th')
  if (blocks.length > 24) {
    proseSampleSpans(prose, bar, spans) // Big tables: sample the strip, don't measure every cell
    return
  }
  for (const block of blocks) lineSpans(block, bar, spans)
}

/** Points along the bar's overlap — sample on the board, below the bar, where paint can actually show. */
function proseSampleSpans(prose: HTMLElement, bar: DOMRect, spans: Span[]) {
  const box = prose.getBoundingClientRect()
  const left = Math.max(box.left, bar.left)
  const right = Math.min(box.right, bar.right)
  const y = bar.bottom + 1 // On the board; ink hidden under the bar does not count
  const span = right - left
  if (span <= 0) return
  const steps = Math.min(12, Math.max(1, Math.ceil(span / 48)))
  const step = span / steps
  const hits: number[] = []
  for (let i = 0; i < steps; i++) {
    const x = left + (i + 0.5) * step
    const stack = document.elementsFromPoint(x, y) // Includes the opaque bar above the text
    for (const el of stack) {
      if (!prose.contains(el)) continue
      if (blockHasText(el)) hits.push(x) // This sample is ink
      break
    }
  }
  let start = hits[0]
  let prev = hits[0]
  for (let i = 1; i <= hits.length; i++) {
    const x = hits[i]
    if (x !== undefined && x - prev <= step * 1.5) {
      prev = x // Still the same run of text
      continue
    }
    if (start !== undefined && prev !== undefined) addSpan(spans, start - step / 2, prev + step / 2, SHADOW_MAX)
    start = x
    prev = x
  }
}

function ringSpans(node: HTMLElement, bar: DOMRect, spans: Span[]) {
  const ring = node.querySelector('[data-tt-adjust-ring], [data-tt-connection-box]') as HTMLElement | null
  if (!ring) return // No blue stroke on this frame
  const r = ring.getBoundingClientRect()
  const band = 4 // Inset stroke sits on the perimeter, not the interior
  const y0 = bar.bottom
  if (r.top < y0 && r.top + band > y0) {
    addSpan(spans, Math.max(r.left, bar.left), Math.min(r.right, bar.right), r.top + band - y0) // Top stroke only, not the frame interior
  }
  if (r.bottom - band < y0 && r.bottom > y0) {
    addSpan(spans, Math.max(r.left, bar.left), Math.min(r.right, bar.right), r.bottom - y0) // Bottom stroke cut by the bar
  }
  const sideDepth = Math.min(SHADOW_MAX, r.bottom - y0) // Side stroke stops at the ring
  if (sideDepth > 0 && r.top < y0 + SHADOW_MAX && r.bottom > y0) {
    if (r.left < bar.right && r.left + band > bar.left) addSpan(spans, r.left, Math.min(r.left + band, bar.right), sideDepth) // Left stroke
    if (r.right > bar.left && r.right - band < bar.right) addSpan(spans, Math.max(r.right - band, bar.left), r.right, sideDepth) // Right stroke
  }
}

function mediaSpans(node: HTMLElement, bar: DOMRect, spans: Span[]) {
  const media = node.querySelectorAll('img, canvas, video')
  for (const el of media) addBoxSpan(spans, el.getBoundingClientRect(), bar) // Photo / ink bitmap
}

function frameFillSpans(node: HTMLElement, bar: DOMRect, spans: Span[]) {
  const fill = node.querySelector('[data-tt-frame-fill]') as HTMLElement | null
  if (!fill) return
  if (!paintCounts(getComputedStyle(fill).backgroundColor)) return // Clear frame — board shows through
  addBoxSpan(spans, fill.getBoundingClientRect(), bar) // Sticky-note fill, only where it crosses the bar
}

function svgSpans(node: HTMLElement, bar: DOMRect, spans: Span[], strokes: StrokeRun[]) {
  const geoms = node.querySelectorAll('path, ellipse, rect, polygon, circle, line, polyline')
  for (const el of geoms) {
    if (el instanceof SVGGeometryElement) addGeometrySpan(spans, strokes, el, bar) // Drawing / shape
  }
}

function nodeSpans(node: HTMLElement, bar: DOMRect, spans: Span[], strokes: StrokeRun[]) {
  if (nodeHidden(node)) return
  if (!rectsOverlap(node.getBoundingClientRect(), bar)) return // Frame is not behind the bar
  ringSpans(node, bar, spans) // Blue adjust ring
  frameFillSpans(node, bar, spans)
  mediaSpans(node, bar, spans)
  if (node.classList.contains('react-flow__node-chatPanel')) proseSpans(node, bar, spans) // Each text line
  else svgSpans(node, bar, spans, strokes) // Freehand / shape nodes
}

function edgeSpans(flow: Element, bar: DOMRect, spans: Span[], strokes: StrokeRun[]) {
  const paths = flow.querySelectorAll('.react-flow__edge-path')
  for (const path of paths) {
    if (!(path instanceof SVGGeometryElement)) continue
    if (!rectsOverlap(path.getBoundingClientRect(), bar)) continue // Cheap reject
    addGeometrySpan(spans, strokes, path, bar) // The stroke itself, not a box beside it
  }
}

/** Ink bottom at this point. The line box above the letters does not count. */
function textBottomAt(block: Element, x: number, y: number): number | null {
  const range = document.createRange()
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let bottom: number | null = null
  let node = walker.nextNode()
  while (node) {
    const text = node.textContent || ''
    const visible = text.replace(/\u200b/g, '').trim()
    const parent = node.parentElement
    if (parent && visible.length > 0 && paintCounts(getComputedStyle(parent).color)) {
      range.setStart(node, 0)
      range.setEnd(node, text.length)
      const lines = [...range.getClientRects()]
      lines.forEach((line, index) => {
        const ink = markInkBox(line, parent, index === 0 ? visible : 'x')
        if (x >= ink.left && x <= ink.right && y >= ink.top && y <= ink.bottom) bottom = Math.max(bottom ?? 0, ink.bottom)
      })
    }
    node = walker.nextNode()
  }
  return bottom
}

/**
 * Bottom of non-board paint actually visible on the board at this point.
 * A box that only overlaps the bar, with nothing showing below it, returns null.
 */
function visiblePaintBottom(x: number, y: number, flow: Element): number | null {
  const stack = document.elementsFromPoint(x, y) // Topmost element first
  for (const el of stack) {
    if (!(el instanceof Element)) continue
    if (el.closest('[data-edit-top-bar]')) continue // The bar and its shadow strips
    if (!flow.contains(el)) continue // Chrome beside the board
    if (
      el.classList.contains('react-flow__pane') ||
      el.classList.contains('react-flow__renderer') ||
      el.classList.contains('react-flow__background') ||
      el.classList.contains('react-flow__viewport') ||
      el.classList.contains('react-flow__container')
    ) return null // Board surface — nothing in front of it is paint
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue
    if (el.classList.contains('react-flow__canvas')) continue // Helper lines, not board content
    if (el instanceof SVGGeometryElement) {
      if (paintCounts(cs.fill) || paintCounts(cs.stroke)) return el.getBoundingClientRect().bottom
      continue
    }
    if (!(el instanceof HTMLElement)) continue
    if (paintCounts(cs.backgroundColor)) return el.getBoundingClientRect().bottom // Fill showing here
    if (el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS') return el.getBoundingClientRect().bottom
    if (el.matches('p, h1, h2, h3, h4, li, pre, td, th')) {
      const bottom = textBottomAt(el, x, y) // This line's glyphs, not the empty rest of the frame
      if (bottom !== null) return bottom
    }
  }
  return null
}

/** Drop parts of a span where the board below the bar is empty. Glyph spans are already the stroke. */
function clipSpansToVisible(spans: Span[], bar: DOMRect, flow: Element): Span[] {
  const glyphs = spans.filter((span) => span.glyph)
  const rest = spans.filter((span) => !span.glyph)
  return glyphs.concat(clipBoxSpans(rest, bar, flow))
}

function clipBoxSpans(spans: Span[], bar: DOMRect, flow: Element): Span[] {
  const y = bar.bottom + 1 // Just onto the board
  const step = 6
  const out: Span[] = []
  for (const span of spans) {
    let runLeft: number | null = null
    let runRight = 0
    let runBottom = bar.bottom
    const flush = () => {
      if (runLeft === null) return
      addSpan(out, runLeft, runRight, runBottom - bar.bottom) // Only the showing stretch
      runLeft = null
      runBottom = bar.bottom
    }
    for (let x = span.left; x <= span.right; x += step) {
      const at = Math.min(x, span.right)
      const bottom = visiblePaintBottom(at, y, flow)
      if (bottom === null || bottom <= bar.bottom) {
        flush() // Empty board here
        continue
      }
      if (runLeft === null) runLeft = at
      runRight = Math.min(span.right, at + step)
      runBottom = Math.max(runBottom, bottom)
    }
    flush()
  }
  return out
}

/** A thread shadow only where that stroke is the paint showing on the board. */
function clipStrokesToVisible(strokes: StrokeRun[], bar: DOMRect, flow: Element): StrokeRun[] {
  const kept: StrokeRun[] = []
  for (const stroke of strokes) {
    const start = stroke.d.match(/M\s*(-?[\d.]+)\s+(-?[\d.]+)/) // First point of the run, bar-local
    if (!start) continue
    const x = bar.left + Number(start[1])
    const y = bar.bottom + Math.max(1, Number(start[2])) // On the stroke, below the bar
    const stack = document.elementsFromPoint(x, y)
    const showing = stack.some((el) => {
      if (!(el instanceof SVGGeometryElement) || !flow.contains(el)) return false
      const cs = getComputedStyle(el)
      return paintCounts(cs.stroke) || paintCounts(cs.fill) // The thread ink, not empty board
    })
    if (showing) kept.push(stroke)
  }
  return kept
}

/** Join spans that touch, and glyph strokes that sit close enough to read as one shadow. */
function mergeSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return []
  const sorted = spans.slice().sort((a, b) => a.left - b.left)
  const merged: Span[] = []
  let current = { ...sorted[0] }
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]
    const join = current.glyph && next.glyph ? SHADOW_JOIN : 0 // Letters bridge a small gap; separate frames do not
    if (next.left <= current.right + join) {
      current.right = Math.max(current.right, next.right) // Close the skip between these strokes
      current.depth = Math.max(current.depth, next.depth)
      current.glyph = current.glyph && next.glyph
    }
    else {
      merged.push(current)
      current = { ...next }
    }
  }
  merged.push(current)
  return merged
}

/** Map column that contains both this bar and the board (the bar is wrapped, not a direct sibling). */
function mapColumn(bar: HTMLElement): HTMLElement | null {
  let el: HTMLElement | null = bar.parentElement
  while (el) {
    if (el.querySelector('[data-board-root]')) return el // First ancestor that also holds the canvas
    el = el.parentElement
  }
  return null
}

function flowForBar(bar: HTMLElement): Element | null {
  const column = mapColumn(bar)
  return column?.querySelector('[data-board-root] .react-flow') ?? null // Host board, not a nested preview
}

export type ShadowStrip =
  | { kind: 'box'; left: number; width: number; height: number } // Axis-aligned ink (a text line, a fill)
  | { kind: 'stroke'; d: string; width: number } // Thread / drawing, only the stroke pixels

/** Screen spans → widths inside the bar, plus stroke runs that follow the ink. */
function toStrips(barRect: DOMRect, spans: Span[], strokes: StrokeRun[]): ShadowStrip[] {
  const strips: ShadowStrip[] = []
  for (const span of spans) {
    const left = Math.max(0, span.left - barRect.left) // Clamp to the bar
    const right = Math.min(barRect.width, span.right - barRect.left)
    const width = right - left
    if (width >= 1) strips.push({ kind: 'box', left, width, height: span.depth })
  }
  for (const stroke of strokes) strips.push({ kind: 'stroke', d: stroke.d, width: stroke.width }) // Already bar-local
  return strips
}

/** Overlap runs behind the bar right now. */
export function syncTopBarContentShadow(bar: HTMLElement): ShadowStrip[] {
  const barRect = bar.getBoundingClientRect()
  const flow = flowForBar(bar)
  const spans: Span[] = []
  const strokes: StrokeRun[] = []
  if (flow && barRect.width > 0 && barRect.height > 0) {
    const nodes = flow.querySelectorAll('.react-flow__node')
    for (const node of nodes) {
      if (node instanceof HTMLElement) nodeSpans(node, barRect, spans, strokes)
    }
    edgeSpans(flow, barRect, spans, strokes)
  }
  const visible = flow ? clipSpansToVisible(spans, barRect, flow) : []
  const visibleStrokes = flow ? clipStrokesToVisible(strokes, barRect, flow) : []
  return toStrips(barRect, mergeSpans(visible), visibleStrokes)
}

/** Keep overlap strips in sync while the camera, frames, or theme move. */
export function watchTopBarContentShadow(
  bar: HTMLElement | null,
  onStrips: (strips: ShadowStrip[]) => void, // React paints these inside the bar so the falloff is not covered
): () => void {
  if (!bar) {
    onStrips([]) // No bar — no shadow
    return () => {}
  }
  let raf = 0
  const schedule = () => {
    if (raf) return // One read per frame
    raf = requestAnimationFrame(() => {
      raf = 0
      onStrips(syncTopBarContentShadow(bar)) // Publish the overlap runs
    })
  }
  const flowObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target
      if (!(target instanceof Element)) continue
      // Camera, frame box, or thread — skip TipTap edits that don't move paint
      if (
        target.classList.contains('react-flow__viewport') ||
        target.classList.contains('react-flow__node') ||
        target.classList.contains('react-flow__nodes') ||
        target.classList.contains('react-flow__edges') ||
        target.classList.contains('react-flow__edge') ||
        target.classList.contains('react-flow__edge-path') ||
        target.closest('.react-flow__edge') ||
        target.closest('[data-tt-frame-fill]') || // Fill color changed behind the bar
        target.closest('[data-tt-adjust-ring]')
      ) {
        schedule()
        return
      }
    }
  })
  const themeObserver = new MutationObserver(schedule) // Light/dark changes which color is "board"
  const resizeObserver = new ResizeObserver(schedule) // Bar width changes the overlap
  let watching: Element | null = null
  const onInput = () => schedule() // First glyphs in a frame under the bar
  const attachFlow = () => {
    const flow = flowForBar(bar)
    if (flow === watching) return // Already listening to this canvas
    watching?.removeEventListener('input', onInput, true)
    watching = flow
    flowObserver.disconnect()
    if (!flow) return
    flow.addEventListener('input', onInput, true)
    flowObserver.observe(flow, {
      subtree: true,
      childList: true, // Frames added / removed
      attributes: true,
      attributeFilter: ['style', 'class', 'd', 'transform'], // Pan, drag, thread paths, selection
    })
  }
  const column = mapColumn(bar)
  const rootObserver = new MutationObserver(() => {
    attachFlow() // Canvas may mount after the bar
    schedule()
  })
  const columnObserver = new MutationObserver(() => {
    const root = column?.querySelector('[data-board-root]')
    if (!root) return
    rootObserver.observe(root, { childList: true }) // Direct child only — not every frame edit
    columnObserver.disconnect()
    attachFlow()
    schedule()
  })
  attachFlow()
  const boardRoot = column?.querySelector('[data-board-root]')
  if (boardRoot) rootObserver.observe(boardRoot, { childList: true })
  else if (column) columnObserver.observe(column, { childList: true }) // Wait until the map mounts
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  resizeObserver.observe(bar)
  window.addEventListener('resize', schedule)
  schedule()
  return () => {
    if (raf) cancelAnimationFrame(raf)
    onStrips([]) // Clear strips when the bar unmounts
    watching?.removeEventListener('input', onInput, true)
    flowObserver.disconnect()
    themeObserver.disconnect()
    rootObserver.disconnect()
    columnObserver.disconnect()
    resizeObserver.disconnect()
    window.removeEventListener('resize', schedule)
  }
}
