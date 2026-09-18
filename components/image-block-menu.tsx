'use client'

// Image chrome: hover toolbar (first menu) + More → actions menu (Resize / Remove BG / Blur / …).

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronRight,
  Crop,
  Download,
  Eraser,
  EyeOff,
  ImagePlus,
  MoreHorizontal,
  Scaling,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { applyMenuPlacement, watchMenuSafeRect } from '@/lib/menu-placement'

export type ImageBlockMenuAction =
  | 'resize'
  | 'crop'
  | 'removeBackground'
  | 'blur'
  | 'replace'
  | 'download'
  | 'more'

/** Fraction of the contain-fit size (100% = full image visible in the frame; height may limit). */
export type ImageResizePreset = 25 | 50 | 75 | 100

type Anchor = { left: number; top: number; width: number; height: number }

const RESIZE_PRESETS: { pct: ImageResizePreset; label: string }[] = [
  { pct: 25, label: 'Small' },
  { pct: 50, label: 'Medium' },
  { pct: 75, label: 'Large' },
  { pct: 100, label: 'Full' }, // Contain-fit — whole image in frame, not width-only
]

type HoverToolbarProps = {
  moreOpen: boolean
  chromeScale?: number // Same √ comfort curve as boardLink open chrome (transform-only)
  onAction: (action: ImageBlockMenuAction) => void
  toolbarRef?: RefObject<HTMLDivElement | null> // More menu anchors to this pill
}

/** First image menu — absolute on the bitmap (rides RF pan like board title open chrome). */
export function ImageBlockHoverToolbar({
  moreOpen,
  chromeScale = 1,
  onAction,
  toolbarRef,
}: HoverToolbarProps) {
  const tools: { id: ImageBlockMenuAction; label: string; icon: ReactNode }[] = [
    { id: 'crop', label: 'Crop', icon: <Crop className="h-3.5 w-3.5" /> },
    { id: 'download', label: 'Download', icon: <Download className="h-3.5 w-3.5" /> },
    { id: 'more', label: 'More', icon: <MoreHorizontal className="h-3.5 w-3.5" /> },
  ]

  const style: CSSProperties = {
    transform: chromeScale !== 1 ? `scale(${chromeScale})` : undefined,
    transformOrigin: 'top right', // Shrink toward the image corner
  }

  return (
    <div
      ref={toolbarRef}
      data-tt-image-menu
      data-tt-image-hover-toolbar
      className={cn(
        'tt-image-block-hover-toolbar nodrag nopan',
        'absolute right-1 top-1 z-[2] flex items-center gap-0.5 rounded-md px-1 py-0.5',
        // Glass pill — same family as .tt-board-link-preview
        'border border-black/10 bg-white/60 shadow-sm backdrop-blur-sm',
        'dark:border-white/10 dark:bg-[#1f1f1f]/80'
      )}
      style={style}
      contentEditable={false}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          aria-label={t.label}
          aria-expanded={t.id === 'more' ? moreOpen : undefined}
          className={cn(
            'inline-flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/10',
            t.id === 'more' && moreOpen && 'bg-black/5 dark:bg-white/10'
          )}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onAction(t.id)
          }}
        >
          {t.icon}
        </button>
      ))}
    </div>
  )
}

type ImageBlockMenuProps = {
  anchor: Anchor
  widthPct: number
  hazed: boolean
  onAction: (action: ImageBlockMenuAction, payload?: { widthPct?: ImageResizePreset }) => void
  onClose: () => void
}

/** Second image menu — opens from More on the hover toolbar. */
export function ImageBlockMenu({
  anchor,
  widthPct,
  hazed,
  onAction,
  onClose,
}: ImageBlockMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [openSubmenu, setOpenSubmenu] = useState<'resize' | null>(null)
  // Drop under the hover pill (anchor is the in-flow toolbar’s screen box)
  const anchorX = anchor.left + anchor.width - 8
  const anchorY = anchor.top + anchor.height + 4

  useEffect(() => {
    rootRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const place = () =>
      applyMenuPlacement(root, {
        anchorX,
        anchorY,
        openLeft: true, // Expand left from image top-right so it stays over the bitmap
        fromExisting: openSubmenu != null,
      })
    place()
    const raf = requestAnimationFrame(place)
    const stop = watchMenuSafeRect(place)
    return () => {
      cancelAnimationFrame(raf)
      stop()
    }
  }, [anchorX, anchorY, openSubmenu])

  const rows = [
    {
      id: 'resize' as const,
      label: 'Resize',
      icon: <Scaling className="h-4 w-4" />,
      submenu: 'resize' as const,
    },
    {
      id: 'crop' as const,
      label: 'Crop',
      icon: <Crop className="h-4 w-4" />,
    },
    {
      id: 'removeBackground' as const,
      label: 'Remove background',
      icon: <Eraser className="h-4 w-4" />,
    },
    {
      id: 'blur' as const,
      label: hazed ? 'Unblur' : 'Blur',
      icon: <EyeOff className="h-4 w-4" />,
    },
    {
      id: 'replace' as const,
      label: 'Replace',
      icon: <ImagePlus className="h-4 w-4" />,
    },
    {
      id: 'download' as const,
      label: 'Download',
      icon: <Download className="h-4 w-4" />,
    },
  ]

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      data-tt-image-menu
      className="fixed z-[1002] w-[220px] tt-menu-surface rounded-lg shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-1 outline-none"
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          if (openSubmenu) setOpenSubmenu(null)
          else onClose()
        }
      }}
    >
      <div className="px-2.5 pt-1.5 pb-1 text-xs text-gray-500 dark:text-gray-400">Image</div>
      <div data-tt-menu-body className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-0.5 pb-0.5">
        {rows.map((row) => {
          const hasSub = row.submenu === 'resize'
          const resizeOpen = hasSub && openSubmenu === 'resize'
          return (
            <Button
              key={row.id}
              variant="ghost"
              size="sm"
              onMouseEnter={() => {
                if (hasSub) setOpenSubmenu('resize')
                else setOpenSubmenu(null)
              }}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (hasSub) {
                  setOpenSubmenu((s) => (s === 'resize' ? null : 'resize'))
                  return
                }
                onAction(row.id)
              }}
              className={cn(
                'h-8 shrink-0 justify-start px-2 text-sm font-normal',
                resizeOpen && 'bg-gray-100 dark:bg-[#2a2a2a]'
              )}
            >
              <span className="mr-2 text-gray-500 dark:text-gray-400">{row.icon}</span>
              <span className="flex-1 text-left">{row.label}</span>
              {hasSub && <ChevronRight className="h-3.5 w-3.5 ml-1 text-gray-400" />}
            </Button>
          )
        })}
      </div>

      {openSubmenu === 'resize' && (
        <div
          data-tt-menu-flyout="main"
          data-tt-image-menu
          className="absolute z-[1003] min-w-[160px] tt-menu-surface rounded-lg shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-1"
          onMouseEnter={() => setOpenSubmenu('resize')}
        >
          {RESIZE_PRESETS.map((opt) => (
            <Button
              key={opt.pct}
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onAction('resize', { widthPct: opt.pct })
              }}
              className={cn(
                'justify-start text-sm h-8 px-2 font-normal w-full',
                widthPct === opt.pct && 'tt-selected'
              )}
            >
              <span className="flex-1 text-left">{opt.label}</span>
              <span className="text-[11px] text-gray-400 tabular-nums">{opt.pct}%</span>
            </Button>
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}
