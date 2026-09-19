'use client'

// Image chrome: hover toolbar (first menu) + More → actions menu (Resize / Remove BG / Blur / …).

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type LegacyRef,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  AlignCenter,
  ChevronRight,
  Copy,
  Crop,
  Download,
  Eraser,
  EyeOff,
  FolderInput,
  ImagePlus,
  Link2,
  MessageSquare,
  Monitor,
  MonitorPlay,
  MoreHorizontal,
  PencilLine,
  RefreshCw,
  Scaling,
  Sparkles,
  Trash2,
  ZoomIn,
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
  | 'askAI'
  | 'comment'
  | 'align'
  | 'display'
  | 'zoom'
  | 'copyImage'
  | 'caption'
  | 'turnInto'
  | 'copyLink'
  | 'duplicate'
  | 'moveTo'
  | 'delete'
  | 'suggestEdits'
  | 'presentFromHere'

/** Turn into targets the image menu can apply without leaving the bitmap. */
export type ImageTurnInto = 'text' | 'heading1' | 'heading2' | 'heading3' | 'quote' | 'code' | 'callout'

export type ImageMenuSubmenu = 'resize' | 'turnInto' | 'moreOptions'

/** Fraction of the contain-fit size (100% = full image visible in the frame; height may limit). */
export type ImageResizePreset = 25 | 50 | 75 | 100

type Anchor = { left: number; top: number; width: number; height: number }

const RESIZE_PRESETS: { pct: ImageResizePreset; label: string }[] = [
  { pct: 25, label: 'Small' },
  { pct: 50, label: 'Medium' },
  { pct: 75, label: 'Large' },
  { pct: 100, label: 'Full' }, // Contain-fit — whole image in frame, not width-only
]

const TURN_INTO: { id: ImageTurnInto; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'heading1', label: 'Heading 1' },
  { id: 'heading2', label: 'Heading 2' },
  { id: 'heading3', label: 'Heading 3' },
  { id: 'quote', label: 'Quote' },
  { id: 'code', label: 'Code' },
  { id: 'callout', label: 'Callout' },
]

type HoverTool =
  | { kind: 'sep' }
  | { kind: 'action'; id: ImageBlockMenuAction; label: string; icon: ReactNode; text?: boolean }

/** Notion image toolbar — Ask AI, then icon actions, More always last. */
const HOVER_TOOLS: HoverTool[] = [
  { kind: 'action', id: 'askAI', label: 'Ask AI', text: true, icon: <Sparkles className="h-3.5 w-3.5" /> },
  { kind: 'sep' },
  { kind: 'action', id: 'comment', label: 'Comment', icon: <MessageSquare className="h-3.5 w-3.5" /> },
  { kind: 'action', id: 'align', label: 'Alignment', icon: <AlignCenter className="h-3.5 w-3.5" /> },
  { kind: 'action', id: 'display', label: 'Display', icon: <Monitor className="h-3.5 w-3.5" /> },
  { kind: 'action', id: 'crop', label: 'Crop', icon: <Crop className="h-3.5 w-3.5" /> },
  { kind: 'action', id: 'zoom', label: 'Full size', icon: <ZoomIn className="h-3.5 w-3.5" /> },
  { kind: 'action', id: 'download', label: 'Download', icon: <Download className="h-3.5 w-3.5" /> },
  { kind: 'action', id: 'more', label: 'More', icon: <MoreHorizontal className="h-3.5 w-3.5" /> },
]

type HoverToolbarProps = {
  moreOpen: boolean
  chromeScale?: number // Screen-constant counter-scale (1/zoom — same family as frame resize dots)
  onAction: (action: ImageBlockMenuAction) => void
  toolbarRef?: RefObject<HTMLDivElement | null> // More menu anchors to this pill
}

