'use client'

// Personalize Nod Notes AI — default mark is a hand-drawn T; saved PNG stays editable
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { Eraser, Pencil, RotateCcw, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

/** localStorage key for the custom logo drawing (PNG data URL) */
export const NN_LOGO_DRAWING_STORAGE_KEY = 'nodnotes-ai-logo-drawing'

/** Legacy topper key — cleared on hydrate so old toppers do not linger */
const NN_TOPPER_STORAGE_KEY_LEGACY = 'nodnotes-ai-topper'

/** Legacy grey disc — brand `discVariant` only (not the draw editor) */
export const LOGO_CIRCLE_COLOR = '#a2a7af'

/** Editor + board light disc fill (same as `bg-gray-50`) */
const EDITOR_DISC_COLOR = '#f9fafb'

/** AI sparkles fill — same blue-500 as the Nod wordmark on every logo that shows stars */
export const AI_STAR_COLOR = '#3b82f6'

/** Pen ink in the editor — matches board positive stroke (`gray-900`) */
const DRAW_INK = '#111827'

/** White strokes for brand-grey SVG / ink-mask export */
const DRAW_WHITE = '#ffffff'

/** Canvas pixel size for editor + export */
const CANVAS_SIZE = 256

/** Pen width presets in canvas pixels */
const THICKNESSES = [4, 8, 14, 22] as const

/** Marker weight for the default T — matches the filled logo bar at 256px */
const DRAWN_T_WIDTH = 26

/** Crossbar: left → stem, slight sag so it reads as a pen stroke */
const DRAWN_T_BAR = 'M 48 64 C 72 56, 94 72, 124 61'

/** Stem: overlaps the bar, wobbles down the left-of-center column */
const DRAWN_T_STEM = 'M 110 48 C 104 102, 118 152, 108 198'

/** Small right hook at the stem foot (logo’s table-leg serif) */
const DRAWN_T_FOOT = 'M 108 186 C 118 192, 134 194, 150 188'

/** Lumpy table-dot to the right of the stem (filled, not a perfect circle) */
const DRAWN_DOT =
  'M 206 104 C 208 85, 194 69, 176 70 C 156 71, 144 90, 147 108 C 150 128, 168 140, 186 136 C 202 132, 206 118, 206 104 Z'

/** Clip strokes to the logo disc so round caps never paint the corners */
function clipLogoDisc(ctx: CanvasRenderingContext2D) {
  ctx.beginPath() // Disc path
  ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 0.5, 0, Math.PI * 2) // Same radius as the fill
  ctx.clip() // Keep marker inside the circle
}

/** Parse `#rrggbb` → RGB tuple */
function hexRgb(hex: string): [number, number, number] {
  const h = hex.slice(1) // Drop #
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** True when a pixel matches the editor light disc or legacy grey disc fill */
function isDiscFillPixel(r: number, g: number, b: number, tol = 10): boolean {
  for (const hex of [EDITOR_DISC_COLOR, LOGO_CIRCLE_COLOR]) {
    const [br, bg, bb] = hexRgb(hex)
    if (
      Math.abs(r - br) <= tol &&
      Math.abs(g - bg) <= tol &&
      Math.abs(b - bb) <= tol
    ) {
      return true
    }
  }
  return false
}

/**
 * True when the disc has any non-fill ink.
 * Blank circle → false so Done/Close can restore the default brand mark.
 */
function canvasHasInk(ctx: CanvasRenderingContext2D): boolean {
  const { data } = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE) // Full editor bitmap
  const cx = CANVAS_SIZE / 2 // Disc center x
  const cy = CANVAS_SIZE / 2 // Disc center y
  const r = CANVAS_SIZE / 2 - 0.5 // Same radius as paintSolidCircle
  for (let y = 0; y < CANVAS_SIZE; y++) {
    for (let x = 0; x < CANVAS_SIZE; x++) {
      const dx = x + 0.5 - cx // Pixel center vs disc
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy > r * r) continue // Ignore outside the logo disc
      const i = (y * CANVAS_SIZE + x) * 4 // RGBA index
      if (!isDiscFillPixel(data[i], data[i + 1], data[i + 2])) {
        return true // Stroke or other mark on the disc
      }
    }
  }
  return false // Only the solid disc fill
}

/**
 * Strip disc fills; keep ink as opaque white on transparent.
 * Saved marks are masks — board + editor paint them positive (dark on light).
 */
