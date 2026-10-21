// Map menu — print page for 200% / pan bounds (view the board as a sheet).

export const BOARD_PRINT_PAGE_STORAGE_KEY = 'nodnotes-board-print-page'

export type BoardPrintPaperId = 'letter' | 'legal' | 'tabloid' | 'a4'
export type BoardPrintOrient = 'portrait' | 'landscape'

/** Screen = live pane; square is 1:1; paper uses portrait/landscape. */
export type BoardPrintPage =
  | { kind: 'screen' }
  | { kind: 'square' }
  | { kind: 'paper'; paper: BoardPrintPaperId; orient: BoardPrintOrient }

export const BOARD_PRINT_PAPERS: {
  id: BoardPrintPaperId
  label: string
  w: number
  h: number
  unit: string
}[] = [
  { id: 'letter', label: 'Letter', w: 8.5, h: 11, unit: 'in' },
  { id: 'legal', label: 'Legal', w: 8.5, h: 14, unit: 'in' },
  { id: 'tabloid', label: 'Tabloid', w: 11, h: 17, unit: 'in' },
  { id: 'a4', label: 'A4', w: 210, h: 297, unit: 'mm' },
]

const DEFAULT_PAGE: BoardPrintPage = { kind: 'screen' }

let liveRatio: number | null = null // null = match the pane; bounds math reads this

/** Width/height for 200% world. Null = use the live pane. */
export function boardPrintAspectRatio(page: BoardPrintPage): number | null {
  if (page.kind === 'screen') return null
  if (page.kind === 'square') return 1
  const spec = BOARD_PRINT_PAPERS.find((p) => p.id === page.paper)
  if (!spec) return null
  const w = page.orient === 'landscape' ? spec.h : spec.w
  const h = page.orient === 'landscape' ? spec.w : spec.h
  return h > 0 ? w / h : null
}

export function getBoardPrintAspectRatio(): number | null {
  return liveRatio
}

export function setBoardPrintAspectRatio(ratio: number | null): void {
  liveRatio = ratio != null && ratio > 0 ? ratio : null
}

export function printPageLabel(page: BoardPrintPage): string {
  if (page.kind === 'screen') return 'Screen'
  if (page.kind === 'square') return 'Square'
  const spec = BOARD_PRINT_PAPERS.find((p) => p.id === page.paper)
  if (!spec) return 'Screen'
  const a = page.orient === 'landscape' ? spec.h : spec.w
  const b = page.orient === 'landscape' ? spec.w : spec.h
  const dim = spec.unit === 'in' ? `${a} × ${b}` : `${a} × ${b} mm`
  return `${spec.label} ${dim}`
}

function parsePage(raw: string | null): BoardPrintPage {
  if (!raw) return DEFAULT_PAGE
  try {
    const v = JSON.parse(raw) as BoardPrintPage
    if (v?.kind === 'screen' || v?.kind === 'square') return { kind: v.kind }
    if (
      v?.kind === 'paper' &&
      BOARD_PRINT_PAPERS.some((p) => p.id === v.paper) &&
      (v.orient === 'portrait' || v.orient === 'landscape')
    ) {
      return { kind: 'paper', paper: v.paper, orient: v.orient }
    }
  } catch {
    // Bad key — fall through to screen
  }
  return DEFAULT_PAGE
}

export function readBoardPrintPage(): BoardPrintPage {
  if (typeof window === 'undefined') return DEFAULT_PAGE
  return parsePage(localStorage.getItem(BOARD_PRINT_PAGE_STORAGE_KEY))
}

export function writeBoardPrintPage(page: BoardPrintPage): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(BOARD_PRINT_PAGE_STORAGE_KEY, JSON.stringify(page))
  setBoardPrintAspectRatio(boardPrintAspectRatio(page)) // Bounds pick this up on the next floor sync
}
