// Capture deep links — URL params encode board camera so links work without localStorage.

/** Minimal capture fields needed for link building. */
export type CaptureLinkSource = {
  id: string
  boardId: string
  viewport: { x: number; y: number; zoom: number }
  rotation?: number
  scrollMode?: boolean
}

/** Camera saved with a capture (RF viewport + board heading + Free nav mode). */
export type CaptureCamera = {
  viewport: { x: number; y: number; zoom: number }
  rotation: number // Board heading in degrees
  scrollMode: boolean // true = Scroll nav (wheel pans); false = Zoom nav
}

const VP_EPS = 0.75 // px — treat as same pan
const ZOOM_EPS = 0.002 // treat as same zoom
const ROT_EPS = 0.4 // degrees

/** Read Free-nav Scroll vs Zoom from localStorage (default Scroll). */
export function readScrollModePreference(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem('thinktable-scroll-mode') !== 'false'
}

/** Round floats for stable share URLs. */
function fmt(n: number, digits: number): string {
  const r = Number(n.toFixed(digits))
  return String(r)
}

/** Build camera state from a saved capture. */
export function captureToCamera(capture: CaptureLinkSource): CaptureCamera {
  return {
    viewport: capture.viewport,
    rotation: capture.rotation ?? 0,
    scrollMode: capture.scrollMode ?? true,
  }
}

/** Relative board path with capture camera query (client router — no full reload). */
export function buildCapturePath(capture: CaptureLinkSource): string {
  const { viewport, rotation = 0, scrollMode = true } = capture
  const params = new URLSearchParams()
  params.set('capture', capture.id)
  params.set('x', fmt(viewport.x, 2))
  params.set('y', fmt(viewport.y, 2))
  params.set('z', fmt(viewport.zoom, 4))
  if (Math.abs(rotation) > 0.05) params.set('rot', fmt(rotation, 2))
  if (!scrollMode) params.set('nav', 'zoom')
  return `/board/${capture.boardId}?${params.toString()}`
}