function imageDataToInkMask(image: ImageData): ImageData {
  const out = new ImageData(image.width, image.height) // Transparent by default
  const src = image.data
  const dst = out.data
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] < 8) continue // Already empty
    if (isDiscFillPixel(src[i], src[i + 1], src[i + 2])) continue // Disc fill — not ink
    dst[i] = 255 // White mask pixel (CSS mask uses luminance/alpha)
    dst[i + 1] = 255
    dst[i + 2] = 255
    dst[i + 3] = 255 // Full ink
  }
  return out
}

/** Canvas → ink-only PNG data URL (transparent disc, white strokes) */
function exportInkMaskFromCanvas(source: HTMLCanvasElement): string {
  const ctx = source.getContext('2d')
  if (!ctx) return source.toDataURL('image/png')
  const ink = imageDataToInkMask(ctx.getImageData(0, 0, source.width, source.height))
  const out = document.createElement('canvas') // Offscreen export
  out.width = source.width
  out.height = source.height
  const octx = out.getContext('2d')
  if (!octx) return source.toDataURL('image/png')
  octx.putImageData(ink, 0, 0)
  return out.toDataURL('image/png')
}

/** Normalize a stored logo PNG (legacy grey+white or ink mask) to ink-only for CSS masks */
function normalizeLogoDrawingToInkMask(src: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = CANVAS_SIZE
      c.height = CANVAS_SIZE
      const ctx = c.getContext('2d')
      if (!ctx) {
        resolve(src)
        return
      }
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
      ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
      resolve(exportInkMaskFromCanvas(c))
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}

/** Paint the default hand-drawn T + table-dot in editor ink (disc already filled) */
function strokeDefaultDrawnMark(ctx: CanvasRenderingContext2D) {
  ctx.save() // Restore clip + style after
  clipLogoDisc(ctx) // Stay inside the disc
  ctx.strokeStyle = DRAW_INK // Positive dark ink (matches board)
  ctx.fillStyle = DRAW_INK // Dot is a filled blob
  ctx.lineCap = 'round' // Marker ends
  ctx.lineJoin = 'round' // Marker corners
  ctx.lineWidth = DRAWN_T_WIDTH // T bar/stem weight
  ctx.stroke(new Path2D(DRAWN_T_BAR)) // Crossbar
  ctx.stroke(new Path2D(DRAWN_T_STEM)) // Vertical stem
  ctx.stroke(new Path2D(DRAWN_T_FOOT)) // Foot hook
  ctx.fill(new Path2D(DRAWN_DOT)) // Table-dot
  ctx.restore() // Drop clip
}

/** Table-dot centroid in the 256 canvas — T hinges here for the load nod */
const DRAWN_DOT_CX = 176
const DRAWN_DOT_CY = 104