/** First image menu — absolute on the bitmap (same pill metrics as board title open chrome). */
export function ImageBlockHoverToolbar({
  moreOpen,
  chromeScale = 1,
  onAction,
  toolbarRef,
}: HoverToolbarProps) {
  const fullLayoutWRef = useRef(0) // Unscaled full-pill width — keep it after we fold
  const foldedRef = useRef(false) // Latest fold flag for the resize observer (no stale closure)
  const [folded, setFolded] = useState(false) // Narrow bitmap: pill is only More
  const visible = folded ? HOVER_TOOLS.filter((t) => t.kind === 'action' && t.id === 'more') : HOVER_TOOLS

  // Fold the Notion toolbar into More when the scaled pill would stick out of the bitmap.
  useLayoutEffect(() => {
    const root = toolbarRef?.current
    const host = root?.parentElement // Media box the pill is absolutely pinned to
    if (!root || !host) return
    const sync = () => {
      if (!foldedRef.current && root.offsetWidth > 0) fullLayoutWRef.current = root.offsetWidth
      const fullW = fullLayoutWRef.current
      if (fullW < 1) return
      const edge = parseFloat(getComputedStyle(root).right) || 0 // right-1, same px as clientWidth
      const visualW = fullW * chromeScale // scale() does not change offsetWidth
      const fits = host.clientWidth + 0.5 >= visualW + edge // Left edge must stay inside the bitmap
      const next = !fits
      if (foldedRef.current === next) return
      foldedRef.current = next
      setFolded(next)
    }
    sync()
    const ro = new ResizeObserver(sync) // Side-drag / contain-fit changes the media box
    ro.observe(host)
    return () => ro.disconnect()
  }, [chromeScale, toolbarRef])

  // Screen-constant scale (1/zoom) — keep pill size stable while the board zooms
  const style: CSSProperties = {
    transform: chromeScale !== 1 ? `scale(${chromeScale})` : undefined,
    transformOrigin: 'top right',
  }

  return (
    <div
      ref={toolbarRef as LegacyRef<HTMLDivElement> | undefined} // useRef(null) is RefObject<T | null>; div ref still wants LegacyRef
      data-tt-image-menu
      data-tt-image-hover-toolbar
      className="tt-image-block-hover-toolbar nodrag nopan absolute right-1 top-1 z-[2]"
      style={style}
      contentEditable={false}
      onMouseDown={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {visible.map((t) =>
        t.kind === 'sep' ? (
          <span key="sep" className="tt-image-block-hover-sep" aria-hidden />
        ) : (
          <button
            key={t.id}
            type="button"
            title={t.label}
            aria-label={t.label}
            aria-expanded={t.id === 'more' ? moreOpen : undefined}
            className={cn(
              'tt-image-block-hover-btn nodrag nopan',
              t.text && 'tt-image-block-hover-btn-text',
              t.id === 'more' && moreOpen && 'tt-image-block-hover-btn-active'
            )}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onAction(t.id)
            }}
          >
            {t.icon}
            {t.text ? <span>{t.label}</span> : null}
          </button>
        )
      )}
    </div>
  )
}

type MenuRow = {
  id: ImageBlockMenuAction
  label: string
  icon: ReactNode
  shortcut?: string
  submenu?: ImageMenuSubmenu
  muted?: boolean // Delete reads lighter, like Notion
  beta?: boolean
}

type ImageBlockMenuProps = {
  anchor: Anchor
  widthPct: number
  hazed: boolean
  initialSubmenu?: ImageMenuSubmenu | null // Toolbar Display / Alignment opens a flyout immediately
  onAction: (
    action: ImageBlockMenuAction,
    payload?: { widthPct?: ImageResizePreset; blockType?: ImageTurnInto }
  ) => void
  onClose: () => void
}

