// Layout-bar Tidy up — same idea as Canva / Figma Tidy up.
// Even edge gaps (the most common gap already in the selection) and line frames
// into a row, a column, or a grid. Sizes stay put. The grid’s corner stays on
// the selection’s top-left (it does not redistribute inside the old bounds).

/** One frame’s board box. `x` / `y` are the top-left in flow px. */
export type TidyBox = {
  id: string // RF node id
  x: number // Flow top-left
  y: number
  width: number
  height: number
}

/** Top-left after tidy up. */
export type TidyPlacement = {
  id: string
  x: number
  y: number
}

const PILE_GAP = 10 // Nothing has air yet — open a small even gap
const JOIN_SCORE = 0.5 // Half the shorter side must sit in the band

/** Middle value — used for a group’s typical edge, not the outlier. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b) // Low to high
  const mid = Math.floor(sorted.length / 2) // Center index
  if (sorted.length % 2 === 1) return sorted[mid]! // Odd count: the middle
  return (sorted[mid - 1]! + sorted[mid]!) / 2 // Even count: mean of the two middles
}

/** Top or left, depending on the axis we’re banding. */
function startOf(box: TidyBox, axis: 'x' | 'y'): number {
  return axis === 'x' ? box.x : box.y
}

/** Width or height for that same axis. */
function sizeOf(box: TidyBox, axis: 'x' | 'y'): number {
  return axis === 'x' ? box.width : box.height
}

/** Typical span of a row or column — median, so one tall frame can’t swallow the next row. */
function bandOf(group: TidyBox[], axis: 'x' | 'y'): { start: number; end: number } {
  const start = median(group.map((box) => startOf(box, axis))) // Typical leading edge
  const size = Math.max(1, median(group.map((box) => sizeOf(box, axis)))) // Typical thickness
  return { start, end: start + size }
}

/**
 * How well `item` belongs in `band`.
 * Overlap uses the shorter side. A few px of slop still counts as the same row.
 */
function bandScore(itemStart: number, itemSize: number, bandStart: number, bandEnd: number): number {
  const itemEnd = itemStart + itemSize // Far edge of the frame
  const overlap = Math.min(itemEnd, bandEnd) - Math.max(itemStart, bandStart) // Shared span
  const shorter = Math.min(itemSize, Math.max(1, bandEnd - bandStart)) // Don’t let a huge frame force a join
  if (overlap > 0) return overlap / shorter // 1 = fully on the band
  const gap = Math.max(itemStart, bandStart) - Math.min(itemEnd, bandEnd) // Air between them
  if (gap <= 8) return JOIN_SCORE // Almost lined up — still one row or column
  return 0
}

/** Group frames that share a horizontal band (rows) or a vertical band (columns). */
function cluster(items: TidyBox[], axis: 'x' | 'y'): TidyBox[][] {
  const cross: 'x' | 'y' = axis === 'x' ? 'y' : 'x' // Tie-break so order is stable
  const sorted = [...items].sort(
    (a, b) => startOf(a, axis) - startOf(b, axis) || startOf(a, cross) - startOf(b, cross)
  )
  const groups: TidyBox[][] = []
  for (const item of sorted) {
    let best = -1 // Group index we’d join
    let bestScore = 0
    for (let i = 0; i < groups.length; i++) {
      const band = bandOf(groups[i]!, axis) // Score against the typical member, not the union
      const score = bandScore(startOf(item, axis), sizeOf(item, axis), band.start, band.end)
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best >= 0 && bestScore >= JOIN_SCORE) groups[best]!.push(item) // Same row or column
    else groups.push([item]) // Start a new band
  }
  groups.sort(
    (a, b) =>
      median(a.map((box) => startOf(box, axis) + sizeOf(box, axis) / 2)) -
      median(b.map((box) => startOf(box, axis) + sizeOf(box, axis) / 2))
  ) // Top-to-bottom or left-to-right
  return groups
}

