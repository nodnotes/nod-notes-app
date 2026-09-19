// Handwriting → text. Prefer the OS recognizer; fall back to Tesseract on a rendered stroke.
// Both are best-effort. A weak read returns null and the ink stays a drawing.

type InkPoint = { x: number; y: number }

type HwStroke = { addPoint: (p: { x: number; y: number; t?: number }) => void }
type HwDrawing = {
  addStroke: (stroke: HwStroke) => void
  getPrediction: () => Promise<Array<{ text?: string }>>
}
type HwRecognizer = {
  startDrawing: (hints: { recognitionType?: string; inputType?: string; alternatives?: number }) => HwDrawing
}

/** Drop OCR garbage. A shape that isn’t letters should not become a frame. */
function cleanText(raw: string, confidence: number): string | null {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text || text.length > 48) return null
  const letters = text.replace(/[^A-Za-z0-9]/g, '')
  if (letters.length === 0) return null // Punctuation-only isn’t a word
  if (letters.length / text.length < 0.5) return null
  const min = text.length <= 2 ? 62 : 40 // One character has to be surer than a word
  if (confidence < min) return null
  return text
}

/** Chrome / Edge handwriting API when the OS actually ships a model. */
async function recognizeWithPlatform(strokes: InkPoint[][]): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const nav = navigator as Navigator & {
    createHandwritingRecognizer?: (c: { languages: string[] }) => Promise<HwRecognizer>
  }
  const StrokeCtor = (window as unknown as { HandwritingStroke?: new () => HwStroke }).HandwritingStroke
  if (!nav.createHandwritingRecognizer || !StrokeCtor) return null
  try {
    const recognizer = await nav.createHandwritingRecognizer({ languages: ['en'] })
    const drawing = recognizer.startDrawing({
      recognitionType: 'text', // Prose, not math
      inputType: 'mouse', // Pen, finger, and mouse all come through pointer events
      alternatives: 1,
    })
    const t0 = Date.now()
    for (const stroke of strokes) {
      const hw = new StrokeCtor()
      stroke.forEach((p, i) => hw.addPoint({ x: p.x, y: p.y, t: t0 + i * 16 }))
      drawing.addStroke(hw)
    }
    const predictions = await drawing.getPrediction()
    const text = predictions?.[0]?.text || ''
    return cleanText(text, 80) // The platform doesn’t return a score; a cleaned string is the gate
  } catch {
    return null
  }
}

/** Paint strokes on white so Tesseract sees ink, not a transparent board. */
function strokesToCanvas(strokes: InkPoint[][]): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  if (!Number.isFinite(minX)) return null
  const pad = 18
  const srcW = Math.max(8, maxX - minX)
  const srcH = Math.max(8, maxY - minY)
  const scale = Math.min(4, 220 / Math.max(srcH, 24)) // Tall enough for the model, not a huge bitmap
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil((srcW + pad * 2) * scale)
  canvas.height = Math.ceil((srcH + pad * 2) * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = '#111111'
  ctx.lineWidth = Math.max(3, 6 * scale) // Block-letter thickness
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const stroke of strokes) {
    if (stroke.length === 0) continue
    ctx.beginPath()
    stroke.forEach((p, i) => {
      const x = (p.x - minX + pad) * scale
      const y = (p.y - minY + pad) * scale
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }
  return canvas
}

type TessWorker = {
  setParameters: (p: Record<string, string>) => Promise<unknown>
  recognize: (image: HTMLCanvasElement) => Promise<{ data: { text: string; confidence: number } }>
}

let workerPromise: Promise<TessWorker | null> | null = null

/** One Tesseract worker for the tab. CDN paths so Next doesn’t have to bundle the wasm worker. */
function getTessWorker(): Promise<TessWorker | null> {
  if (workerPromise) return workerPromise
  workerPromise = (async () => {
    try {
      const mod = (await import('tesseract.js')) as {
        createWorker?: (
          langs?: string,
          oem?: number,
          options?: Record<string, unknown>,
        ) => Promise<TessWorker>
        PSM?: { SINGLE_LINE: string }
        default?: {
          createWorker?: (
            langs?: string,
            oem?: number,
            options?: Record<string, unknown>,
          ) => Promise<TessWorker>
          PSM?: { SINGLE_LINE: string }
        }
      }
      const createWorker = mod.createWorker || mod.default?.createWorker
      const psm = mod.PSM?.SINGLE_LINE || mod.default?.PSM?.SINGLE_LINE || '7'
      if (!createWorker) return null
      const worker = await createWorker('eng', 1, {
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        workerBlobURL: false, // CDN worker can’t be re-blobbed cross-origin
      })
      await worker.setParameters({ tessedit_pageseg_mode: psm })
      return worker
    } catch (err) {
      console.warn('Smart draw: text recognizer failed to load', err)
      workerPromise = null // Allow a later stroke to try again
      return null
    }
  })()
  return workerPromise
}

async function recognizeWithTesseract(strokes: InkPoint[][]): Promise<string | null> {
  const canvas = strokesToCanvas(strokes)
  if (!canvas) return null
  const worker = await getTessWorker()
  if (!worker) return null
  try {
    const { data } = await worker.recognize(canvas)
    return cleanText(data.text || '', data.confidence ?? 0)
  } catch (err) {
    console.warn('Smart draw: text recognition failed', err)
    return null
  }
}

/** Flow-space strokes → a word, or null if it doesn’t look like text. */
export async function recognizeInkText(strokes: Array<Array<[number, number] | [number, number, number]>>): Promise<string | null> {
  const ink = strokes
    .map((stroke) => stroke.map((p) => ({ x: p[0], y: p[1] })))
    .filter((stroke) => stroke.length > 1)
  if (ink.length === 0) return null
  const platform = await recognizeWithPlatform(ink)
  if (platform) return platform
  return recognizeWithTesseract(ink)
}