/** Second image menu — Notion block menu, plus Resize / Crop / Remove background / Blur. */
export function ImageBlockMenu({
  anchor,
  widthPct,
  hazed,
  initialSubmenu = null,
  onAction,
  onClose,
}: ImageBlockMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [openSubmenu, setOpenSubmenu] = useState<ImageMenuSubmenu | null>(initialSubmenu)
  // Drop under the hover pill (anchor is the in-flow toolbar’s screen box)
  const anchorX = anchor.left + anchor.width - 8
  const anchorY = anchor.top + anchor.height + 4

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    setOpenSubmenu(initialSubmenu)
  }, [initialSubmenu])

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

  const icon = 'h-4 w-4'
  const sections: { id: string; header?: string; rows: MenuRow[] }[] = [
    {
      id: 'image',
      header: 'Image',
      rows: [
        { id: 'turnInto', label: 'Turn into', icon: <RefreshCw className={icon} />, submenu: 'turnInto' },
        { id: 'resize', label: 'Resize', icon: <Scaling className={icon} />, submenu: 'resize' },
        { id: 'crop', label: 'Crop', icon: <Crop className={icon} /> },
        { id: 'removeBackground', label: 'Remove background', icon: <Eraser className={icon} /> },
        { id: 'blur', label: hazed ? 'Unblur' : 'Blur', icon: <EyeOff className={icon} /> },
        { id: 'replace', label: 'Replace', icon: <ImagePlus className={icon} /> },
        { id: 'copyImage', label: 'Copy image', icon: <Copy className={icon} /> },
        { id: 'download', label: 'Download', icon: <Download className={icon} /> },
        { id: 'caption', label: 'Caption', icon: <Monitor className={icon} />, shortcut: '⌘⌥M' },
        { id: 'more', label: 'More options', icon: <MoreHorizontal className={icon} />, submenu: 'moreOptions' },
      ],
    },
    {
      id: 'block',
      rows: [
        { id: 'copyLink', label: 'Copy link to block', icon: <Link2 className={icon} />, shortcut: '⌘⌃L' },
        { id: 'duplicate', label: 'Duplicate', icon: <Copy className={icon} />, shortcut: '⌘D' },
        { id: 'moveTo', label: 'Move to', icon: <FolderInput className={icon} />, shortcut: '⌘⇧P' },
        { id: 'delete', label: 'Delete', icon: <Trash2 className={icon} />, shortcut: 'Del', muted: true },
      ],
    },
    {
      id: 'collab',
      rows: [
        { id: 'comment', label: 'Comment', icon: <MessageSquare className={icon} />, shortcut: '⌘⇧M' },
        { id: 'suggestEdits', label: 'Suggest edits', icon: <PencilLine className={icon} />, shortcut: '⌘⇧⌥X' },
      ],
    },
    {
      id: 'present',
      rows: [
        {
          id: 'presentFromHere',
          label: 'Present from here',
          icon: <MonitorPlay className={icon} />,
          shortcut: '⌘⌥P',
          beta: true,
        },
      ],
    },
    {
      id: 'ai',
      rows: [{ id: 'askAI', label: 'Ask AI', icon: <Sparkles className={icon} />, shortcut: '⌘J' }],
    },
  ]
  const q = query.trim().toLowerCase()
  const visibleSections = sections
    .map((section) => ({
      ...section,
      header: q ? undefined : section.header, // Search drops the Image label
      rows: q ? section.rows.filter((row) => row.label.toLowerCase().includes(q)) : section.rows,
    }))
    .filter((section) => section.rows.length > 0)

  return createPortal(
    <div
      ref={rootRef}
      tabIndex={-1}
      data-tt-image-menu
      className="fixed z-[1002] w-[300px] tt-menu-surface rounded-lg shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-1 outline-none"
      onMouseDown={(e) => {
        e.stopPropagation()
        if ((e.target as HTMLElement | null)?.closest?.('input')) return // Let the search field take the caret
        e.preventDefault()
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
      <div className="px-1.5 pt-1 pb-1">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actions..."
          className="w-full h-8 px-2 text-sm rounded-md bg-gray-50 dark:bg-[#2a2a2a] border border-gray-200 dark:border-[#3a3a3a] outline-none text-gray-900 dark:text-gray-100"
        />
      </div>
      <div data-tt-menu-body className="flex min-h-0 max-h-[70vh] flex-col gap-0.5 overflow-y-auto px-0.5 pb-0.5">
        {visibleSections.length === 0 && (
          <div className="px-2 py-2 text-xs text-gray-400">No matching actions</div>
        )}
        {visibleSections.map((section, sectionIndex) => (
          <div key={section.id} className="flex w-full flex-col">
            {/* Column, not a wrapping row — ghost buttons are inline-flex and otherwise sit side by side */}
            {sectionIndex > 0 && !q && (
              <div className="my-1 h-px bg-gray-100 dark:bg-[#2f2f2f] mx-1" />
            )}
            {section.header && (
              <div className="px-2.5 pt-1.5 pb-1 text-xs text-gray-500 dark:text-gray-400">{section.header}</div>
            )}
            {section.rows.map((row) => {
              const subOpen = row.submenu != null && openSubmenu === row.submenu
              return (
                <Button
                  key={row.id}
                  variant="ghost"
                  size="sm"
                  onMouseEnter={() => setOpenSubmenu(row.submenu ?? null)}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (row.submenu) {
                      setOpenSubmenu((s) => (s === row.submenu ? null : row.submenu!))
                      return
                    }
                    onAction(row.id)
                  }}
                  className={cn(
                    'h-8 w-full shrink-0 justify-start px-2 text-sm font-normal',
                    subOpen && 'bg-gray-100 dark:bg-[#2a2a2a]',
                    row.muted && 'text-gray-400'
                  )}
                >
                  <span className={cn('mr-2 text-gray-500 dark:text-gray-400', row.muted && 'text-gray-400')}>
                    {row.icon}
                  </span>
                  <span className="flex-1 text-left">{row.label}</span>
                  {row.beta && (
                    <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500 dark:bg-[#2a2a2a]">
                      Beta
                    </span>
                  )}
                  {row.shortcut && (
                    <span className="ml-2 text-[11px] text-gray-400 tabular-nums">{row.shortcut}</span>
                  )}
                  {row.submenu && <ChevronRight className="h-3.5 w-3.5 ml-1 text-gray-400" />}
                </Button>
              )
            })}
          </div>
        ))}
      </div>

      {openSubmenu && (
        <div
          data-tt-menu-flyout="main"
          data-tt-image-menu
          className="absolute z-[1003] min-w-[160px] tt-menu-surface rounded-lg shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-1"
          onMouseEnter={() => setOpenSubmenu(openSubmenu)}
        >
          {openSubmenu === 'resize' &&
            RESIZE_PRESETS.map((opt) => (
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
          {openSubmenu === 'turnInto' &&
            TURN_INTO.map((opt) => (
              <Button
                key={opt.id}
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onAction('turnInto', { blockType: opt.id })
                }}
                className="justify-start text-sm h-8 px-2 font-normal w-full"
              >
                <span className="flex-1 text-left">{opt.label}</span>
              </Button>
            ))}
          {openSubmenu === 'moreOptions' &&
            (
              [
                { id: 'align' as const, label: 'Alignment' },
                { id: 'display' as const, label: 'Display' },
                { id: 'zoom' as const, label: 'Full size' },
              ] as const
            ).map((opt) => (
              <Button
                key={opt.id}
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onAction(opt.id)
                }}
                className="justify-start text-sm h-8 px-2 font-normal w-full"
              >
                <span className="flex-1 text-left">{opt.label}</span>
              </Button>
            ))}
        </div>
      )}
    </div>,
    document.body
  )
}