/** Most common non-negative gap. Ties pick the smaller gap so frames pull together. */
function modeGap(gaps: number[]): number {
  const rounded = gaps.map((gap) => Math.round(gap)).filter((gap) => gap >= 0) // Drop overlaps; 1px tolerance
  if (rounded.length === 0) return PILE_GAP // Stacked on each other — open a little
  const counts = new Map<number, number>()
  for (const gap of rounded) counts.set(gap, (counts.get(gap) ?? 0) + 1)
  let best = rounded[0]!
  let bestCount = 0
  for (const [gap, count] of counts) {
    if (count > bestCount || (count === bestCount && gap < best)) {
      best = gap // Majority wins; a tie keeps the tighter spacing
      bestCount = count
    }
  }
  return best
}

/** Edge-to-edge air between neighbors sorted along `axis`. */
function edgeGaps(items: TidyBox[], axis: 'x' | 'y'): number[] {
  const cross: 'x' | 'y' = axis === 'x' ? 'y' : 'x'
  const sorted = [...items].sort(
    (a, b) => startOf(a, axis) - startOf(b, axis) || startOf(a, cross) - startOf(b, cross)
  )
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const next = sorted[i]!
    gaps.push(startOf(next, axis) - (startOf(prev, axis) + sizeOf(prev, axis))) // Next leading edge minus previous trailing edge
  }
  return gaps
}

/** Air between consecutive row or column bands (uses each band’s outer edges). */
function trackGaps(groups: TidyBox[][], axis: 'x' | 'y'): number[] {
  const gaps: number[] = []
  for (let i = 1; i < groups.length; i++) {
    const prevEnd = Math.max(...groups[i - 1]!.map((box) => startOf(box, axis) + sizeOf(box, axis)))
    const nextStart = Math.min(...groups[i]!.map((box) => startOf(box, axis)))
    gaps.push(nextStart - prevEnd)
  }
  return gaps
}

/** Snap flow px so a second click doesn’t drift on float dust. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** One horizontal run: keep each frame’s Y, even the gaps, leave the leftmost put. */
function tidyHorizontal(items: TidyBox[]): TidyPlacement[] {
  const sorted = [...items].sort((a, b) => a.x - b.x || a.y - b.y) // Left to right
  const gap = modeGap(edgeGaps(sorted, 'x')) // The spacing this row already uses most
  let x = sorted[0]!.x // Selection’s left edge stays
  return sorted.map((item) => {
    const placed = { id: item.id, x: round2(x), y: round2(item.y) } // Y stays — 1D tidy doesn’t align the cross axis
    x += item.width + gap
    return placed
  })
}

/** One vertical run: keep each frame’s X, even the gaps, leave the topmost put. */
function tidyVertical(items: TidyBox[]): TidyPlacement[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x) // Top to bottom
  const gap = modeGap(edgeGaps(sorted, 'y'))
  let y = sorted[0]!.y // Selection’s top edge stays
  return sorted.map((item) => {
    const placed = { id: item.id, x: round2(item.x), y: round2(y) } // X stays
    y += item.height + gap
    return placed
  })
}

/** True when two frames would land in the same grid cell. */
function cellsCollide(rows: TidyBox[][], cols: TidyBox[][]): boolean {
  const rowIndex = new Map(rows.flatMap((row, index) => row.map((box) => [box.id, index])))
  const colIndex = new Map(cols.flatMap((col, index) => col.map((box) => [box.id, index])))
  const seen = new Set<string>()
  for (const [id, row] of rowIndex) {
    const key = `${row}:${colIndex.get(id)}`
    if (seen.has(key)) return true // Two frames want one cell
    seen.add(key)
  }
  return false
}

/**
 * Strict grid: shared column lefts, shared row tops, even track gaps.
 * The cell’s top-left sits on the selection’s top-left corner.
 */
function tidyGrid(rows: TidyBox[][], cols: TidyBox[][], items: TidyBox[]): TidyPlacement[] {
  const hGap = modeGap(trackGaps(cols, 'x')) // Space between columns
  const vGap = modeGap(trackGaps(rows, 'y')) // Space between rows
  const colW = cols.map((col) => Math.max(...col.map((box) => box.width))) // Track is as wide as its widest frame
  const rowH = rows.map((row) => Math.max(...row.map((box) => box.height)))
  const originX = Math.min(...items.map((box) => box.x)) // Grid hangs from the selection corner
  const originY = Math.min(...items.map((box) => box.y))
  const colX: number[] = []
  let x = originX
  for (const width of colW) {
    colX.push(x)
    x += width + hGap
  }
  const rowY: number[] = []
  let y = originY
  for (const height of rowH) {
    rowY.push(y)
    y += height + vGap
  }
  const rowIndex = new Map(rows.flatMap((row, index) => row.map((box) => [box.id, index])))
  const colIndex = new Map(cols.flatMap((col, index) => col.map((box) => [box.id, index])))
  return items.map((item) => {
    const row = rowIndex.get(item.id) ?? 0
    const col = colIndex.get(item.id) ?? 0
    return { id: item.id, x: round2(colX[col]!), y: round2(rowY[row]!) } // Top-left of the cell
  })
}