/** Build a shareable board URL that restores this capture’s camera. */
export function buildCaptureUrl(capture: CaptureLinkSource): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.origin}${buildCapturePath(capture)}`
}

/** Copy the capture link to the clipboard. */
export async function copyCaptureLink(capture: CaptureLinkSource): Promise<void> {
  const url = buildCaptureUrl(capture)
  if (!url) return
  await navigator.clipboard.writeText(url)
}

/** Look up a saved capture by id (local list). */
export function getCaptureById(id: string, captures: CaptureLinkSource[]): CaptureLinkSource | undefined {
  return captures.find((c) => c.id === id)
}

/** Parse ?capture=…&x=&y=&z=&rot=&nav= from the board URL. */
export function parseCaptureLinkParams(
  searchParams: { get: (key: string) => string | null } | null,
  boardId: string,
  captures: CaptureLinkSource[]
): CaptureCamera | null {
  if (!searchParams) return null
  const captureId = searchParams.get('capture')
  const fromStore = captureId ? getCaptureById(captureId, captures) : undefined
  const xRaw = searchParams.get('x')
  const yRaw = searchParams.get('y')
  const zRaw = searchParams.get('z')

  const hasVpParams = xRaw != null && yRaw != null && zRaw != null
  if (!fromStore && !hasVpParams) return null
  if (fromStore && fromStore.boardId !== boardId) return null

  const viewport = hasVpParams
    ? { x: Number(xRaw), y: Number(yRaw), zoom: Number(zRaw) }
    : fromStore!.viewport
  if (!Number.isFinite(viewport.x) || !Number.isFinite(viewport.y) || !Number.isFinite(viewport.zoom)) {
    return null
  }

  const rotRaw = searchParams.get('rot')
  const rotation =
    rotRaw != null && rotRaw !== ''
      ? Number(rotRaw)
      : fromStore?.rotation ?? 0
  const navParam = searchParams.get('nav')
  const scrollMode =
    navParam === 'zoom' ? false : navParam === 'scroll' ? true : (fromStore?.scrollMode ?? true)

  return {
    viewport,
    rotation: Number.isFinite(rotation) ? rotation : 0,
    scrollMode,
  }
}

/** True when the live board already matches the capture camera. */
export function captureCameraMatches(
  target: CaptureCamera,
  current: CaptureCamera
): boolean {
  return (
    Math.abs(target.viewport.x - current.viewport.x) <= VP_EPS &&
    Math.abs(target.viewport.y - current.viewport.y) <= VP_EPS &&
    Math.abs(target.viewport.zoom - current.viewport.zoom) <= ZOOM_EPS &&
    Math.abs(target.rotation - current.rotation) <= ROT_EPS &&
    target.scrollMode === current.scrollMode
  )
}

/** Strip capture params after the camera has been applied. */
export function captureLinkCleanPath(boardId: string): string {
  return `/board/${boardId}`
}

/** Parse a pasted / copied capture URL into camera source (works without localStorage). */
export function parseCaptureUrl(input: string): CaptureLinkSource | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const candidates = [trimmed]
  const embedded = trimmed.match(/(?:https?:\/\/[^\s<>"']+|\/board\/[^\s<>"']+)/i)?.[0]
  if (embedded && embedded !== trimmed) candidates.push(embedded)
  for (const candidate of candidates) {
    const parsed = parseCaptureUrlCandidate(candidate)
    if (parsed) return parsed
  }
  return null
}

function parseCaptureUrlCandidate(input: string): CaptureLinkSource | null {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://localhost'
    const url = input.startsWith('/') ? new URL(input, base) : new URL(input)
    const m = url.pathname.match(/^\/board\/([^/]+)\/?$/)
    if (!m) return null
    const boardId = m[1]
    const captureId = url.searchParams.get('capture')
    if (!captureId) return null
    const xRaw = url.searchParams.get('x')
    const yRaw = url.searchParams.get('y')
    const zRaw = url.searchParams.get('z')
    const rotRaw = url.searchParams.get('rot')
    const navParam = url.searchParams.get('nav')
    const hasVp = xRaw != null && yRaw != null && zRaw != null
    const viewport = hasVp
      ? { x: Number(xRaw), y: Number(yRaw), zoom: Number(zRaw) }
      : { x: 0, y: 0, zoom: 1 }
    if (hasVp && (!Number.isFinite(viewport.x) || !Number.isFinite(viewport.y) || !Number.isFinite(viewport.zoom))) {
      return null
    }
    return {
      id: captureId,
      boardId,
      viewport,
      rotation: rotRaw != null && rotRaw !== '' ? Number(rotRaw) : 0,
      scrollMode: navParam !== 'zoom',
    }
  } catch {
    return null
  }
}

/** Pull a capture URL out of clipboard plain text or HTML. */
export function extractCaptureUrlFromClipboard(data: DataTransfer | null): string | null {
  if (!data) return null
  const plain = data.getData('text/plain')?.trim()
  if (plain && parseCaptureUrl(plain)) return plain
  if (plain) {
    const match = plain.match(/(?:https?:\/\/[^\s<>"']+|\/board\/[^\s<>"']+)/i)?.[0]
    if (match && parseCaptureUrl(match)) return match
  }
  const html = data.getData('text/html')
  if (html) {
    const href = html.match(/href=["']([^"']+)["']/i)?.[1]
    if (href && parseCaptureUrl(href)) return href
  }
  return null
}

/** TipTap captureLink attrs persisted in frame HTML. */
export function captureLinkNodeAttrs(source: CaptureLinkSource, title: string) {
  return {
    captureId: source.id,
    boardId: source.boardId,
    title,
    viewportX: source.viewport.x,
    viewportY: source.viewport.y,
    viewportZoom: source.viewport.zoom,
    rotation: source.rotation ?? 0,
    scrollMode: source.scrollMode === false ? 'zoom' : 'scroll',
  }
}

/** Rebuild navigation payload from a captureLink node. */
export function captureSourceFromNodeAttrs(attrs: Record<string, unknown>): CaptureLinkSource {
  return {
    id: String(attrs.captureId || ''),
    boardId: String(attrs.boardId || ''),
    viewport: {
      x: Number(attrs.viewportX),
      y: Number(attrs.viewportY),
      zoom: Number(attrs.viewportZoom),
    },
    rotation: Number(attrs.rotation || 0),
    scrollMode: attrs.scrollMode !== 'zoom',
  }
}

/** In-app capture nav — same board applies camera without a route change. */
export const CAPTURE_NAV_EVENT = 'tt-navigate-capture'

export type CaptureNavDetail = {
  boardId: string
  camera: CaptureCamera
}

/** Navigate to a capture in the same tab — client-side only (no window.location). */
export function navigateToCapture(
  capture: CaptureLinkSource,
  currentBoardId: string | undefined,
  router: { push: (href: string) => void }
): void {
  if (currentBoardId === capture.boardId) {
    window.dispatchEvent(
      new CustomEvent(CAPTURE_NAV_EVENT, {
        detail: { boardId: capture.boardId, camera: captureToCamera(capture) },
      })
    )
    const clean = captureLinkCleanPath(capture.boardId)
    if (window.location.pathname === clean && window.location.search) {
      window.history.replaceState(window.history.state, '', clean)
    }
    return
  }
  router.push(buildCapturePath(capture))
}