function DefaultDrawnLogoSvg({
  size,
  className,
  onBoard = false,
  nod = false,
}: {
  size: number
  className?: string
  onBoard?: boolean // Map chat toggle: black/white strokes on board fill
  nod?: boolean // Board open/load: T bows around the dot, then settles
}) {
  const stroke = onBoard ? 'currentColor' : DRAW_WHITE
  return (
    <svg
      viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`}
      width={size}
      height={size}
      className={cn(onBoard && 'text-gray-900 dark:text-white', className)}
      style={
        nod
          ? ({
              ['--nn-nod-cx']: `${(DRAWN_DOT_CX / CANVAS_SIZE) * 100}%`, // Table-dot center x
              ['--nn-nod-cy']: `${(DRAWN_DOT_CY / CANVAS_SIZE) * 100}%`, // Table-dot center y
            } as CSSProperties)
          : undefined
      }
      role="img"
      aria-label="Nod Notes"
    >
      <g
        className={nod ? 'nn-icon-nod-arm' : undefined}
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={DRAWN_T_WIDTH}
      >
        <path d={DRAWN_T_BAR} />
        <path d={DRAWN_T_STEM} />
        <path d={DRAWN_T_FOOT} />
      </g>
      <path d={DRAWN_DOT} fill={stroke} />
    </svg>
  )
}

/** Read persisted logo drawing data URL (client-only) */
export function getStoredLogoDrawing(): string | null {
  if (typeof window === 'undefined') return null
  try {
    localStorage.removeItem(NN_TOPPER_STORAGE_KEY_LEGACY)
  } catch {
    // Ignore storage errors
  }
  return localStorage.getItem(NN_LOGO_DRAWING_STORAGE_KEY)
}

type NodNotesBrandMarkProps = {
  drawingUrl?: string | null // Saved ink-mask PNG (or legacy grey+white composite)
  size?: number
  className?: string
  /** Board fill + theme strokes (default); brand = legacy grey disc for personalize canvas */
  discVariant?: 'brand' | 'board'
  /** AI sparkles badge — on for map toggle + chat logos; off on customize-agent icon */
  showAiStar?: boolean
  /** Default mark only: T hinges on the table-dot once (board open / load) */
  nod?: boolean
}

/** Custom drawing as a CSS mask so strokes follow board colors (positive like the default SVG). */
function LogoInkMask({
  drawingUrl,
  onBoard,
}: {
  drawingUrl: string
  onBoard: boolean
}) {
  const [maskUrl, setMaskUrl] = useState<string | null>(null) // Normalized ink mask

  useEffect(() => {
    let cancelled = false
    void normalizeLogoDrawingToInkMask(drawingUrl).then((url) => {
      if (!cancelled) setMaskUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [drawingUrl])

  if (!maskUrl) return null // Wait for normalize (avoids a grey flash)

  return (
    <div
      className={cn(
        'h-full w-full',
        onBoard ? 'bg-gray-900 dark:bg-white' : 'bg-white' // Positive / editor-grey disc
      )}
      style={{
        WebkitMaskImage: `url(${maskUrl})`,
        maskImage: `url(${maskUrl})`,
        WebkitMaskSize: '100% 100%',
        maskSize: '100% 100%',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
      role="img"
      aria-label="Nod Notes"
    />
  )
}

/**
 * Brand mark — default hand-drawn T + table-dot, or a saved ink mask.
 * Solid circle behind the mark so any transparency still reads as the logo disc.
 * AI sparkles badge sits top-right with a white border (outside the disc clip).
 */
export function NodNotesBrandMark({
  drawingUrl = null,
  size = 56,
  className,
  discVariant = 'board',
  showAiStar = true,
  nod = false,
}: NodNotesBrandMarkProps) {
  const badgeSize = Math.max(14, Math.round(size * 0.34)) // Scales with logo
  const onBoard = discVariant === 'board'

  return (
    <div
      className={cn('relative flex-shrink-0', className)}
      style={{ width: size, height: size }}
    >
      {/* Logo disc — board fill + border by default; legacy grey on personalize canvas */}
      <div
        className={cn(
          'h-full w-full overflow-hidden rounded-full border-[1.5px]',
          onBoard
            ? 'bg-gray-50 dark:bg-[#0f0f0f] border-gray-500 dark:border-gray-400'
            : 'border-gray-500 dark:border-gray-400'
        )}
        style={onBoard ? undefined : { backgroundColor: LOGO_CIRCLE_COLOR }}
      >
        {drawingUrl ? (
          <LogoInkMask drawingUrl={drawingUrl} onBoard={onBoard} />
        ) : (
          <DefaultDrawnLogoSvg
            size={size}
            className="h-full w-full"
            onBoard={onBoard}
            nod={nod}
          />
        )}
      </div>

      {/* AI stars — top-right; Nod blue on map toggle + open chat */}
      {showAiStar ? (
      <svg
        viewBox="0 0 24 24"
        className="absolute pointer-events-none z-10"
        style={{
          width: badgeSize,
          height: badgeSize,
          top: -Math.round(badgeSize * 0.15),
          right: -Math.round(badgeSize * 0.15),
          color: AI_STAR_COLOR,
          filter: 'drop-shadow(0 0 0.6px #fff) drop-shadow(0 0 0.6px #fff) drop-shadow(0 0 0.6px #fff)',
        }}
        fill="none"
        aria-hidden
      >
        {/* Large center sparkle */}
        <path
          d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
        {/* Small top-right spark */}
        <path d="M20 2v4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
        <path d="M22 4h-4" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
      ) : null}
    </div>
  )
}

type Tool = 'pen' | 'eraser'

type PersonalizeAiModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  drawingUrl: string | null
  onDrawingChange: (url: string | null) => void
}

export function PersonalizeAiModal({
  open,
  onOpenChange,
  drawingUrl,
  onDrawingChange,
}: PersonalizeAiModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPtRef = useRef<{ x: number; y: number } | null>(null)
  const resetRef = useRef(false) // Reset paints a blank disc; blank Done/Close restores default icon
  const [tool, setTool] = useState<Tool>('pen')
  const [thickness, setThickness] = useState<(typeof THICKNESSES)[number]>(8)
  const [dirty, setDirty] = useState(false)
  const [ready, setReady] = useState(false) // Canvas seeded for this open

  /** Fill the full logo disc with board-light grey (positive draw surface) */
  const paintSolidCircle = useCallback((ctx: CanvasRenderingContext2D) => {
    const s = CANVAS_SIZE
    ctx.clearRect(0, 0, s, s)
    ctx.save()
    ctx.beginPath()
    ctx.arc(s / 2, s / 2, s / 2 - 0.5, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fillStyle = EDITOR_DISC_COLOR
    ctx.fill()
    ctx.restore()
  }, [])

  /**
   * Load a saved ink mask (or legacy grey+white PNG) as dark ink on the light disc
   * so the editor matches the positive brand mark outside.
   */
  const paintSavedImage = useCallback(
    (ctx: CanvasRenderingContext2D, src: string) =>
      new Promise<void>((resolve) => {
        void normalizeLogoDrawingToInkMask(src).then((maskUrl) => {
          const img = new window.Image()
          img.onload = () => {
            paintSolidCircle(ctx) // Light disc first
            const tmp = document.createElement('canvas') // Recolor white mask → dark ink
            tmp.width = CANVAS_SIZE
            tmp.height = CANVAS_SIZE
            const tctx = tmp.getContext('2d')
            if (!tctx) {
              resolve()
              return
            }
            tctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE)
            const image = tctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)
            const [ir, ig, ib] = hexRgb(DRAW_INK)
            const d = image.data
            for (let i = 0; i < d.length; i += 4) {
              if (d[i + 3] < 8) continue // Empty
              d[i] = ir // Positive ink
              d[i + 1] = ig
              d[i + 2] = ib
            }
            tctx.putImageData(image, 0, 0)
            ctx.save()
            ctx.beginPath()
            ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 0.5, 0, Math.PI * 2)
            ctx.clip()
            ctx.drawImage(tmp, 0, 0) // Dark strokes on light disc
            ctx.restore()
            resolve()
          }
          img.onerror = () => {
            paintSolidCircle(ctx)
            resolve()
          }
          img.src = maskUrl
        })
      }),
    [paintSolidCircle]
  )

  /** Light disc + default marker T (first open with no saved drawing) */
  const paintDefaultDrawnLogo = useCallback((ctx: CanvasRenderingContext2D) => {
    paintSolidCircle(ctx) // Solid disc first
    strokeDefaultDrawnMark(ctx) // Hand-drawn T + table-dot on top
  }, [paintSolidCircle])

  /** Seed editor: saved PNG if any, else the default drawn mark */
  const seedCanvas = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (drawingUrl && !resetRef.current) {
      await paintSavedImage(ctx, drawingUrl) // Continue editing prior image
    } else if (resetRef.current) {
      paintSolidCircle(ctx) // Reset path: blank disc only
    } else {
      paintDefaultDrawnLogo(ctx) // First open: start from the drawn character
    }
    setReady(true)
  }, [drawingUrl, paintSavedImage, paintDefaultDrawnLogo, paintSolidCircle])

  // Dialog mounts canvas after open — seed when open flips true
  useEffect(() => {
    if (!open) {
      setReady(false)
      return
    }
    setTool('pen')
    setThickness(8)
    setDirty(false)
    resetRef.current = false
    setReady(false)
    // Next frame so Dialog content + canvas ref exist
    const id = requestAnimationFrame(() => {
      void seedCanvas()
    })
    return () => cancelAnimationFrame(id)
  }, [open, seedCanvas])

  const getPoint = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_SIZE,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_SIZE,
    }
  }

  const strokeTo = (x: number, y: number) => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const last = lastPtRef.current
    ctx.save()
    ctx.beginPath()
    ctx.arc(CANVAS_SIZE / 2, CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 0.5, 0, Math.PI * 2)
    ctx.clip() // Stay inside solid disc
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = thickness
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = tool === 'eraser' ? EDITOR_DISC_COLOR : DRAW_INK
    ctx.beginPath()
    if (last) {
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(x, y)
    } else {
      ctx.moveTo(x, y)
      ctx.lineTo(x + 0.01, y)
    }
    ctx.stroke()
    ctx.restore()
    lastPtRef.current = { x, y }
    setDirty(true)
    resetRef.current = false
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!ready) return
    const pt = getPoint(e)
    if (!pt) return
    drawingRef.current = true
    lastPtRef.current = null
    e.currentTarget.setPointerCapture(e.pointerId)
    strokeTo(pt.x, pt.y)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return
    const pt = getPoint(e)
    if (!pt) return
    strokeTo(pt.x, pt.y)
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false
    lastPtRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // Already released
    }
  }

  const handleReset = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    resetRef.current = true
    paintSolidCircle(ctx) // Blank grey disc — not the default drawn T
    setDirty(false)
    setTool('pen')
  }

  /** Export ink-only PNG — transparent disc + white strokes (board paints positive) */
  const exportDrawing = () => {
    const canvas = canvasRef.current
    if (!canvas) return null
    return exportInkMaskFromCanvas(canvas)
  }

  /**
   * Persist on Done/Close: blank disc → clear storage (default icon);
   * ink + edits → save ink-mask PNG; otherwise leave the prior URL alone.
   */
  const commitDrawing = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !ready) return // Canvas not seeded yet — don't wipe storage
    if (!canvasHasInk(ctx)) {
      onDrawingChange(null) // Blank circle → default drawn mark outside the editor
      return
    }
    if (dirty) {
      onDrawingChange(exportDrawing()) // Ink mask — positive on board like the default SVG
    }
  }

  /** Done, X, escape, and overlay dismiss all commit the same way */
  const requestClose = () => {
    commitDrawing()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) commitDrawing() // Escape / overlay — same blank→default rule as Done
        onOpenChange(next)
      }}
    >
      <DialogContent
        className={cn(
          'sm:max-w-[400px] p-0 gap-0 overflow-hidden',
          'bg-[#1a1a1a] border-white/10 text-gray-100',
          '[&>button]:hidden'
        )}
      >
        <DialogTitle className="sr-only">Personalize your Nod Notes AI</DialogTitle>
        <DialogDescription className="sr-only">
          Draw on the solid logo circle; your image is saved and can be edited later
        </DialogDescription>

        <div className="relative flex items-center justify-center px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold text-gray-100">
            Personalize your Nod Notes AI
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="absolute right-3 top-3 w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-100 hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Solid circle canvas — draw here; result becomes the brand image */}
        <div className="flex flex-col items-center gap-4 px-6 pt-3 pb-4">
          <div
            className="rounded-full overflow-hidden touch-none"
            style={{
              width: 168,
              height: 168,
              backgroundColor: EDITOR_DISC_COLOR, // Same light disc as board brand mark
              boxShadow: '0 0 0 1.5px rgb(107 114 128)', // gray-500 ring like the board icon
            }}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="h-full w-full cursor-crosshair"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
          </div>
          <p className="text-xs text-gray-500 text-center max-w-[260px]">
            The logo starts as a drawing — edit it, or reset to a blank circle. Done or close with a
            blank circle restores the default icon; otherwise your drawing is saved.
          </p>
        </div>

        <div className="px-5 pb-4 flex flex-col gap-3">
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setTool('pen')}
              className={cn(
                'h-8 px-3 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors',
                tool === 'pen'
                  ? 'bg-white/15 text-white'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/10'
              )}
              aria-pressed={tool === 'pen'}
            >
              <Pencil className="h-3.5 w-3.5" />
              Draw
            </button>
            <button
              type="button"
              onClick={() => setTool('eraser')}
              className={cn(
                'h-8 px-3 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors',
                tool === 'eraser'
                  ? 'bg-white/15 text-white'
                  : 'text-gray-400 hover:text-gray-100 hover:bg-white/10'
              )}
              aria-pressed={tool === 'eraser'}
            >
              <Eraser className="h-3.5 w-3.5" />
              Eraser
            </button>
          </div>

          <div className="flex items-center justify-center gap-2">
            <span className="text-[11px] text-gray-500 mr-1">Thickness</span>
            {THICKNESSES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setThickness(t)}
                title={`${t}px`}
                aria-label={`Thickness ${t}`}
                aria-pressed={thickness === t}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                  thickness === t
                    ? 'bg-white/15 ring-1 ring-white/40'
                    : 'hover:bg-white/10'
                )}
              >
                <span
                  className="rounded-full bg-gray-200"
                  style={{
                    width: Math.max(4, t / 2.5),
                    height: Math.max(4, t / 2.5),
                  }}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-100 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
          <button
            type="button"
            onClick={requestClose}
            className="h-8 px-4 rounded-md bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