/**
 * No rows or columns to read (a pile, or a scatter).
 * Reading order, about-square grid, small even gap, still pinned to the top-left.
 */
function tidyCompact(items: TidyBox[]): TidyPlacement[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x) // Reading order
  const colCount = Math.max(1, Math.ceil(Math.sqrt(sorted.length))) // Near-square
  const rows: TidyBox[][] = []
  for (let i = 0; i < sorted.length; i += colCount) rows.push(sorted.slice(i, i + colCount))
  const cols: TidyBox[][] = Array.from({ length: colCount }, () => [])
  for (const row of rows) {
    row.forEach((box, index) => cols[index]!.push(box)) // Slot index is the column
  }
  const usedCols = cols.filter((col) => col.length > 0)
  const originX = Math.min(...items.map((box) => box.x))
  const originY = Math.min(...items.map((box) => box.y))
  const colW = usedCols.map((col) => Math.max(...col.map((box) => box.width)))
  const rowH = rows.map((row) => Math.max(...row.map((box) => box.height)))
  const colX: number[] = []
  let x = originX
  for (const width of colW) {
    colX.push(x)
    x += width + PILE_GAP
  }
  const rowY: number[] = []
  let y = originY
  for (const height of rowH) {
    rowY.push(y)
    y += height + PILE_GAP
  }
  const out: TidyPlacement[] = []
  rows.forEach((row, rowIndex) => {
    row.forEach((box, colIndex) => {
      out.push({ id: box.id, x: round2(colX[colIndex]!), y: round2(rowY[rowIndex]!) })
    })
  })
  return out
}

/**
 * Uneven bands that don’t form unique cells.
 * Each visual row is spaced on its own, rows stack from the selection’s top-left.
 */
function tidyPackedRows(rows: TidyBox[][], items: TidyBox[]): TidyPlacement[] {
  const hGap = modeGap(edgeGaps(items, 'x'))
  const vGap = modeGap(trackGaps(rows, 'y'))
  const originX = Math.min(...items.map((box) => box.x))
  let y = Math.min(...items.map((box) => box.y))
  const out: TidyPlacement[] = []
  for (const row of rows) {
    const sorted = [...row].sort((a, b) => a.x - b.x || a.y - b.y)
    const rowH = Math.max(...sorted.map((box) => box.height))
    let x = originX // Every row shares the selection’s left edge
    for (const item of sorted) {
      out.push({ id: item.id, x: round2(x), y: round2(y) }) // Tops line up in the row
      x += item.width + hGap
    }
    y += rowH + vGap
  }
  return out
}

/**
 * Canva / Figma Tidy up.
 * One row → even horizontal gaps. One column → even vertical gaps.
 * A grid → both, pinned to the selection’s top-left. A pile → a small square grid.
 */
export function tidyUpBoxes(items: TidyBox[]): TidyPlacement[] {
  if (items.length < 2) {
    return items.map((box) => ({ id: box.id, x: box.x, y: box.y })) // Nothing to arrange
  }
  const rows = cluster(items, 'y') // Frames that sit on the same horizontal band
  const cols = cluster(items, 'x') // Frames that sit on the same vertical band
  if (rows.length === 1 && cols.length === 1) return tidyCompact(items) // Pile — no line to even out
  if (rows.length === 1) return tidyHorizontal(rows[0]!) // One row: only fix horizontal air
  if (cols.length === 1) return tidyVertical(cols[0]!) // One column: only fix vertical air
  if (!cellsCollide(rows, cols)) return tidyGrid(rows, cols, items) // Real grid
  return tidyPackedRows(rows, items) // Ragged — still even, still top-left
}
