'use client'

// Custom React Flow node for chat panels (prompt + response)
import { NodeProps, Handle, Position, useReactFlow, useStore, useStoreApi, NodeResizeControl, useUpdateNodeInternals } from 'reactflow' // RF node primitives + store (unselect groups before dragItems) + remeasure; useStore = live zoom for screen-constant chrome
import {
  useIsThreadConnecting,
  useNearThreadConnectionSides,
  THREAD_SIDE_BIT,
  THREAD_CONNECTION_BOX,
  ConnectionIndicator,
  frameScreenChromeScale,
  INDICATOR_OUTSET,
} from '@/components/threads' // Miro: DOM indicators arm edge connection points; proximity while dragging
import {
  useChatFrameLinkLogoSides,
} from '@/lib/ai/chat-frame-link-cues' // Chat-linked sides → logo line beside simulator
import { ChatLinkConnectionCue } from '@/components/threads/ChatLinkConnectionCue'
import { LiveFrameChromeZoom } from '@/components/live-frame-chrome-zoom' // Live zoom → chrome CSS vars
import {
  GROUP_COMMENTS_EVENT, // Group box reactions button
  GROUP_TRANSFORM_EVENT, // Group resize / rotate
  clearLiveGroupGeom, // Drop published geometry on unmount
  publishLiveGroupGeom, // Painted scale / angle for the group box
  useGroupMultiSelect, // Hide handles when 2+ objects are selected
  type GroupTransformDetail,
} from '@/lib/group-selection'
import {
  BLOCK_HANDLE_GUTTER_W,
  CONNECTIONS_GROUP_H,
  DB_ROWS_REVEAL_FOOTER_H,
  adjustChromeXFlow,
  adjustGapYFlow,
  handleGutterFlowPx,
  selectedAdjustChromeY,
  blockGripChromeScale,
  screenPadFlow,
} from '@/lib/frame-adjust-box' // Gutter = painted ⋮⋮ width + small air; wrap bar uses ⋮⋮ chrome scale

import { cn, generateUUID } from '@/lib/utils'
import { useShowFrameConnections } from '@/lib/show-frame-connections' // More → Connections → Show connections
import { boardTitleOrDefault } from '@/lib/board-title' // Empty conversation names show New board
import { resolveFrameBorderColor, resolveFrameFillColor, FRAME_BORDER_WEIGHT } from '@/lib/frame-colors' // Soften / upgrade legacy preset frame colors; fixed stroke width
import { useEditor, EditorContent } from '@tiptap/react'
import { DOMParser as PMDOMParser } from '@tiptap/pm/model' // Parse stored HTML → PM doc for exact (non-string) sync compare
import { TextSelection } from '@tiptap/pm/state' // Only text ranges keep a frame "active" — not boardLink NodeSelection
import { createPanelExtensions } from '@/lib/tiptap/extensions' // StarterKit + Turn into nodes
import { useBoardCollab } from '@/lib/collab/board-collab-context' // Yjs frame fragments + carets
import { isIbarLiveCreate } from '@/lib/ibar-live-create' // In-session I-bar creates skip Yjs
import { handleCaptureLinkPaste } from '@/lib/tiptap/capture-link-paste' // Paste capture URL → named link
import { TipTapBlockHandles } from '@/components/tiptap-block-handles' // Per-content-block ⋮⋮ (Notion)
import { FrameStackRevealLine } from '@/components/frame-stack-reveal-line' // Stack edge dashed line → reveal
import { FrameShapeBackdrop } from '@/components/frame-shape-backdrop' // SVG silhouette behind TipTap
import {
  frameShapeClipCss,
  parseFrameShape,
  FRAME_SHAPE_DEFAULT_SIZE,
  rotatedFrameAabbSize,
  rotatedRectAabbSize,
  shapeFitContentBox,
  shapeContentFitScale, // Free-resize contain inside the silhouette
  type FrameShapeType,
} from '@/lib/frame-shape' // Frame-as-shape parse + clip + rotation AABB
import type { FrameStackSide } from '@/components/use-frame-nest-stack-drag'
import {
  applySnapMateRelayout,
  isStackCollapsedMeta, // Collapsed stack mates stay hidden when a property reveals the frame
  persistSnapMateRelayout,
} from '@/components/use-frame-nest-stack-drag' // Repark snap mates when AABB changes (rotation)
import { isHiddenByLiveBoardFilter } from '@/lib/board-frame-filters' // “Contains property” reads node HTML, not the editor
import {
  FRAME_STACK_SIDES,
  readSideStacks,
} from '@/lib/frame-side-stacks' // Per adjust-box side stack trees
import { findEditorBlockAtClientPoint } from '@/lib/tiptap/block-selection' // Click in frame padding → block (rotation-safe)
import { useLiveBoardZoom } from '@/lib/use-live-board-zoom' // Viewport-CSS zoom (not lagging RF store)
import {
  getLiveBoardZoom,
} from '@/lib/frame-chrome-zoom' // Select-time pad + fill-origin for live rAF glue
import {
  isBoardNavigating,
  subscribeBoardNavigating,
} from '@/lib/board-navigating' // Skip hug / stack work while pinching; selected chrome uses live zoom
import { isFrameDragging } from '@/lib/frame-dragging' // Skip O(n) stack scans mid frame drag
import {
  captureFrameSnapshot,
  dbExpandSnapshotSlot,
  frameSnapshotKey,
  getFrameSnapshotEpoch,
  readFrameSnapshot,
  subscribeFrameSnapshots,
} from '@/lib/frame-dom-snapshot' // Cold frames replay the live subtree instead of approximating it
import {
  isPhoneLikeBoard,
  PHONE_FRAME_PAINT_MAX_PX,
} from '@/lib/phone-frame-budget' // Phone: big frames must not get their own Safari layer
import { setFramePanelSelected } from '@/lib/frame-panel-selected' // DB NodeView: live table only while RF-selected
import {
  clearFrameTextEditActive,
  setFrameTextEditActive,
  isFrameTextEditActive,
  isEditorAutoSelectSuppressed,
  subscribeFrameTextEdit,
} from '@/lib/frame-text-edit' // Select-before-caret: Delete removes frame until caret is placed
import {
  fillOriginFromFlowPosition,
  flowPositionFromFillOrigin,
  readFrameChromePad,
} from '@/lib/frame-chrome-offset' // Fill-origin vs RF position when ⋮⋮ gutter is on
import { readOnThread } from '@/lib/threads/on-thread-frame' // Compact chip layout for frames on threads
import {
  deleteLinkedBoardForBlock,
  frameHasChromeProperties,
  getLinkedBoardId,
  isBlockContentEmpty,
  isBlockMeta,
  isBoardBodyMeta,
  readNotionConnection,
  type NotionSyncMode,
  normalizeNotionSyncMode,
  isNotionAutoSync,
  notionPageBodySyncTarget,
} from '@/lib/blocks' // Block detection + Notion connection
import {
  readFramePropertyType,
  isPropertyTypeId,
  type PropertyTypeId,
} from '@/lib/blocks/property' // Property type ids — cells live in the frame
import {
  htmlHasPropertyBlocks,
  htmlAppendHeaderProperty,
  readPropertyBlockHeadersFromDoc,
  readPropertyBlockHeadersFromHtml,
  readPropertyBlockAt,
  updatePropertyBlockAttrs,
  insertPropertyBlockBeside,
  insertFrameProperty,
  duplicatePropertyBlock,
  deletePropertyBlock,
  type PropertyHeaderItem,
} from '@/lib/tiptap/property-block' // Top icons = empty propertyBlocks only
import {
  bindPropertyIconDrag,
  resolvePropertyHeaderFrom,
  type PropertyDropLine,
} from '@/lib/tiptap/property-block-drag' // Drag between property cells
import { PropertyDropLinePortal } from '@/components/property-drop-line-portal' // Blue dashed insert line
import type { Editor } from '@tiptap/core' // Property header drag + popup edits
import { PropertyIconWithTooltip } from '@/components/property-icon-with-tooltip' // Top-strip icon + name popup
import { PropertyMenu, type PropertyMenuAction } from '@/components/property-menu' // Icon click → property menu

import { NotionMarkIcon } from '@/components/notion-mark-icon' // Logo at bottom of a Notion-connected frame
import { createPortal } from 'react-dom'
import {
  FrameContentShimmer,
  frameHasVisibleText,
  shimmerBarCountFromHtml,
  BOARD_LOAD_FADE_MS,
  resolveDeferredFrameBox,
  parseBoardLinkPreview,
  type DeferredFrameBox,
} from '@/components/frame-content-shimmer' // Frame vs text-line load shell while TipTap mounts
import {
  useFrameContentMountReason,
  useWarmFrameContentMount,
} from '@/components/frame-viewport-mount-context' // Defer TipTap until the frame is interacted with
import { pruneEmptyTextblocks, isEmptyTextblock } from '@/lib/tiptap/empty-block-backspace' // Strip blank lines on frame deselect
import { setAiTextSelection } from '@/lib/ai/selection-bridge' // Live highlighted-text pills in AI composer
import { BlockActionsMenu, type BoardInTarget, type FrameAlignX } from '@/components/block-actions-menu'
import { watchBoardViewportNav, dismissMenuUnlessBoardNav } from '@/lib/board-nav-menu' // Connection menu stays on the mark through pan/zoom
import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, useSyncExternalStore, Fragment, memo } from 'react'
import { MoreHorizontal, Trash2, Loader2, X, ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft, Plus, RotateCw, ScanText, FileText } from 'lucide-react' // Rotate + fit; FileText = deferred boardLink fallback icon
import { useAiEditSession } from '@/lib/ai/edit-session' // Pending rainbow / review focus

// Helper to check if content is effectively empty (handling HTML tags)
const isContentEmpty = (content: string | undefined | null) => {
  if (!content) return true
  if (content === '<p></p>' || content === '<p><br></p>') return true
  // Also strip all tags to be sure
  const stripped = content.replace(/<[^>]*>/g, '').trim()
  return stripped.length === 0
}

const BOARD_LINK_ICON_W = 22 // Title emoji / page icon column
const BOARD_OPEN_MENU_W = 52 // Open-menu pill ≈ preview + open (Notion adds a bit more)
const BLOCK_THREE_CHARS_W = 28 // ~3ch of body text for plain frames
const BLOCK_MIN_FRAME_H = 22 // One line (~18 at lh 1.25) + equal 2px content pads — hug the block, don't float chrome
const ROTATE_CLICK_SLOP_PX = 4 // Rotate button: below this pointer travel → click resets; above → drag rotate
const BLOCK_FRAME_PAD_Y = 2 // Top/bottom inset inside the fill — tight to glyphs
const BLOCK_FRAME_PAD_X = 2 // Match T/B so the peach edge sits close to blocks
const BLOCK_FRAME_PAD = BLOCK_FRAME_PAD_X // Default / band inset = horizontal pad

/** Frame menu Alignment — default left / top. */
function parseFrameAlignX(v: unknown): FrameAlignX {
  return v === 'center' || v === 'right' ? v : 'left'
}
/** Frame fill corner radius at scale 1 — square (0); adjust ring stays square too */
const FRAME_CORNER_RADIUS = 0
/** Peach air between fill edge and the in-flow board preview block */
const PREVIEW_INSET_PX = 8
/** Title row + 360 card + bottom inset — floor so a clipped parent cannot hug short */
const PREVIEW_BLOCK_MIN_H = PREVIEW_HEIGHT + PREVIEW_INSET_PX + 24

/** In-block preview column height (card + wrap pad), 0 if closed. */
function previewCardHeight(root: HTMLElement): number {
  const embed = root.querySelector('[data-page-preview]') as HTMLElement | null
  if (!embed) return 0
  const wrap = (embed.closest('.tt-board-link-embed') as HTMLElement | null) || embed // Includes pt/pb
  return Math.max(wrap.offsetHeight, PREVIEW_BLOCK_MIN_H)
}
/** Corner-drag floor — small but grab-able; grow stays unbounded (RF max = MAX_VALUE). */
const FRAME_RESIZE_MIN = 40
/** Locked scale epsilon — avoid 0; no 0.15 floor (shrink matches grow). */
const FRAME_SCALE_EPSILON = 0.001
/** Chat bubble with two centered text lines — Lucide MessageSquare body, not the 3 left-ragged lines. */
function ReactionsChatIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
      <path d="M8 9h8" />
      <path d="M9.5 13h5" />
    </svg>
  )
}
const DATABASE_BLOCK_HTML_RE = /data-type=["']databaseBlock["']/i // TipTap Notion DB atom in frame HTML
const FRAME_ATOM_HTML_RE =
  /data-type=["'](?:boardLink|pageLink|captureLink|databaseBlock|imageBlock|videoBlock|audioBlock|fileBlock|bookmarkBlock|propertyBlock)["']/i // Attr-only TipTap atoms
const MIN_DATABASE_FRAME_W = 240 // Below this a DB frame is a collapsed stub (grip + title only)
const MIN_DATABASE_FRAME_H = 120 // Title row alone is ~40; table needs more height than that

/** True when this frame's TipTap HTML embeds a Notion databaseBlock. */
function hasDatabaseBlockHtml(html: string): boolean {
  return DATABASE_BLOCK_HTML_RE.test(html || '')
}

/** True when HTML carries boardLink / property / DB / image atoms (must not wipe on drag). */
function hasFrameAtomHtml(html: string): boolean {
  return FRAME_ATOM_HTML_RE.test(html || '')
}

/** Count propertyBlock atoms — row cards lose these when NodeViews remount mid-drag. */
function countPropertyBlocks(html: string): number {
  const m = (html || '').match(/data-type=["']propertyBlock["']/gi)
  return m ? m.length : 0
}

/** Row→card frames (boardLink + property cells) — not sole databaseBlock tables. */
function isRowCardAtomHtml(html: string): boolean {
  return countPropertyBlocks(html) > 0
}

/** Post-drag hug sometimes measures a remounting DB NodeView as ~52×40 and persists it — reject those. */
function isCollapsedDatabaseFrameSize(width: number, height: number): boolean {
  return width < MIN_DATABASE_FRAME_W || height < MIN_DATABASE_FRAME_H
}

/** Min frame width: boardLink → (optional grip)+icon+menu; plain text → (optional grip)+3 letters. */
function blockMinFrameWidth(html: string, withGutter = true): number {
  const gutter = withGutter ? BLOCK_HANDLE_GUTTER_W : 0 // Unselected frames omit the ⋮⋮ column
  if (/data-type="boardLink"/i.test(html || '')) {
    return gutter + BOARD_LINK_ICON_W + BOARD_OPEN_MENU_W
  }
  return gutter + BLOCK_THREE_CHARS_W
}

const BLOCK_MIN_FRAME_W = BLOCK_HANDLE_GUTTER_W + BOARD_LINK_ICON_W + BOARD_OPEN_MENU_W // Default / boardLink floor
const BLOCK_LOCKED_MIN_W = BLOCK_HANDLE_GUTTER_W + BLOCK_THREE_CHARS_W // Absolute floor when hugging
const GRIP_ICON_INSET = 2 // ⋮⋮ glyph (16px) centered in its 20px hit button → (20-16)/2 from the gutter left

/** Axis-aligned box that contains a w×h rect rotated by `deg` degrees (around center). */
function rotatedAabbSize(w: number, h: number, deg: number): { width: number; height: number } {
  return rotatedRectAabbSize(w, h, deg)
}

/**
 * Invert AABB → unrotated content size at `deg`.
 * Near 45° the map is singular — fall back to uniform scale from `fallback`.
 */
function contentSizeFromAabb(
  aabbW: number,
  aabbH: number,
  deg: number,
  fallback: { width: number; height: number }
): { width: number; height: number } {
  const rad = (deg * Math.PI) / 180
  const c = Math.abs(Math.cos(rad))
  const s = Math.abs(Math.sin(rad))
  const det = c * c - s * s // cos(2θ)
  if (Math.abs(det) < 1e-3) {
    const prev = rotatedAabbSize(fallback.width, fallback.height, deg)
    const scale = Math.min(
      aabbW / Math.max(1, prev.width),
      aabbH / Math.max(1, prev.height)
    )
    return {
      width: Math.max(1, fallback.width * scale),
      height: Math.max(1, fallback.height * scale),
    }
  }
  return {
    width: Math.max(1, (c * aabbW - s * aabbH) / det),
    height: Math.max(1, (c * aabbH - s * aabbW) / det),
  }
}

// Wrap-mode property column — the value re-wraps to the frame box, so the intrinsic hug uses
// this nominal column (mirrors Notion `defaultColumnWidthPx`) instead of the full glyph run.
const PROPERTY_VALUE_WRAP_W = 160

/**
 * Natural content width = longest rendered line of real text, not the stretched w-full box.
 * Pure measurement via Range (actual glyph extents) — children are width:100%, so offsetWidth /
 * scrollWidth report the frame width, not the text. Never mutates live styles (RO-safe).
 */
function measureTextWidthLocal(text: string, fontEl: Element): number {
  const trimmed = text.trim() // Ignore leading/trailing space so hug matches painted glyphs
  if (!trimmed) return 0 // Empty → no contribution (placeholder handled by caller)
  const span = document.createElement('span') // Off-tree probe — must not mutate live layout / RO
  const cs = getComputedStyle(fontEl) // Copy used font (transform does not change computed px)
  span.style.position = 'absolute' // Stay out of document flow
  span.style.visibility = 'hidden' // Invisible; still laid out so gBCR is real
  span.style.whiteSpace = 'nowrap' // One line — same as fit-to-text cells
  span.style.font = cs.font // Match the cell/title face + size
  span.textContent = trimmed // Glyph run to measure
  document.body.appendChild(span) // Body is outside the RF viewport transform
  // gBCR here is already local CSS px (no board zoom). Do not ÷ zoom — that inflated
  // row-card titles / property values on zoom-out and grew the fill.
  const w = span.getBoundingClientRect().width
  span.remove() // Drop the probe
  return w // Local px for hug
}

/** Filled property cell — icon + value box (never the width:100% stretch of the textarea). */
function measurePropertyBlockWidth(block: HTMLElement): number {
  if (block.getAttribute('data-header-only') === 'true') return 0
  if (getComputedStyle(block).display === 'none') return 0
  const icon = block.querySelector('.tt-property-block-icon') as HTMLElement | null
  const input = block.querySelector('.tt-property-block-input') as HTMLTextAreaElement | null
  const cell = block.querySelector('.tt-property-block-cell') as HTMLElement | null
  const iconW = icon?.offsetWidth ?? 20 // Icon sits inside the cell, left of the value
  const gap = cell ? parseFloat(getComputedStyle(cell).gap) || 6 : 6
  const cellPadL = cell ? parseFloat(getComputedStyle(cell).paddingLeft) || 4 : 4
  const cellPadR = cell ? parseFloat(getComputedStyle(cell).paddingRight) || 8 : 8
  const cellBorderL = cell ? parseFloat(getComputedStyle(cell).borderLeftWidth) || 0 : 0 // 1px transparent border
  const cellBorderR = cell ? parseFloat(getComputedStyle(cell).borderRightWidth) || 0 : 0
  let textW = 48 // "Empty" placeholder
  if (input) {
    if (block.closest('.ProseMirror')?.getAttribute('data-single-line') === 'true') {
      // Fit to text: hug the one-line cell. Prefer the width the NodeView already set from the
      // glyph run (a style read, not layout) so render and hug agree exactly to the pixel.
      const styled = parseFloat(input.style.width)
      const text = input.value || input.placeholder || 'Empty'
      textW = Number.isFinite(styled) && styled > 0
        ? styled
        : measureTextWidthLocal(text, input) // Body probe is already local — no ÷zoom
    } else {
      textW = PROPERTY_VALUE_WRAP_W // Wrap mode: value re-wraps to the frame, so hug the column
    }
  }
  // Fit-to-text min-width is max-content (parseFloat → NaN). A px floor still wins when set.
  const cssMinW = parseFloat(getComputedStyle(block).minWidth) || 0
  return Math.max(cssMinW, cellBorderL + cellPadL + iconW + gap + textW + cellPadR + cellBorderR)
}

/** Row→card frames: title + filled property cells only (icons wrap inside — never sum the strip). */
function measureRowCardContentWidth(contentFit: HTMLElement): number {
  const cs = getComputedStyle(contentFit)
  const padL = parseFloat(cs.paddingLeft) || 0
  const pm = contentFit.querySelector('.ProseMirror') as HTMLElement | null
  if (!pm) return Math.max(1, contentFit.scrollWidth)
  // Wrap mode (no `data-single-line`): the content box is the fixed `wrapContentWidth` column
  // that the text has already re-wrapped into, so hug THAT box — glyph runs would under-hug the
  // wrapped lines, and the width:100% cells have no fixed point in the sum below.
  if (pm.getAttribute('data-single-line') !== 'true') {
    return Math.max(1, Math.ceil(contentFit.offsetWidth))
  }

  const row = pm.closest('.relative') as HTMLElement | null
  const gutter = row && row !== contentFit ? parseFloat(getComputedStyle(row).paddingLeft) || 0 : 0

  let maxLine = 0
  const label = pm.querySelector(
    '.tt-board-link-label, .tt-page-link-label'
  ) as HTMLElement | null
  if (label) {
    const link = label.closest('.tt-board-link, .tt-page-link') as HTMLElement | null
    const icon = link?.querySelector(
      '.tt-board-link-icon-wrap, .tt-board-link-icon, .tt-page-link-icon'
    ) as HTMLElement | null
    const gap = link ? parseFloat(getComputedStyle(link).gap) || 6 : 6
    const iconW = icon?.offsetWidth ?? 0
    const labelText = label.textContent || ''
    const labelW = labelText.trim() ? measureTextWidthLocal(labelText, label) : 0 // Title run; local px
    const embed = link?.querySelector('[data-page-preview]') as HTMLElement | null
    const embedW = embed ? embed.offsetWidth + PREVIEW_INSET_PX * 2 : 0 // Card + 8px peach gap each side
    const shaped = !!contentFit.closest('[data-frame-shape]') // Only reserve the pill when a silhouette must cover it
    const menu = link?.querySelector('[data-page-link-preview], .tt-board-link-preview') as HTMLElement | null
    const menuW = shaped ? Math.max(menu?.offsetWidth || 0, BOARD_OPEN_MENU_W) : 0
    maxLine = Math.max(maxLine, iconW + gap + labelW + (menuW ? gap + menuW : 0), embedW)
  }

  pm.querySelectorAll('.tt-property-block').forEach((el) => {
    maxLine = Math.max(maxLine, measurePropertyBlockWidth(el as HTMLElement))
  })

  const padR = parseFloat(cs.paddingRight) || 0
  const rightInset = gutter > 0 ? Math.max(padR, padL + GRIP_ICON_INSET) : Math.max(padR, padL)
  return Math.ceil(Math.max(1, padL + gutter + maxLine + rightInset))
}

function measureNaturalContentWidth(contentFit: HTMLElement): number {
  const cs = getComputedStyle(contentFit)
  const padL = parseFloat(cs.paddingLeft) || 0 // Content-box left pad (BLOCK_FRAME_PAD on blocks)
  const pm = contentFit.querySelector('.ProseMirror') as HTMLElement | null
  if (!pm) return Math.max(1, contentFit.scrollWidth)
  // Gutter = the ⋮⋮ column pad on the handles row that actually wraps the editor.
  // `querySelector('.relative')` used to match the outer containerRef (pad 0), so the
  // locked frame came out ~24px too narrow and clipped the widest line on the right.
  const row = pm.closest('.relative') as HTMLElement | null
  const gutter = row && row !== contentFit ? parseFloat(getComputedStyle(row).paddingLeft) || 0 : 0

  // Screen→local scale (RF zoom / frameScale). offsetWidth is local; getBoundingClientRect is screen.
  const fitRect = contentFit.getBoundingClientRect()
  const scale = contentFit.offsetWidth > 0 ? fitRect.width / contentFit.offsetWidth : 1
  const toLocal = (screenW: number) => (scale > 0 ? screenW / scale : screenW)
  const rangeWidth = (el: Element): number => {
    try {
      const range = document.createRange()
      range.selectNodeContents(el)
      return toLocal(range.getBoundingClientRect().width) // Real text extent, ignores width:100%
    } catch {
      return 0
    }
  }

  let maxLine = 0
  for (const child of Array.from(pm.children) as HTMLElement[]) {
    const boardLink =
      (child.classList.contains('tt-board-link') && child) ||
      (child.classList.contains('tt-page-link') && child) ||
      (child.querySelector('.tt-board-link, .tt-page-link') as HTMLElement | null)
    if (boardLink) {
      // icon LAYOUT box + gap + real title text — never getBoundingClientRect on the icon:
      // boardLink chromeScale is a CSS transform, and gBCR would report the counter-scaled
      // visual width → locked hug / RF node box thrash (nodes(ref) storm / max update depth).
      const label =
        (boardLink.querySelector('.tt-board-link-label') as HTMLElement | null) ||
        (boardLink.querySelector('.tt-page-link-label') as HTMLElement | null)
      const iconWrap =
        (boardLink.querySelector('.tt-board-link-icon-wrap') as HTMLElement | null) ||
        (boardLink.querySelector('.tt-page-link-icon-wrap') as HTMLElement | null)
      const icon =
        iconWrap ||
        (boardLink.querySelector('.tt-board-link-icon') as HTMLElement | null) ||
        (boardLink.querySelector('.tt-page-link-icon') as HTMLElement | null)
      const gap = parseFloat(getComputedStyle(boardLink).gap) || 6
      const iconW = icon ? (icon as HTMLElement).offsetWidth : 0 // Local layout px (transform-agnostic)
      const labelW = label ? rangeWidth(label) : 0
      const embed = boardLink.querySelector('[data-page-preview]') as HTMLElement | null // In-block preview card
      const embedW = embed ? embed.offsetWidth + PREVIEW_INSET_PX * 2 : 0 // Card + 8px peach gap each side
      const shaped = !!contentFit.closest('[data-frame-shape]') // Only reserve the pill when a silhouette must cover it
      const menu = boardLink.querySelector('[data-page-link-preview], .tt-board-link-preview') as HTMLElement | null
      const menuW = shaped ? Math.max(menu?.offsetWidth || 0, BOARD_OPEN_MENU_W) : 0
      maxLine = Math.max(maxLine, iconW + gap + labelW + (menuW ? gap + menuW : 0), embedW)
      continue
    }
    const propBlock =
      (child.classList.contains('tt-property-block') && child) ||
      (child.querySelector('.tt-property-block:not([data-header-only="true"])') as HTMLElement | null)
    if (propBlock) {
      maxLine = Math.max(maxLine, measurePropertyBlockWidth(propBlock))
      continue
    }
    // databaseBlock: Range over the live Notion table is transform-fragile during RF frame
    // drag (gBCR can collapse → hug shrinks the frame and the table appears to vanish).
    const dbBlock =
      (child.classList.contains('tt-database-block') && child) ||
      (child.querySelector('.tt-database-block') as HTMLElement | null)
    if (dbBlock) {
      // Prefer the table’s intrinsic scrollWidth — under data-single-line the NodeView is
      // width:100%, so offsetWidth echoes the frame and atomExplicitBox/hug inflate forever.
      const table = dbBlock.querySelector('.tt-notion-db') as HTMLElement | null
      const tableEl = table?.querySelector('table') as HTMLElement | null
      const styledW = tableEl ? parseFloat(tableEl.style.width) : 0
      const wrap = tableEl?.closest('.tt-db-table-wrap') as HTMLElement | null
      const gutter =
        wrap != null
          ? parseFloat(getComputedStyle(wrap).paddingLeft) || DB_TABLE_ROW_GUTTER
          : DB_TABLE_ROW_GUTTER
      const w = Math.max(
        styledW > 0 ? styledW + gutter : 0,
        tableEl?.scrollWidth || 0,
        table?.scrollWidth || 0,
        (dbBlock.querySelector('.tt-database-block-row') as HTMLElement | null)?.scrollWidth || 0
      )
      maxLine = Math.max(maxLine, w)
      continue
    }
    // imageBlock NodeView — Resize % is naturalW×pct (fit-to-text) or frame % (wrap); measure media box
    if (child.classList.contains('react-renderer')) {
      const imageBlock = child.querySelector('.tt-image-block') as HTMLElement | null
      if (imageBlock) {
        const media = imageBlock.querySelector('.tt-image-block-media') as HTMLElement | null
        const img = imageBlock.querySelector('.tt-image-block-img') as HTMLImageElement | null
        let w = media?.offsetWidth || 0
        if (w < 1 && img && img.naturalWidth > 0) {
          const pct = parseFloat(imageBlock.getAttribute('data-width-pct') || '100') || 100
          w = Math.max(1, Math.round((img.naturalWidth * pct) / 100))
        }
        if (w > 0) maxLine = Math.max(maxLine, w)
      }
      continue // Other NodeViews measured via inner atoms above
    }
    maxLine = Math.max(maxLine, rangeWidth(child)) // Longest real text line
  }
  // Right margin: equal to padL when there is no ⋮⋮ gutter (gutter lives in select chrome).
  // With an in-fill gutter, mirror frame-left→⋮⋮ icon. Honor live paddingRight.
  const padR = parseFloat(cs.paddingRight) || 0
  const rightInset = gutter > 0 ? Math.max(padR, padL + GRIP_ICON_INSET) : Math.max(padR, padL)
  return Math.ceil(Math.max(1, padL + gutter + maxLine + rightInset))
}

/** Nowrap column while wrap is on — Range on wrapped lines is the wrap box, not the full run. */
function measureNowrapContentWidth(contentFit: HTMLElement): number {
  const prevW = contentFit.style.width // Restore wrap column after the probe
  const prevMax = contentFit.style.maxWidth // Restore wrap max after the probe
  const pm = contentFit.querySelector('.ProseMirror') as HTMLElement | null // Single-line CSS lives here
  const hadSingle = pm?.getAttribute('data-single-line') === 'true' // Don’t strip if already nowrap
  contentFit.style.width = 'max-content' // Let glyphs run past the wrap line
  contentFit.style.maxWidth = 'none' // Wrap max would clamp the probe
  pm?.setAttribute('data-single-line', 'true') // Same nowrap as fit-to-text
  const w = measureNaturalContentWidth(contentFit) // Longest unwrapped line + pads
  if (pm && !hadSingle) pm.removeAttribute('data-single-line') // Back to wrap layout
  contentFit.style.width = prevW // Restore wrap column
  contentFit.style.maxWidth = prevMax // Restore wrap max
  return w
}

/** Unscaled column that holds the longest word plus the frame pads — wrap never splits a word. */
function measureLongestWordWidth(contentFit: HTMLElement): number {
  const pm = contentFit.querySelector('.ProseMirror') as HTMLElement | null // Text lives here
  if (!pm) return BLOCK_THREE_CHARS_W // No editor yet — keep the old floor
  const canvas = document.createElement('canvas') // Match each run’s font without reflowing the frame
  const ctx = canvas.getContext('2d') // measureText for one word
  if (!ctx) return BLOCK_THREE_CHARS_W // Canvas unavailable
  let max = 0 // Widest word in CSS px
  const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT) // Skip atoms that are not words
  let node = walker.nextNode() as Text | null // First text run
  while (node) {
    const parent = node.parentElement // Font is on the element, not the text node
    const parts = (node.textContent || '').split(/\s+/) // Words — wrap breaks only on spaces
    if (parent && parts.some(Boolean)) {
      const font = getComputedStyle(parent) // `font` shorthand is often empty — canvas would measure at 10px and stop the line early
      ctx.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}` // Same size the glyphs paint at
      for (const word of parts) {
        if (!word) continue // Empty split piece
        max = Math.max(max, ctx.measureText(word).width) // Keep the longest
      }
    }
    node = walker.nextNode() as Text | null // Next run
  }
  const cs = getComputedStyle(contentFit) // Pads sit outside the glyphs
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) // Column includes both sides
  return Math.max(BLOCK_THREE_CHARS_W, Math.ceil(max + pad)) // Never narrower than one word
}

/** Painted wrap column in fill-local px — the contentFit box (wrapCol × CSS scale), not the PM glyph hug. */
function wrapColumnInFill(fill: HTMLElement, contentFit: HTMLElement): { left: number; width: number } | null {
  const fillRect = fill.getBoundingClientRect()
  const r = contentFit.getBoundingClientRect() // Constraint box — PM can be fit-content (free-left) and narrower
  if (fillRect.width < 1 || r.width < 0.5) return null // Unmounted / collapsed
  const sx = fill.offsetWidth / fillRect.width // Screen → fill (board zoom)
  return { left: (r.left - fillRect.left) * sx, width: r.width * sx }
}

/** True when TipTap HTML is only an imageBlock (optional empty <p> wrappers). */
function isSoleImageBlockHtml(html: string): boolean {
  if (!/data-type=["']imageBlock["']/i.test(html || '')) return false
  const rest = (html || '')
    .replace(/<div[^>]*data-type=["']imageBlock["'][^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<p>(?:\s|<br\s*\/?>)*<\/p>/gi, '')
    .replace(/\s+/g, '')
  return rest.length === 0
}

/** Unscaled content height — prefer scrollHeight so clipped/wrapped overflow still counts. */
function measureNaturalContentHeight(
  contentFit: HTMLElement,
  reserveConnectionsStrip = false
): number {
  const dbExtents = measureDatabaseBlockExtents(contentFit, reserveConnectionsStrip)
  if (dbExtents) return dbExtents.height
  // Hug to the last TipTap block’s bottom + equal pads — NOT contentFit/PM’s border box.
  // PM can run taller than the highlighted paragraph (trailing widgets / strut); that leftover
  // was multiplied by frameScale and, with top-left origin, all landed as peach under the wash.
  const cs = getComputedStyle(contentFit)
  const padT = parseFloat(cs.paddingTop) || 0 // Equal T pad painted with the fill
  const padB = parseFloat(cs.paddingBottom) || 0 // Equal B pad — keep symmetric with padT
  const pm = contentFit.querySelector('.ProseMirror') as HTMLElement | null
  let body = 0
  if (pm) {
    for (const child of Array.from(pm.children) as HTMLElement[]) {
      // offsetTop+Height is transform-agnostic (unscaled), same space as padT/padB
      const bottom = child.offsetTop + child.offsetHeight
      if (bottom > body) body = bottom
    }
    if (body <= 0) {
      // Empty frame: one line box so the I-bar still has a clickable band
      const lh = parseFloat(getComputedStyle(pm).lineHeight)
      body = Number.isFinite(lh) && lh > 0 ? lh : BLOCK_MIN_FRAME_H - padT - padB
    }
    const extra = previewCardHeight(pm) // Preview is inside a boardLink/databaseBlock child
    if (extra > 0) {
      const host =
        (pm.querySelector('[data-page-preview]')?.closest('.react-renderer') as HTMLElement | null) ||
        (pm.querySelector('.tt-board-link-embed') as HTMLElement | null)
      const top = host?.offsetTop ?? 0
      body = Math.max(body, top + extra) // Shape/hug must cover title + preview, not the title-only box
    }
  }
  // Connections / properties sit in outer chrome — hug the blocks + fill pad only
  void reserveConnectionsStrip // Call-site parity with db measure path
  if (body > 0) {
    return Math.max(1, Math.round((padT + body + padB) * 100) / 100) // 2dp — kill float dust
  }
  const fallback = contentFit.offsetHeight || contentFit.scrollHeight || 1 // Detached / display:none
  return Math.max(1, Math.round(fallback * 100) / 100)
}

/** Full Notion table box (all columns × rows + title/toolbar) — not the free-resize clip viewport. */
function measureDatabaseBlockExtents(
  contentFit: HTMLElement,
  reserveConnectionsStrip = false
): { width: number; height: number } | null {
  const dbBlock = contentFit.querySelector('.tt-database-block') as HTMLElement | null
  if (!dbBlock) return null
  const table = dbBlock.querySelector('.tt-notion-db table') as HTMLElement | null
  const notionDb = dbBlock.querySelector('.tt-notion-db') as HTMLElement | null
  if (!table || !notionDb) return null

  const styledTableW = parseFloat(table.style.width)
  const wrap = table.closest('.tt-db-table-wrap') as HTMLElement | null
  const gutter =
    wrap != null
      ? parseFloat(getComputedStyle(wrap).paddingLeft) || DB_TABLE_ROW_GUTTER
      : DB_TABLE_ROW_GUTTER
  const tableW = styledTableW > 0 ? styledTableW + gutter : table.scrollWidth

  const titleRow = dbBlock.querySelector('.tt-database-block-row') as HTMLElement | null
  const titleH = titleRow ? titleRow.offsetHeight + 8 : 0 // mb-2 under title row
  const previewH = previewCardHeight(dbBlock) // In-block board preview under the DB title
  const notionH = notionDb.scrollHeight // Toolbar + full row stack (not scroll cap)

  void reserveConnectionsStrip // Connections sit in bottom chrome — not in the fill hug

  const cs = getComputedStyle(contentFit)
  const padL = parseFloat(cs.paddingLeft) || 0
  const padR = parseFloat(cs.paddingRight) || 0
  const padT = parseFloat(cs.paddingTop) || 0
  const padB = parseFloat(cs.paddingBottom) || 0
  const pm = contentFit.querySelector('.ProseMirror') as HTMLElement | null
  const row = pm?.closest('.relative') as HTMLElement | null
  const gripGutter = row && row !== contentFit ? parseFloat(getComputedStyle(row).paddingLeft) || 0 : 0
  const rightInset = gripGutter > 0 ? Math.max(padR, padL + GRIP_ICON_INSET) : Math.max(padR, padL)

  return {
    width: Math.ceil(padL + gripGutter + Math.max(tableW, 420) + rightInset),
    height: Math.ceil(padT + padB + titleH + previewH + notionH), // Preview sits between title and table
  }
}

const CLIP_FADE_PX = 16 // Soft edge so half-cut glyphs fade instead of chopping
const DB_TABLE_ROW_GUTTER = 20 // Keep in sync with notion-database-table ROW_GUTTER

/** Mask style that fades content out at overflowing frame edges (right / bottom). */
function clipFadeMaskStyle(
  overflowRight: boolean,
  overflowBottom: boolean,
  fadePx = CLIP_FADE_PX,
): React.CSSProperties | undefined {
  if (!overflowRight && !overflowBottom) return undefined
  const toRight = `linear-gradient(to right, #000 calc(100% - ${fadePx}px), transparent)`
  const toBottom = `linear-gradient(to bottom, #000 calc(100% - ${fadePx}px), transparent)`
  if (overflowRight && overflowBottom) {
    // Intersect both fades so the corner softens on both axes
    return {
      WebkitMaskImage: `${toRight}, ${toBottom}`,
      maskImage: `${toRight}, ${toBottom}`,
      WebkitMaskComposite: 'source-in',
      maskComposite: 'intersect',
    }
  }
  const one = overflowRight ? toRight : toBottom
  return { WebkitMaskImage: one, maskImage: one }
}

// Visual frame = unscaled content × frameScale. Do NOT add a phantom +2 border — selected
// frames use borderWidth 0 (blue adjust chrome), so +2 left slack under the content and the
// left/right connection indicators sat below the ⋮⋮ / text midline.
// No FRAME_RESIZE_MIN (40) floor here — that left short/scaled text top-left in an empty box.
// Empty one-line size comes from measured intrinsic (already ~BLOCK_MIN_FRAME_H), not a second floor.
function scaledFrameSize(
  intrinsic: { width: number; height: number },
  scale: number,
  minWidth = 1, // Fit-to-text hugs content; NodeResizeControl still uses FRAME_RESIZE_MIN while dragging
  minHeight = 1,
) {
  const safeScale = Math.max(FRAME_SCALE_EPSILON, scale) // Match locked corner-drag — no 0.15 shrink floor
  return {
    width: Math.max(minWidth, Math.ceil(intrinsic.width * safeScale)), // Ceil — never clip glyphs on the right
    // Keep 2dp on height — integer round left slack that top-left scale dumps under the block
    height: Math.max(minHeight, Math.round(intrinsic.height * safeScale * 100) / 100),
  }
}

/** Free-resize contain. Cap 1 unless allowGrow — wrap uses allowGrow so text can pass fit-to-text and shrink with no floor. */
function freeContentFitScale(
  boxW: number, // Frame inner width
  boxH: number, // Frame inner height
  contentW: number, // Natural visual width (intrinsic × frameScale)
  contentH: number, // Natural visual height
  shape?: FrameShapeType | null, // Silhouette — contain inside its outline, not the bounding rect
  allowGrow = false, // Plus-box drag — scale past the last fit-to-text size
): number {
  if (contentW < 1 || contentH < 1) return 1 // Nothing to fit
  const fit = Math.min(boxW / contentW, boxH / contentH) // Uniform contain — may be above 1
  if (shape && !(allowGrow && fit > 1)) return shapeContentFitScale(shape, boxW, boxH, contentW, contentH) // Shrink inside the silhouette; grow uses the box
  return allowGrow ? fit : Math.min(1, fit) // Wrap / plus box may pass fit-to-text; otherwise stop at 1
}

/** Sync first-paint scale from place/persist metadata (async loadResizeState is too late for I-bar type). */
function initialFrameScaleFromMeta(meta: unknown): number {
  const fs = (meta as Record<string, unknown> | null | undefined)?.frameScale
  return typeof fs === 'number' && Number.isFinite(fs) && fs > 0 ? fs : 1
}

/** Sync first-paint box from place/persist metadata — enables CSS frameScale on mount. */
function initialResizeDimsFromMeta(meta: unknown): { width: number; height: number } | null {
  const dims = (meta as Record<string, unknown> | null | undefined)?.resizeDimensions
  if (!dims || typeof dims !== 'object') return null
  const d = dims as { width?: number; height?: number }
  if (typeof d.width === 'number' && typeof d.height === 'number' && d.width > 0 && d.height > 0) {
    return { width: d.width, height: d.height }
  }
  return null
}

/** Locked hug: scale intrinsic text, inflating first when a silhouette would clip. */
function hugLockedFrameSize(
  intrinsic: { width: number; height: number },
  scale: number,
  minWidth: number,
  shape: FrameShapeType | null,
) {
  // Height/width floors stay at 1 — intrinsic already includes one-line pads
  return scaledFrameSize(shapeFitContentBox(intrinsic, shape, true), scale, minWidth, 1)
}

/** Painted contentFit box in fill-local px (includes CSS scale — the on-screen text). */
function visualContentInFill(
  cf: HTMLElement,
  fill: HTMLElement
): { left: number; top: number; width: number; height: number } | null {
  const fillRect = fill.getBoundingClientRect() // Screen AABB of the peach
  const cfRect = cf.getBoundingClientRect() // Screen AABB of the scaled glyphs
  if (fillRect.width < 1 || fillRect.height < 1) return null
  const sx = fill.offsetWidth / fillRect.width // Screen → fill CSS px (board zoom)
  const sy = fill.offsetHeight / fillRect.height
  return {
    left: (cfRect.left - fillRect.left) * sx, // Where the text sits in the free fill
    top: (cfRect.top - fillRect.top) * sy,
    width: Math.max(1, cfRect.width * sx),
    height: Math.max(1, cfRect.height * sy),
  }
}

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEditorContext } from './editor-context'
import { useBoardAccess } from '@/lib/share/board-access-context' // Gate TipTap editable for shared viewers
import {
  isEphemeralMessageId,
  patchEphemeralMessage,
} from '@/lib/ephemeral-sandbox' // Homepage /view clones — local content only
import { useReactFlowContext } from './react-flow-context'
import { useSidebarContext } from './sidebar-context' // Phone layout — hold before unselected frame drag
import { usePhoneFrameDrag } from './phone-frame-drag-context' // Blue move border during phone hold-drag
import { useTheme } from './theme-provider'
import { SelectionFormatPopupAnchor } from './selection-format-popup' // Notion-style selection menu (stable edge anchor)
import { BoardLinkProvider, type BoardLinkActions } from '@/lib/board-link-context' // Bridge boardLink NodeViews → frame preview/open/rename
import { BoardOpenMenu } from '@/components/board-open-menu' // Preview/open chrome for page frames without a boardLink
import { NestedBoardPreview, PREVIEW_HEIGHT, prefetchBoardEmbed } from './nested-board-preview' // In-block preview + hug card height
import { unwrapNestedFramesHtml } from '@/lib/tiptap/unwrap-nested-frames' // Flatten legacy nest wrappers
import { applyTurnInto, bodyHtmlWithoutBoardTitle } from '@/lib/blocks/turn-into' // Page promote + strip title from board body
import { migrateSoleDatabaseBlockToBoardLink, ensureNotionMapFrameIsBoardLink, isSoleDatabaseBlockContent, isSoleBoardLinkContent, repairBoardFrameToSoleLink, restoreWipedDatabaseBlockHtml } from '@/lib/notion/migrate-frame' // Notion DB map frames → boardLink; repair polluted board frames; heal wiped tables
import {
  COMPACT_PREVIEW_ROWS,
  NOTION_DB_CLIENT_ROW_CAP,
  NOTION_DB_CLIENT_ROW_PAGE,
} from '@/lib/notion/database' // Table rows Reset floor / snapshot split
import { DbFrameRevealChrome } from '@/components/notion-db-static-preview' // +# rows hangs under the frame
import { useNotionPageBodySync } from '@/lib/notion/use-notion-page-sync' // Imported page body ↔ Notion
import { patchBoardMessageMetadata } from '@/lib/notion/connection-sync-pending'
import {
  htmlHasNotionSync,
  sanitizeNotionSyncHtml,
} from '@/lib/notion/wrap-notion-sync-html' // Strip orphan review marks before persist
import {
  refreshNotionSyncSelection,
  registerNotionSyncEditor,
} from '@/lib/notion/sync-selection'
import { toggleNotionSyncMarkSelected } from '@/lib/tiptap/notion-sync-mark'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
  metadata?: Record<string, any> // Optional metadata field
}

interface Comment {
  id: string
  selectedText: string
  from: number
  to: number
  section: 'prompt' | 'response'
  comment: string
  createdAt: string
}

const COMMENT_BOX_W = 256 // w-64 — comment card width
const COMMENT_BOX_GAP = 16 // Air off the fill edge — ignore simulated connection points

/** Fixed flow gap; do not × ui-scale (that was clearing the connection disc). */
function commentBoxGapCss(): string {
  return `${COMMENT_BOX_GAP}px`
}

/** Pick the side with room for a comment card. Right chrome (utility / chat) shrinks the right lane. */
function pickCommentSide(panel: HTMLElement | null): 'left' | 'right' {
  if (!panel) return 'right'
  const rect = panel.getBoundingClientRect()
  const zoom = panel.offsetWidth > 0 ? rect.width / panel.offsetWidth : 1 // Flow → screen
  const need = COMMENT_BOX_W * zoom + COMMENT_BOX_GAP * zoom // Card + air in screen px
  let rightLimit = window.innerWidth
  const chat = document.querySelector('[data-chat-sidebar]:not([data-chat-map-dock])')
  if (chat instanceof HTMLElement) {
    const cr = chat.getBoundingClientRect()
    if (cr.width > 8) rightLimit = Math.min(rightLimit, cr.left)
  }
  const util = document.querySelector('[data-utility-sidebar]')
  if (util instanceof HTMLElement) {
    const ur = util.getBoundingClientRect()
    if (ur.width > 8) rightLimit = Math.min(rightLimit, ur.left)
  }
  const rightSpace = rightLimit - rect.right
  const leftSpace = rect.left
  if (rightSpace >= need) return 'right'
  if (leftSpace >= need) return 'left'
  return leftSpace > rightSpace ? 'left' : 'right'
}

interface EmojiReaction {
  id: string
  selectedText: string
  from: number
  to: number
  section: 'prompt' | 'response'
  emoji: string
  count: number
  createdAt: string
}

interface ChatPanelNodeData {
  promptMessage: Message
  responseMessage?: Message
  conversationId: string
  isResponseCollapsed?: boolean // Track if response is collapsed for position updates
  fillColor?: string // Panel fill color (optional, defaults to transparent)
  borderColor?: string // Panel border color (optional, defaults to theme-based)
  borderStyle?: string // Panel border style (solid, dashed, dotted)
  // Border thickness: '2px' from persisted metadata, bare number from the weight slider.
  // Readers normalize with parseFloat(String(...)); CSS borderWidth takes either.
  borderWeight?: string | number
  frameShape?: FrameShapeType | null // Silhouette when frames act as shapes
  frameChromePad?: { x: number; y: number } // RF position shift while ⋮⋮ gutter is visible
}

interface ProjectBoardPanelNodeData {
  boardId: string
  boardTitle: string  // Used as "prompt"
  recentUserMessage?: Message  // Most recent user message as "response"
  projectId: string
  isResponseCollapsed?: boolean
  fillColor?: string // Panel fill color (optional, defaults to transparent)
  borderColor?: string // Panel border color (optional, defaults to theme-based)
  borderStyle?: string // Panel border style (solid, dashed, dotted)
  borderWeight?: string | number // Same as ChatPanelNodeData — persisted 'px' string or slider number
}

// Union type for node data
type PanelNodeData = ChatPanelNodeData | ProjectBoardPanelNodeData

// Type guard to check if data is ProjectBoardPanelNodeData
function isProjectBoardData(data: PanelNodeData): data is ProjectBoardPanelNodeData {
  return 'boardId' in data && 'boardTitle' in data
}

// Plain-merge legacy prompt + response HTML into one page-item body (no auto-haze)
function mergePanelHtml(prompt?: string, response?: string): string {
  const empty = (s?: string) => !s?.trim() || s === '<p></p>' || s === '<p><br></p>' // TipTap empty docs
  const a = empty(prompt) ? '' : (prompt as string) // Prompt / primary body
  const b = empty(response) ? '' : (response as string) // Former response section
  const merged = a && b ? `${a}${b}` : a || b || '' // Concatenate HTML fragments
  return unwrapNestedFramesHtml(merged) // Flatten legacy nestedFrame shells
}

// Format response content - if it's already HTML, return as-is (TipTap will render it)
// Only format plain text content
function formatResponseContent(content: string): string {
  if (!content) return content

  // Check if content is already HTML - if so, return it as-is (TipTap handles HTML directly)
  const isHTML = /<[a-z][\s\S]*>/i.test(content)

  if (isHTML) {
    // Content is already HTML - TipTap will render it directly, no need to reformat
    return content
  }

  // If it's plain text, convert to basic HTML structure
  // Split by double newlines (paragraph breaks) or single newlines if no double newlines
  const hasDoubleNewlines = /\n\s*\n/.test(content)
  const paragraphs = hasDoubleNewlines
    ? content.split(/\n\s*\n/).map(p => p.trim()).filter(p => p.length > 0)
    : content.split(/\n/).map(p => p.trim()).filter(p => p.length > 0)

  if (paragraphs.length <= 1) {
    // Single paragraph - wrap in <p> tag
    return `<p>${content}</p>`
  }

  // Convert paragraphs to HTML
  const htmlParagraphs = paragraphs
    .map(p => {
      // Check if it looks like a heading
      const isHeading = /^[A-Z][^.!?]*[:\-]$/.test(p) || (p.length < 100 && !p.includes('.'))
      if (isHeading) {
        return `<h2>${p}</h2>`
      }
      // Check if it's a list item
      const isListItem = /^[\d\-\*•]\s/.test(p) || /^\d+[\.\)]\s/.test(p)
      if (isListItem) {
        return `<li>${p.replace(/^[\d\-\*•]\s/, '').replace(/^\d+[\.\)]\s/, '')}</li>`
      }
      return `<p>${p}</p>`
    })
    .join('')

  return htmlParagraphs
}

/** Empty `[]` on a Notion DB frame is leftover chrome — keep only named (Notion) properties. */
function propertyHeadersForChrome(
  items: PropertyHeaderItem[],
  html: string
): PropertyHeaderItem[] {
  if (!hasDatabaseBlockHtml(html)) return items
  return items.filter((it) => it.name.trim() !== '')
}

/** Empty property icons for the top chrome band (outside the fill). */
function seedPropertyHeaders(
  html: string,
  propertyType: PropertyTypeId | null
): PropertyHeaderItem[] {
  const fromHtml = readPropertyBlockHeadersFromHtml(html) // Persisted header-only cells
  if (fromHtml.length > 0) return propertyHeadersForChrome(fromHtml, html)
  if (htmlHasPropertyBlocks(html)) return [] // Filled/inlined cells live in the body only
  if (hasDatabaseBlockHtml(html)) return [] // Don't seed metadata.propertyType onto a DB table
  return propertyType ? [{ type: propertyType, name: '', from: -1 }] : []
}

/** Top chrome: **empty** type icons in doc order — one block (⋮⋮ from TipTapBlockHandles); wraps to frame width. */
function FramePropertyGroup({
  items,
  className,
  editor = null,
  editorRef,
  iconScale = 1,
}: {
  items: PropertyHeaderItem[]
  className?: string
  editor?: Editor | null
  editorRef?: React.MutableRefObject<Editor | null>
  iconScale?: number
}) {
  const liveEditor = () => {
    const fromRef = editorRef?.current
    if (fromRef && !fromRef.isDestroyed) return fromRef
    if (editor && !editor.isDestroyed) return editor
    return null
  }
  const containerRef = useRef<HTMLDivElement>(null) // Icon row — drag target
  const scale = iconScale > 0 ? iconScale : 1 // Gap/pad track frame scale; glyph stays 14px like frame text
  const gapPx = Math.max(4, Math.round(6 * scale)) // Space between icons on the row
  const rowPadY = Math.max(1, Math.round(2 * scale)) // Air from the glyph to the frame and the adjust box
  const [menuOpen, setMenuOpen] = useState<{
    from: number
    type: PropertyTypeId
    name: string
    inline: boolean
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const [dropLine, setDropLine] = useState<PropertyDropLine | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number; type: PropertyTypeId } | null>(null)

  const openMenuAt = useCallback(
    (item: PropertyHeaderItem, el: HTMLElement) => {
      const ed = liveEditor()
      const live = ed && item.from >= 0 ? readPropertyBlockAt(ed, item.from) : null
      const r = el.getBoundingClientRect()
      setMenuOpen({
        from: item.from,
        type: live?.type ?? item.type,
        name: live?.name || item.name,
        inline: live?.inline ?? false,
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      })
    },
    [editor, editorRef]
  )

  const onMenuAction = useCallback(
    (action: PropertyMenuAction, payload?: { type?: PropertyTypeId; name?: string }) => {
      const ed = liveEditor()
      if (!ed || !menuOpen || menuOpen.from < 0) return
      const from = menuOpen.from
      if (action === 'editType' && payload?.type) updatePropertyBlockAttrs(ed, from, { propertyType: payload.type })
      else if (action === 'editName' && payload?.name != null) updatePropertyBlockAttrs(ed, from, { propertyName: payload.name })
      else if (action === 'displayIcon') updatePropertyBlockAttrs(ed, from, { inline: false })
      else if (action === 'displayInline') updatePropertyBlockAttrs(ed, from, { inline: true })
      else if (action === 'insertLeft') insertPropertyBlockBeside(ed, from, 'left')
      else if (action === 'insertRight') insertPropertyBlockBeside(ed, from, 'right')
      else if (action === 'duplicate') duplicatePropertyBlock(ed, from)
      else if (action === 'delete') deletePropertyBlock(ed, from)
    },
    [editor, editorRef, menuOpen]
  )

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLSpanElement>, item: PropertyHeaderItem) => {
      const el = e.currentTarget // Capture now — React clears currentTarget after pointerdown
      const ed = liveEditor()
      const from = ed ? resolvePropertyHeaderFrom(ed, item) : item.from
      if (ed && from >= 0) {
        bindPropertyIconDrag(e, {
          getEditor: liveEditor,
          from,
          el,
          headerEl: containerRef.current,
          iconType: item.type,
          onClick: () => openMenuAt({ ...item, from }, el),
          callbacks: { setGhost, setDropLine },
        })
        return
      }
      e.stopPropagation() // No live cell yet — still open the menu on release
      const onUp = () => {
        window.removeEventListener('pointerup', onUp)
        openMenuAt({ ...item, from }, el)
      }
      window.addEventListener('pointerup', onUp)
    },
    [editor, editorRef, openMenuAt]
  )

  if (items.length === 0) return null

  return (
    <>
    <div
      ref={containerRef}
      data-tt-property-header
      className={cn(
        'flex w-full min-w-0 max-w-full flex-wrap items-center',
        className
      )}
      style={{ gap: gapPx, paddingTop: rowPadY, paddingBottom: rowPadY }}
    >
      {items.map((item, i) => (
        <PropertyIconWithTooltip
          key={`${item.type}-${item.name}-${item.from}-${i}`}
          type={item.type}
          name={item.name}
          className={cn(
            'tt-property-block-icon nodrag nopan pointer-events-auto rounded hover:bg-gray-100 dark:hover:bg-[#2a2a2a]',
            item.from >= 0 && liveEditor() && 'cursor-grab active:cursor-grabbing'
          )}
          iconClassName="h-3.5 w-3.5" // 14px — same as board frame text, not the in-frame 16px cell glyph
          onPointerDown={(e) => onHeaderPointerDown(e, item)}
        />
      ))}
    </div>
    {ghost &&
      typeof document !== 'undefined' &&
      createPortal(
        <div
          className="pointer-events-none fixed z-[120] flex h-6 w-6 items-center justify-center rounded bg-white shadow-md ring-1 ring-gray-200 dark:bg-[#1f1f1f] dark:ring-[#2f2f2f]"
          style={{ left: ghost.x + 8, top: ghost.y + 8 }}
        >
          <PropertyIconWithTooltip type={ghost.type} name="" className="flex h-5 w-5 items-center justify-center text-gray-500" />
        </div>,
        document.body
      )}
    <PropertyDropLinePortal line={dropLine} />
    <PropertyMenu
      open={!!menuOpen}
      anchor={menuOpen}
      type={menuOpen?.type ?? 'text'}
      name={menuOpen?.name ?? ''}
      inline={menuOpen?.inline ?? false}
      onAction={onMenuAction}
      onClose={() => setMenuOpen(null)}
    />
    </>
  )
}

/** Bottom chrome: Notion (and later connectors) — one **block** (⋮⋮ from TipTapBlockHandles). */
function FrameConnectionsGroup({
  notionSync,
  onNotionConnection,
  className,
}: {
  notionSync: NotionSyncMode
  onNotionConnection?: (next: { connected: boolean; sync?: NotionSyncMode }) => void
  className?: string
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null) // Sync menu next to the mark
  const markRef = useRef<HTMLButtonElement>(null) // Notion mark — re-measure after board nav
  const menuRef = useRef(menu) // Settle reads the open menu without re-subscribing
  menuRef.current = menu

  // After pan/zoom, park the connection menu on the mark again (same settle as the hide).
  useEffect(() => {
    if (!menu) return
    return watchBoardViewportNav({
      onSettle: () => {
        if (!menuRef.current) return
        const el = markRef.current
        if (!el) return
        const r = el.getBoundingClientRect() // Mark has already followed the settled viewport
        setMenu((prev) => {
          if (!prev) return prev
          if (prev.x === r.left && prev.y === r.bottom) return prev
          return { x: r.left, y: r.bottom }
        })
      },
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return // Nothing to dismiss
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (t.closest?.('.block-actions-menu, [data-tt-connections-header]')) return // Keep open on mark / menu
      dismissMenuUnlessBoardNav(() => setMenu(null)) // Pan keeps the menu; a still click outside closes it
    }
    document.addEventListener('mousedown', onDoc, true) // Capture so frame clicks still dismiss
    return () => document.removeEventListener('mousedown', onDoc, true)
  }, [menu])
  return (
    <>
      <div
        data-tt-connections-header
        data-tt-notion-footer
        className={cn(
          'flex w-full flex-wrap items-center', // Hug the 14px mark; wrap still grows the bottom gap
          className
        )}
        style={{ paddingTop: 2, paddingBottom: 2 }} // 2px air toward the frame and the blue edge
      >
        <button
          ref={markRef}
          type="button"
          className="nodrag nopan flex h-3.5 w-3.5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2a2a2a]"
          title="Notion connection"
          aria-label="Notion connection"
          onPointerDown={(e) => e.stopPropagation()} // Don't start frame drag
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setMenu({ x: r.left, y: r.bottom }) // Live Sync status + Remove
          }}
        >
          <NotionMarkIcon
            className={cn('h-3.5 w-3.5', isNotionAutoSync(notionSync) ? 'text-[#2383e2]' : 'text-gray-500')} // 14px, same as frame text
          />
        </button>
      </div>
      {menu &&
        typeof document !== 'undefined' &&
        createPortal(
          <BlockActionsMenu
            variant="notionConnection"
            x={menu.x}
            y={menu.y}
            positionMode="fixed"
            openLeft
            notionSync={notionSync}
            onAction={(action, payload) => {
              if (action === 'setNotionSync') {
                onNotionConnection?.({ connected: true, sync: payload?.notionSync ?? 'live' })
              } else if (action === 'removeNotionConnection') {
                onNotionConnection?.({ connected: false })
              }
              setMenu(null)
            }}
            onClose={() => setMenu(null)}
          />,
          document.body
        )}
    </>
  )
}

/** Lightweight shell while the frame is off-screen — no TipTap / NodeViews. */
// Inline formatting a text frame can contain. Anything else is dropped rather than trusted: this HTML
// normally reaches the DOM through TipTap, which filters it to the editor schema, and injecting it
// directly skips that — so a stored `<script>` or `onerror=` would otherwise run.
const STATIC_FRAME_TAGS = new Set([
  'P', 'BR', 'HR', 'SPAN', 'DIV', 'A', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'MARK', 'SUP', 'SUB',
  'CODE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
])
const STATIC_FRAME_ATTRS = new Set(['class', 'style', 'href', 'data-text-align'])
// Frames that have had a live editor at some point this session, keyed message:section. RF unmounts
// culled frames, so this is the only way a remount can tell "first paint of this board" from "this
// frame came back into view" — the props that used to stand in for that (`loadCrossfade`) are static.
const livePromotedFrames = new Set<string>()

const staticFrameHtmlCache = new Map<string, string>() // Keyed by stored HTML — same frame, same result

/** Sanitized, inert copy of a frame's stored HTML, for frames that have no DOM snapshot yet. */
function staticFrameHtml(content: string): string {
  const cached = staticFrameHtmlCache.get(content)
  if (cached !== undefined) return cached
  let html = ''
  if (typeof document !== 'undefined') {
    const root = new DOMParser().parseFromString(`<div>${content}</div>`, 'text/html').body
      .firstElementChild
    if (root) {
      for (const el of Array.from(root.querySelectorAll('*'))) {
        if (!STATIC_FRAME_TAGS.has(el.tagName)) {
          el.remove() // Atoms/media need their NodeViews; an unknown tag would render as nothing anyway
          continue
        }
        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase()
          if (!STATIC_FRAME_ATTRS.has(name)) el.removeAttribute(attr.name)
          else if (name === 'href' && /^\s*(javascript|data):/i.test(attr.value)) {
            el.removeAttribute(attr.name)
          }
        }
      }
      html = root.innerHTML
    }
  }
  staticFrameHtmlCache.set(content, html)
  return html
}

function TipTapContentDeferred({
  content,
  className,
  enableBlockHandles = false,
  isFlashcard,
  isPanelSelected,
  deferredBox,
  conversationId,
  hostMessageId,
  section,
  dbAlwaysExpanded,
}: {
  content: string
  className?: string
  enableBlockHandles?: boolean
  isFlashcard?: boolean
  isPanelSelected?: boolean
  dbAlwaysExpanded?: boolean // Compact vs expanded idle snapshot slots
  deferredBox?: DeferredFrameBox | null // Cached/estimated inner fill — parent owns outer chrome
  conversationId?: string // Snapshot store is per board
  hostMessageId?: string // Snapshot key — this frame's message row
  section?: 'prompt' | 'response' // Prompt/response bodies are separate editors in one frame
}) {
  if (!enableBlockHandles || isFlashcard) return null
  // Preferred path: replay this frame's own last live DOM. Same markup, same stylesheet, so the cold
  // frame is identical to the live one by construction — including JS-set inline sizes, which the
  // hand-built shells below could only guess at. Notion DB frames use the idle TipTap snapshot only —
  // there is no second static-twin renderer here (that drifted and does not generalize to connections).
  const snapshot = readFrameSnapshot(
    conversationId,
    frameSnapshotKey(hostMessageId, section, {
      dbExpand: dbExpandSnapshotSlot(content, dbAlwaysExpanded),
    }),
    content
  )
  // Prefer deferredBox.kind; fall back — boardLink titles are attrs-only (not frameHasVisibleText)
  const kind =
    deferredBox?.kind ??
    (/data-type=["'](?:boardLink|pageLink)["']/i.test(content)
      ? 'boardLink'
      : frameHasVisibleText(content)
        ? 'text'
        : 'empty')
  const shimmerHasText = deferredBox?.hasText ?? frameHasVisibleText(content)
  const barCount = deferredBox?.barCount ?? shimmerBarCountFromHtml(content)
  const innerW = deferredBox
    ? Math.max(1, deferredBox.width - BLOCK_FRAME_PAD_X * 2)
    : BLOCK_LOCKED_MIN_W
  const innerH = deferredBox
    ? Math.max(BLOCK_MIN_FRAME_H, deferredBox.height - BLOCK_FRAME_PAD_Y * 2)
    : BLOCK_MIN_FRAME_H
  const isInline = className?.includes('inline')
  const otherClasses = className?.replace(/\binline\b/g, '').trim()
  // boardLink titles live in data-title attrs — solid shimmer looked “empty until hover”
  const boardLinkPreview = kind === 'boardLink' ? parseBoardLinkPreview(content) : null
  // Only plain text frames: every other kind is an atom handled by a branch above, and atom HTML
  // without its NodeView renders nothing. DB without a snapshot must mount TipTap (see shouldMountLive).
  const staticHtml = kind === 'text' && content ? staticFrameHtml(content) : ''
  return (
    <div
      className={cn(
        'relative overflow-visible w-full h-full min-h-0',
        isFlashcard ? 'cursor-pointer' : isPanelSelected ? 'cursor-text' : 'cursor-grab',
        !isPanelSelected && 'tt-frame-unselected',
        isInline && 'inline-block',
        otherClasses
      )}
    >
      <div
        className={cn(
          'relative w-full h-full min-h-0',
          // Snapshots carry live's own box; the hand-built shells are sized to innerW/innerH and
          // still need the clip.
          snapshot ? 'overflow-visible' : 'overflow-hidden'
        )}
      >
        {snapshot ? (
          // Wrapper mirrors live's EditorContent host so inherited layout matches; `nodrag`/`nopan`
          // are omitted because a cold frame is by definition not selected — the board owns the drag.
          <div
            className="block w-full"
            data-tt-cold-frame=""
            aria-hidden
            dangerouslySetInnerHTML={{ __html: snapshot }}
          />
        ) : boardLinkPreview ? (
          <div
            className={cn(
              'tt-board-link-deferred',
              boardLinkPreview.variant === 'title'
                ? 'tt-board-link-deferred-title'
                : 'tt-board-link-deferred-inline'
            )}
            style={{ width: innerW, minHeight: innerH }}
            aria-hidden
          >
            <span className="tt-board-link-deferred-icon">
              {boardLinkPreview.icon ? (
                <span className="tt-board-link-deferred-emoji">{boardLinkPreview.icon}</span>
              ) : (
                <FileText className="tt-board-link-deferred-fallback h-4 w-4 text-gray-500 dark:text-gray-400" />
              )}
            </span>
            <span className="tt-board-link-deferred-label">
              {boardLinkPreview.title || boardTitleOrDefault(null)}
            </span>
          </div>
        ) : staticHtml ? (
          // No capture yet (first visit to a board, or a frame the pointer has never reached) and the
          // stored HTML is right here, so render it inert rather than shimmer bars. Staged promotion is
          // one frame per animation frame, so during a zoom-out the last arrivals waited a few hundred
          // ms — and an empty box for that long is exactly what "frames out of view don't render until
          // I release the zoom" looked like. Same prose classes as the live editor, so it reads as the
          // frame, not as a placeholder; the live editor still replaces it when the frame promotes.
          <div
            className="tiptap prose max-w-none block w-full"
            data-tt-cold-frame=""
            aria-hidden
            dangerouslySetInnerHTML={{ __html: staticHtml }}
          />
        ) : (
          <FrameContentShimmer
            hasText={shimmerHasText}
            barCount={barCount}
            withGutter={false}
            matchFramePad
            className="h-full w-full"
            style={{ width: innerW, height: innerH, minWidth: innerW, minHeight: innerH }}
          />
        )}
      </div>
    </div>
  )
}

function TipTapContentLive({
  content,
  className,
  originalContent,
  onContentChange,
  onHasChangesChange,
  onComment,
  comments = [],
  editorRef,
  onCommentHover,
  onCommentClick,
  onAddReaction,
  section,
  isFlashcard,
  placeholder,
  isPanelSelected,
  isLoading,
  onBlur,
  onEditorActiveChange,
  fontScale,
  enableBlockHandles = false, // Keep ⋮⋮ gutter (`pl-6`) for **blocks** — must not flip mid-drag
  showBlockHandles = true, // Paint/arm ⋮⋮ grips; false while RF frame-dragging (gutter stays)
  singleLineUntilEnter = false, // Unresized blocks: one visual line per TipTap block
  alignInFrame = false, // Wrap column / free nowrap: fill the box so text-align can land
  hugCenterStack = false, // Free left: hug the widest block and center that column
  frameAlignX = 'left', // Frame Alignment — stamp on PM so wrap leftovers sit on the free edge
  hostNodeId,
  conversationId,
  hostMessageId,
  boardInTargets,
  onPageTurnInto,
  suspendContentSync = false, // True while RF frame-dragging — skip setContent remounts
  dragSuspendRef, // Sync flag armed on pointerdown (React state alone is one frame late)
  seedSuspendRef, // Armed while I-bar seeds are still landing — content lags the caret by a key
  frameDragging = false, // RF frame drag — databaseBlock swaps to a light shell
  frameFreeResize = false, // Unlocked user-sized frame — DB table fills clip box
  frameClipHeight = null, // Host clipBoxH (layout px) for DB scroll sizing
  frameClipPreview = false, // Hover peek — show full table, not the clip viewport
  dbAlwaysExpanded = false, // Frame menu: DB shows every row even unselected (still static)
  dbVisibleRowCap = 12, // Per-frame Notion DB show-more unlock (message metadata)
  forceContentSyncKey = 0, // Bump to setContent even while editor is focused (AI eye / remove / save)
  notionConnected = false, // Connections → Notion selected
  notionSync = 'live', // Live Sync vs Manual
  onNotionConnection,
  propertyType = null, // Turn into → Property on this frame
  onPropertyTurnInto,
  onPropertyHeadersChange, // Host paints empty property icons above the fill
  loadCrossfade = false, // Board load: keep the shell overlay and fade it out; new frames skip this
  viewportCrossfade = false, // Viewport mount: dissolve shell when TipTap first mounts off cold load
  deferredBox = null, // Cached box/kind — sizes the cold copy held while a re-promotion mounts
  contentPadLeft = 0, // contentFit paddingLeft — ⋮⋮ centers in the blue gutter past this pad
  frameScale = 1, // Locked-resize CSS scale — grips remeasure when it changes
  handleGutterFlow = 0, // Blue L/R gutter width (flow px) — ⋮⋮ local left compensates contentFit scale
  centerInShape = false, // Silhouette frames: center TipTap in the visible cross / diamond
  enableCollab = true, // False for Notion page bodies (Notion remains content SoT)
  fitToText = false, // Locked hug — selected body press moves the frame until a caret
}: {
  content: string
  className?: string
  originalContent: string
  onContentChange?: (newContent: string) => void
  onHasChangesChange?: (hasChanges: boolean) => void
  onComment?: (selectedText: string, from: number, to: number) => void
  comments?: Comment[]
  editorRef?: React.MutableRefObject<any>
  onCommentHover?: (commentId: string | null) => void
  onCommentClick?: (commentId: string) => void
  onAddReaction?: (selectedText: string, from: number, to: number, emoji: string, section: 'prompt' | 'response') => void
  section?: 'prompt' | 'response'
  isFlashcard?: boolean
  placeholder?: string
  isPanelSelected?: boolean
  isLoading?: boolean
  onBlur?: () => void
  onEditorActiveChange?: (isActive: boolean) => void // Called when editor is focused or has selection
  fontScale?: number // Font scale factor for resized panels (defaults to 1)
  enableBlockHandles?: boolean // Gutter + property/Notion chrome for frames that own TipTap blocks
  showBlockHandles?: boolean // False mid-drag so ⋮⋮ unmount without collapsing `pl-6`
  singleLineUntilEnter?: boolean // Unresized map blocks: grow width; Enter starts a new line
  alignInFrame?: boolean // Wrap / free nowrap: PM fills the box so Alignment text-align can land
  hugCenterStack?: boolean // Free left: PM fits the widest block so the spacer can center it
  frameAlignX?: FrameAlignX // Stamp text-align on the editor — inherit loses to TipTap’s inline left
  hostNodeId?: string
  conversationId?: string // Page id — ⋮⋮ extract a block onto the page
  hostMessageId?: string // Frame message id — Convert layout API source
  boardInTargets?: BoardInTarget[]
  onPageTurnInto?: (blockType: 'board' | 'boardIn', boardInParentId?: string | null) => void
  suspendContentSync?: boolean
  dragSuspendRef?: React.MutableRefObject<boolean> // Parent mutates sync on pointerdown
  seedSuspendRef?: React.MutableRefObject<boolean> // Parent arms it per I-bar seed (rolling window)
  frameDragging?: boolean
  frameFreeResize?: boolean
  frameClipHeight?: number | null
  frameClipPreview?: boolean
  dbAlwaysExpanded?: boolean
  dbVisibleRowCap?: number
  forceContentSyncKey?: number
  notionConnected?: boolean
  notionSync?: NotionSyncMode
  onNotionConnection?: (next: { connected: boolean; sync?: NotionSyncMode }) => void
  propertyType?: PropertyTypeId | null // Frame property chrome at top
  onPropertyTurnInto?: (propertyType: PropertyTypeId) => void // ⋮⋮ Turn into → Property
  onPropertyHeadersChange?: (items: PropertyHeaderItem[]) => void // Live top-chrome icons
  loadCrossfade?: boolean // Fade the load shell out as TipTap fades in (skip for fadeIn creates)
  viewportCrossfade?: boolean // Pan-in mount: same dissolve as load crossfade
  deferredBox?: DeferredFrameBox | null
  contentPadLeft?: number // contentFit padL — grip centering past the fill edge
  frameScale?: number // Locked-resize scale — ⋮⋮ remeasure (CSS transform skips RO)
  handleGutterFlow?: number // Adjust-box L gutter (flow px); grips inverse-scale into it
  centerInShape?: boolean // Shaped frame: center text in silhouette
  enableCollab?: boolean // Local frames join board Yjs; Notion bodies stay HTML/LWW
  fitToText?: boolean // Locked hug — no empty peach, so the text itself must drag
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { setActiveEditor } = useEditorContext()
  const { canEdit } = useBoardAccess() // view/comment → read-only editors (RLS still enforces)
  const boardCollab = useBoardCollab() // Shared board Y.Doc when multiplayer is on
  // Live frame-selected flag for TipTap DOM handlers (useEditor config is not recreated each render)
  const isPanelSelectedRef = useRef(!!isPanelSelected)
  isPanelSelectedRef.current = !!isPanelSelected
  const fitToTextRef = useRef(!!fitToText) // Live lock — editorProps handlers stay identity-stable
  fitToTextRef.current = !!fitToText
  const textEditing = useSyncExternalStore(
    subscribeFrameTextEdit, // Caret on/off
    () => isFrameTextEditActive(hostNodeId), // This frame only
    () => false
  )
  // Hug covers the peach — drag the text until a caret; then TipTap owns the press
  const fitBodyDrag = !!fitToText && !!isPanelSelected && !textEditing
  const hostNodeIdRef = useRef(hostNodeId) // Stable for editorProps memo (avoid setOptions every render)
  hostNodeIdRef.current = hostNodeId
  // Same gesture that selects an unselected frame must not place the I-bar
  const selectOnlyClickRef = useRef(false)
  const lastAiForceSyncRef = useRef(0) // Last forceContentSyncKey we allowed while focused
  // Keep latest callbacks in refs so editorProps / onUpdate stay referentially stable across
  // RF drag re-renders (unstable options → useEditor setOptions every frame → databaseBlock NodeView remounts → table vanishes).
  const originalContentRef = useRef(originalContent)
  originalContentRef.current = originalContent
  const onContentChangeRef = useRef(onContentChange)
  onContentChangeRef.current = onContentChange
  const onHasChangesChangeRef = useRef(onHasChangesChange)
  onHasChangesChangeRef.current = onHasChangesChange
  const onBlurRef = useRef(onBlur)
  onBlurRef.current = onBlur
  const onEditorActiveChangeRef = useRef(onEditorActiveChange)
  onEditorActiveChangeRef.current = onEditorActiveChange
  const setActiveEditorRef = useRef(setActiveEditor)
  setActiveEditorRef.current = setActiveEditor
  const suspendContentSyncRef = useRef(suspendContentSync)
  suspendContentSyncRef.current = suspendContentSync
  const contentRef = useRef(content)
  contentRef.current = content
  const propertyTypeRef = useRef(propertyType) // Unmount seed must see the latest type, not the first render
  propertyTypeRef.current = propertyType
  const onPropertyHeadersChangeRef = useRef(onPropertyHeadersChange)
  onPropertyHeadersChangeRef.current = onPropertyHeadersChange
  const collabSeededRef = useRef(false) // One-shot HTML → Y.XmlFragment seed per mount

  const resolvedPlaceholder =
    placeholder !== undefined && placeholder !== ''
      ? placeholder
      : placeholder === undefined
        ? section === 'prompt'
          ? 'What are you trying to remember?'
          : 'Explain it clearly or let AI help'
        : ''

  // Multiplayer: wait for board sync, then bind Collaboration to this frame's fragment
  const collabReady =
    enableCollab &&
    boardCollab.configured &&
    boardCollab.synced &&
    !!boardCollab.provider &&
    !!boardCollab.localUser &&
    !!hostMessageId
  const collabFragment = collabReady ? boardCollab.getFragment(hostMessageId!) : null
  const collabActive = !!(collabReady && collabFragment)

  // Stable across drag ticks — createPanelExtensions() allocates new StarterKit instances each call
  const extensions = useMemo(
    () =>
      createPanelExtensions(
        resolvedPlaceholder,
        collabActive && collabFragment && boardCollab.provider && boardCollab.localUser
          ? {
              fragment: collabFragment,
              provider: boardCollab.provider,
              user: {
                name: boardCollab.localUser.name,
                color: boardCollab.localUser.color,
              },
            }
          : null
      ),
    [
      resolvedPlaceholder,
      collabActive,
      collabFragment,
      boardCollab.provider,
      boardCollab.localUser,
    ]
  )

  const editorProps = useMemo(
    () => ({
      attributes: {
        class: cn(
          'prose max-w-none focus:outline-none min-h-[20px] cursor-text nokey', // nokey: RF must not treat Backspace as frame delete while typing
          isFlashcard && 'text-xl', // Increase font size for flashcards
          centerInShape && 'text-center' // Shaped frames: lines centered in silhouette
        ),
        ...(singleLineUntilEnter ? { 'data-single-line': 'true' } : {}), // CSS nowrap until Enter
      },
      handleDOMEvents: {
        // Desktop / pen: claim the gesture when selected (phone uses non-passive touchstart below —
        // PM registers touchstart as passive, so preventDefault there is a no-op).
        pointerdown: (view: any, event: Event) => {
          const pe = event as PointerEvent
          if (pe.pointerType === 'touch') return false // Phone: non-passive touchstart owns placement
          if (pe.button === 2) return false // Right-click → frame menu
          if (!isPanelSelectedRef.current) return false // Unselected: RF selects/drags
          // Preview / open / Notion / DB table (and ⋮⋮) must receive the click — don't steal for caret
          const target = pe.target as HTMLElement | null
          if (
            target?.closest?.(
              '[data-tt-block-handle], [data-tt-insert-line], .block-actions-menu, [data-page-link-preview], .tt-capture-link, .tt-database-block, .tt-notion-db, [data-notion-sync="true"]'
            )
          ) {
            return false
          }
          // Fit-to hug has no empty peach. Until a caret (or the open menu's next click), let RF drag.
          if (
            fitToTextRef.current &&
            !isFrameTextEditActive(hostNodeIdRef.current) &&
            !document.querySelector('.node-popup')
          ) {
            return false
          }
          // stopPropagation alone keeps RF/d3 from starting a frame drag; preventDefault here
          // would kill the native selection gesture, so press+drag could never select text.
          pe.stopPropagation()
          selectOnlyClickRef.current = false
          // Don't arm text-edit on the click that opens the frame menu (caret already in this frame only)
          if (
            hostNodeIdRef.current &&
            (isFrameTextEditActive(hostNodeIdRef.current) || view.hasFocus())
          ) {
            setFrameTextEditActive(hostNodeIdRef.current) // Already editing → keep Delete on text
          }
          return false // Browser/PM own caret placement + drag-select
        },
        mousedown: (view: any, event: Event) => {
          const mouseEvent = event as MouseEvent
          // Right-click: skip PM I-bar. Do NOT stopPropagation/preventDefault — Chrome
          // then never fires contextmenu, so the frame menu never opens.
          if (mouseEvent.button === 2) {
            return true // Skip ProseMirror caret; let contextmenu bubble to the frame menu
          }
          const mouseTarget = mouseEvent.target as HTMLElement | null
          // Sync highlight → red toggle (frame onClick); never place I-bar when selected
          if (mouseTarget?.closest?.('[data-notion-sync="true"]')) {
            mouseEvent.preventDefault()
            mouseEvent.stopPropagation()
            selectOnlyClickRef.current = false
            clearFrameTextEditActive()
            return true
          }
          // Unselected: editor is already editable:false — do NOT preventDefault here
          // (that aborted RF/d3 frame drag on press+move). Only suppress the follow-up I-bar.
          if (!isPanelSelectedRef.current) {
            selectOnlyClickRef.current = true // Suppress I-bar on the matching click
            clearFrameTextEditActive() // Selecting the frame — not editing yet
            return false
          }
          // DB table / title chrome owns clicks (cells, toolbar) — table nodrag stops RF drag
          if (mouseTarget?.closest?.('.tt-database-block, .tt-notion-db')) {
            return false
          }
          // Same as pointerdown — fit-to body press moves the frame until text-edit
          if (
            fitToTextRef.current &&
            !isFrameTextEditActive(hostNodeIdRef.current) &&
            !document.querySelector('.node-popup')
          ) {
            return false
          }
          selectOnlyClickRef.current = false
          // Menu-open click must not arm text-edit; keep it only when a caret is already here
          if (
            hostNodeIdRef.current &&
            (isFrameTextEditActive(hostNodeIdRef.current) ||
              document.activeElement === view.dom ||
              view.dom.contains(document.activeElement))
          ) {
            setFrameTextEditActive(hostNodeIdRef.current) // Already editing → caret / text select
          }
          // No preventDefault — the browser needs the default mousedown to run a drag-select.
          mouseEvent.stopPropagation()

          // Temporary reveal: click a hazed span to clear blur until click-away / blur
          const hazeTarget = (mouseEvent.target as HTMLElement | null)?.closest?.(
            '[data-haze="true"]'
          ) as HTMLElement | null
          view.dom.querySelectorAll('.tt-haze-revealed').forEach((el: Element) => {
            if (el !== hazeTarget) el.classList.remove('tt-haze-revealed') // Hide previously revealed spans
          })
          if (hazeTarget) {
            hazeTarget.classList.add('tt-haze-revealed') // Reveal this hazed block temporarily
          }

          return false // PM's own mousedown owns caret + shift/double/triple-click + drag-select
        },
        contextmenu: (_view: any, event: Event) => {
          event.preventDefault() // Block native Cut/Copy so the frame menu can show
          return false // Let it bubble to RF / board-flow capture
        },
        blur: (view: any) => {
          // Re-haze any temporarily revealed spans when the editor loses focus
          view.dom.querySelectorAll('.tt-haze-revealed').forEach((el: Element) => {
            el.classList.remove('tt-haze-revealed')
          })
          return false
        },
        paste: (view: any, event: Event) => {
          if (handleCaptureLinkPaste(view, event as ClipboardEvent)) return true
          const clipboardData = (event as ClipboardEvent).clipboardData
          // Single-line frames: paste as one visual line (Enter still creates blocks)
          if (view.dom.getAttribute('data-single-line') !== 'true') return false // Wrap mode keeps normal multi-line paste
          if (clipboardData) {
            const pastedText = clipboardData.getData('text/plain')
            const normalizedText = pastedText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim()
            if (normalizedText) {
              // Insert text at current cursor position
              const { state, dispatch } = view
              const { from, to } = state.selection
              // Insert the normalized text, replacing any selected text
              const transaction = state.tr.insertText(normalizedText, from, to)
              dispatch(transaction)
              // Prevent default paste behavior
              event.preventDefault()
              return true
            }
          }
          return false
        },
      },
    }),
    [isFlashcard, singleLineUntilEnter, centerInShape]
  )

  const editor = useEditor(
    {
      extensions,
      // When CRDT is active, Y.XmlFragment is SoT — omit HTML content (seed empty fragments below)
      content: collabActive ? undefined : content,
      // Unselected frames are not contenteditable — iOS long-press opens the frame menu, not text select
      // Fit-to stays non-editable until a caret so ProseMirror does not swallow the drag
      editable: canEdit && !!isPanelSelected && !(fitToText && !isFrameTextEditActive(hostNodeId)),
      immediatelyRender: false, // Prevent SSR hydration mismatches
      shouldRerenderOnTransaction: false, // Avoid parent re-render storms; NodeViews update themselves
      editorProps,
      onUpdate: ({ editor: ed }) => {
        // Frame drag: NodeView remount noise must not wipe boardLink / property cells to the DB.
        // dragSuspendRef is set sync on pointerdown — React suspendContentSync lags one frame.
        if (suspendContentSyncRef.current || dragSuspendRef?.current) return
        const newContent = ed.getHTML()
        const hasChanged = newContent !== originalContentRef.current
        onHasChangesChangeRef.current?.(hasChanged)
        onContentChangeRef.current?.(newContent)
      },
      onFocus: ({ editor: ed }) => {
        // Register this editor as active when focused
        setActiveEditorRef.current(ed)
        // Notify parent that editor is active (focused or has selection)
        onEditorActiveChangeRef.current?.(true)
      },
      onBlur: ({ editor: ed }) => {
        // Call custom onBlur callback if provided
        onBlurRef.current?.()
        // Keep frame selected only for a real TEXT range (format popup). boardLink atoms use
        // NodeSelection (from≠to) — counting that re-selected the frame on every pane click.
        if (ed && onEditorActiveChangeRef.current) {
          const sel = ed.state.selection
          const hasTextRange = sel instanceof TextSelection && !sel.empty
          onEditorActiveChangeRef.current(hasTextRange)
        } else {
          onEditorActiveChangeRef.current?.(false)
        }
      },
    },
    // Non-empty deps: TipTap skips per-render setOptions (deps=[] compares options every RF
    // drag tick → remounts databaseBlock NodeView → table vanishes / frame hugs to a stub).
    // Include collabActive so we remount once when Yjs binds (UniqueID / empty-para safety).
    [extensions, editorProps, collabActive]
  )

  // First peer: seed empty Y fragment from durable HTML once (others already have CRDT state)
  useEffect(() => {
    if (!editor || editor.isDestroyed || !collabActive) return
    if (collabSeededRef.current) return
    if (!boardCollab.fragmentNeedsSeed(hostMessageId!)) {
      collabSeededRef.current = true
      return
    }
    // Only seed an empty editor. Live I-bar creates stay off collab (`isIbarLiveCreate`); this
    // path is reload / first peer. Skip if the doc already has text so we don't clobber typing.
    const html = (contentRef.current || '').trim()
    if (html && html !== '<p></p>' && isBlockContentEmpty(editor.getHTML())) {
      editor.commands.setContent(html, { emitUpdate: false })
    }
    collabSeededRef.current = true
  }, [editor, collabActive, boardCollab, hostMessageId])

  // Keep FrameHost storage in sync so databaseBlock NodeViews can convert layout without React context
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const storage = editor.storage as {
      frameHost?: {
        conversationId: string | null
        hostMessageId: string | null
        hostNodeId: string | null
        frameDragging: boolean
      }
    }
    if (!storage.frameHost) return
    storage.frameHost.conversationId = conversationId || null
    storage.frameHost.hostMessageId = hostMessageId || null
    storage.frameHost.hostNodeId = hostNodeId || null
  }, [editor, conversationId, hostMessageId, hostNodeId])

  // Sync RF drag + free-resize + selection before paint so databaseBlock expands on every select
  useLayoutEffect(() => {
    if (!editor || editor.isDestroyed) return
    const storage = editor.storage as {
      frameHost?: {
        conversationId: string | null
        hostMessageId: string | null
        frameDragging: boolean
        frameSelected: boolean
      }
    }
    if (!storage.frameHost) return
    storage.frameHost.frameDragging = !!frameDragging
    storage.frameHost.frameSelected = !!isPanelSelected
    const dom = editor.view?.dom as HTMLElement | undefined
    if (dom) {
      if (frameDragging) dom.setAttribute('data-frame-dragging', 'true')
      else dom.removeAttribute('data-frame-dragging')
      if (isPanelSelected) dom.setAttribute('data-frame-selected', 'true')
      else dom.removeAttribute('data-frame-selected')
      if (frameFreeResize) dom.setAttribute('data-frame-free-resize', 'true')
      else dom.removeAttribute('data-frame-free-resize')
      if (frameFreeResize && frameClipHeight != null && frameClipHeight > 0) {
        dom.setAttribute('data-frame-clip-height', String(Math.round(frameClipHeight)))
      } else {
        dom.removeAttribute('data-frame-clip-height')
      }
      if (frameClipPreview) dom.setAttribute('data-clip-preview', 'true')
      else dom.removeAttribute('data-clip-preview')
      // databaseBlock reads expand policy + row unlock off the host frame (per message — not per Notion DB id)
      if (dbAlwaysExpanded) dom.setAttribute('data-db-always-expanded', 'true')
      else dom.removeAttribute('data-db-always-expanded')
      dom.setAttribute('data-db-visible-row-cap', String(dbVisibleRowCap))
      // Wake databaseBlock NodeViews — storage mutation alone does not re-render them
      dom.dispatchEvent(
        new CustomEvent('tt-frame-selected', { detail: { selected: !!isPanelSelected } })
      )
    }
  }, [editor, frameDragging, frameFreeResize, frameClipHeight, frameClipPreview, isPanelSelected, dbAlwaysExpanded, dbVisibleRowCap])

  // Top icons = **empty** propertyBlock headers in doc order (filled cells stay in the body only)
  const [propertyHeaders, setPropertyHeaders] = useState<PropertyHeaderItem[]>(() =>
    seedPropertyHeaders(content, propertyType)
  )
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const sync = () => {
      const fromDoc = readPropertyBlockHeadersFromDoc(editor.state.doc)
      let next = fromDoc
      if (fromDoc.length === 0) {
        let anyProp = false
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'propertyBlock') {
            anyProp = true
            return false
          }
          return true
        })
        next = !anyProp && propertyType ? [{ type: propertyType, name: '', from: -1 }] : []
      }
      next = propertyHeadersForChrome(next, content) // Drop nameless [] on Notion DB frames
      setPropertyHeaders((prev) =>
        prev.length === next.length &&
        prev.every(
          (it, i) =>
            it.type === next[i].type && it.name === next[i].name && it.from === next[i].from
        )
          ? prev
          : next
      )
    }
    sync()
    editor.on('update', sync)
    return () => {
      editor.off('update', sync)
    }
  }, [editor, propertyType, content])

  // Going cold unmounts the editor. Re-seed the strip from saved HTML so the icons stay up.
  useEffect(() => {
    return () => {
      const seeded = seedPropertyHeaders(contentRef.current || '', propertyTypeRef.current)
      if (seeded.length > 0) onPropertyHeadersChangeRef.current?.(seeded)
    }
  }, [])

  // Host paints the top chrome band — keep icons live as the doc changes.
  useEffect(() => {
    onPropertyHeadersChange?.(propertyHeaders)
  }, [propertyHeaders, onPropertyHeadersChange])

  // Editable only when this frame is selected (and share role allows). Unselected = no iOS text loupe.
  // Fit-to: also wait for a caret — otherwise the hug's text cannot start an RF drag.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const editing = isFrameTextEditActive(hostNodeId)
    const next = canEdit && !!isPanelSelected && !(fitToText && !editing)
    if (editor.isEditable !== next) editor.setEditable(next)
    const dom = editor.view?.dom as HTMLElement | undefined
    if (dom) dom.style.cursor = fitToText && isPanelSelected && !editing ? 'grab' : '' // I-beam only once the caret owns the text
    // Drop any caret / native selection when the frame becomes unselected.
    // Fit-to selected-but-not-editing is also non-editable — that is not a deselect.
    if (!(canEdit && isPanelSelected) && editor.view?.dom) {
      clearFrameTextEditActive() // Deselect → Delete no longer targets this frame's text
      try {
        editor.commands.blur()
        window.getSelection()?.removeAllRanges()
      } catch {
        // ignore
      }
    }
  }, [editor, canEdit, isPanelSelected, fitToText, textEditing, hostNodeId])

  // Phone: PM registers touchstart as {passive:true}, so handleDOMEvents cannot preventDefault.
  // Non-passive capture listener claims the tap → I-bar on first finger press (not second).
  useEffect(() => {
    if (!editor || editor.isDestroyed || !isPanelSelected || !canEdit) return
    const dom = editor.view.dom as HTMLElement
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return // Pinch / multi-finger → board zoom/pan
      const target = e.target as HTMLElement | null
      // Preview / open / Notion / DB live inside TipTap NodeViews — preventDefault here kills
      // their click AND suppresses pointerdown for finger 1, so a later pinch never arms.
      if (
        target?.closest?.(
          '[data-tt-block-handle], [data-tt-insert-line], .block-actions-menu, [data-page-link-preview], .tt-database-block, .tt-notion-db, [data-notion-sync="true"]'
        )
      ) {
        return // ⋮⋮ / insert / board open / DB / sync highlight own the gesture
      }
      // Fit-to: first finger moves the frame. Caret waits for text-edit or the open menu.
      if (
        fitToTextRef.current &&
        !isFrameTextEditActive(hostNodeId) &&
        !document.querySelector('.node-popup')
      ) {
        return
      }
      if (!editor.isEditable) editor.setEditable(true) // This touch places the caret
      e.preventDefault() // Requires non-passive — stops iOS focus-only first tap
      e.stopPropagation() // RF d3-drag listens for touchstart on the node
      selectOnlyClickRef.current = false
      if (hostNodeId) setFrameTextEditActive(hostNodeId) // Caret placed → Backspace edits text
      const t = e.touches[0]
      try {
        const hit = editor.view.posAtCoords({ left: t.clientX, top: t.clientY })
        if (hit != null && hit.pos >= 0) {
          const sel = TextSelection.near(editor.state.doc.resolve(hit.pos))
          editor.view.dispatch(editor.state.tr.setSelection(sel).scrollIntoView())
        }
        editor.view.focus()
      } catch {
        try {
          editor.view.focus()
        } catch {
          /* ignore */
        }
      }
    }
    dom.addEventListener('touchstart', onTouchStart, { passive: false, capture: true })
    return () => dom.removeEventListener('touchstart', onTouchStart, { capture: true })
  }, [editor, isPanelSelected, canEdit, hostNodeId])

  // Register editor on mount and cleanup on unmount
  useEffect(() => {
    if (editor) {
      setActiveEditor(editor)
      if (editorRef) {
        editorRef.current = editor
      }
      return () => {
        setActiveEditor(null)
        if (editorRef) {
          editorRef.current = null
        }
      }
    }
  }, [editor, setActiveEditor, editorRef])

  // Apply font scale to editor's DOM element when fontScale changes
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    
    const scale = fontScale ?? 1
    const editorDOM = editor.view.dom as HTMLElement
    
    if (editorDOM) {
      // Apply font size directly to the editor's DOM element
      // This will affect all content in the editor
      editorDOM.style.fontSize = `${scale}em`
    }
  }, [editor, fontScale])

  // Keep single-line mode in sync (unresized map blocks grow until Enter)
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const editorDOM = editor.view.dom as HTMLElement
    editorDOM.style.setProperty('text-align', frameAlignX, 'important') // Beat TipTap inline text-align:left
    if (hugCenterStack) {
      if (singleLineUntilEnter) editorDOM.setAttribute('data-single-line', 'true') // Nowrap until Enter
      else editorDOM.removeAttribute('data-single-line') // Wrap at the parent column
      editorDOM.style.setProperty('width', 'fit-content', 'important') // Hug the widest block — not the frame
      editorDOM.style.setProperty('max-width', '100%', 'important') // Still wrap at the wrap-line column
      editorDOM.style.minWidth = '0' // Don't force max-content past the wrap line
      editorDOM.style.marginLeft = 'auto' // Center that hug column in the frame / wrap box
      editorDOM.style.marginRight = 'auto' // Pair with left auto so the widest block sits mid-frame
    } else if (singleLineUntilEnter) {
      editorDOM.setAttribute('data-single-line', 'true') // nowrap; CSS fills frame width
      editorDOM.style.width = '100%' // Stretch to content box — empty/short lines stay full-row
      editorDOM.style.minWidth = alignInFrame ? '0' : 'max-content' // Align box: don't hug past the frame
      editorDOM.style.marginLeft = '' // Clear a leftover free-left center
      editorDOM.style.marginRight = ''
    } else {
      editorDOM.removeAttribute('data-single-line')
      editorDOM.style.marginLeft = '' // Clear a leftover free-left center
      editorDOM.style.marginRight = ''
      if (alignInFrame) {
        editorDOM.style.setProperty('width', '100%', 'important') // Fill the wrap column — shrink-to-fit left leftovers on the right
        editorDOM.style.minWidth = '0'
      } else {
        editorDOM.style.width = ''
        editorDOM.style.minWidth = ''
      }
    }
  }, [editor, singleLineUntilEnter, alignInFrame, hugCenterStack, frameAlignX])

  // Snapshot this frame's rendered subtree so the cold frame can replay it inert instead of
  // re-deriving an approximation. Idle-scheduled and debounced: the capture is only needed the
  // *next* time this frame goes cold, so it must never compete with typing or a gesture.
  // DB frames use a compact/expanded key slot and only capture while `!data-tt-db-live` (idle static).
  const snapshotKey = frameSnapshotKey(hostMessageId, section, {
    dbExpand: dbExpandSnapshotSlot(content, dbAlwaysExpanded),
  })
  useEffect(() => {
    if (!editor || editor.isDestroyed || !conversationId || !snapshotKey) return
    let idleHandle: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const capture = () => {
      if (!editor || editor.isDestroyed) return
      if (isFrameDragging() || isBoardNavigating()) return // Mid-gesture DOM is a moving target
      captureFrameSnapshot({
        conversationId,
        key: snapshotKey,
        content,
        root: editor.view.dom as HTMLElement,
      })
    }
    // Wait for NodeViews + hug measurement to settle, then take the idle slot if the browser has one.
    // Deselect / expand toggle re-runs this so we replace any live-table attempt with the idle paint.
    timer = setTimeout(() => {
      timer = null
      const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
        .requestIdleCallback
      if (ric) idleHandle = ric(capture, { timeout: 2000 })
      else timer = setTimeout(capture, 300)
    }, 500)
    return () => {
      if (timer) clearTimeout(timer)
      const cic = (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback
      if (idleHandle != null && cic) cic(idleHandle)
    }
  }, [editor, conversationId, snapshotKey, content, isPanelSelected, dbAlwaysExpanded])

  // Apply blue highlights to commented text when comments change
  useEffect(() => {
    if (!editor || comments.length === 0) return

    // Apply blue highlight to all commented text ranges using transaction
    const tr = editor.state.tr

    comments.forEach((comment) => {
      try {
        const { from, to } = comment
        if (from >= 0 && to <= editor.state.doc.content.size && from < to) {
          // Remove all existing highlight marks (including yellow) and apply blue highlight
          tr.removeMark(from, to, editor.schema.marks.highlight)
          const blueHighlight = editor.schema.marks.highlight.create({ color: '#dbeafe' }) // blue-100 - slightly darker than blue-50
          tr.addMark(from, to, blueHighlight)
          // Debug: log to verify the mark attributes
          console.log('Blue highlight mark attributes:', blueHighlight.attrs)
        }
      } catch (error) {
        console.error('Error applying comment highlight:', error)
      }
    })

    // Dispatch the transaction if there are any changes
    if (tr.steps.length > 0) {
      editor.view.dispatch(tr)
    }
  }, [editor, comments]) // Only depend on editor and comments, not content (content sync handles it)

  // Detect when editor is active (focused or has selection) and notify parent to auto-select panel.
  // Also publishes highlighted text as an AI composer context pill.
  useEffect(() => {
    if (!editor) return

    const checkEditorActive = () => {
      try {
        const sel = editor.state.selection
        // Text range only — NodeSelection on boardLink/databaseBlock is from≠to and must NOT
        // keep/re-select the host frame after a board (pane) click deselects it.
        const hasTextRange = sel instanceof TextSelection && !sel.empty
        const isFocused = editor.view.dom === document.activeElement || editor.view.dom.contains(document.activeElement)
        onEditorActiveChange?.(hasTextRange || isFocused)

        // Publish highlighted text as an AI context pill (cleared when caret / empty).
        // I-bar alone is not a text selection — frame pill stays "Current Frame".
        if (hostNodeId) {
          if (hasTextRange) {
            const text = editor.state.doc.textBetween(sel.from, sel.to, ' ')
            const trimmed = text.replace(/\s+/g, ' ').trim()
            if (trimmed) {
              setAiTextSelection({
                frameId: hostNodeId,
                text: trimmed,
              })
            } else {
              setAiTextSelection(null)
            }
          } else {
            setAiTextSelection(null)
          }
        }
      } catch (error) {
        // Ignore errors
      }
    }

    // Check on focus/blur
    editor.on('focus', checkEditorActive)
    editor.on('blur', checkEditorActive)
    // Check on selection changes
    editor.on('selectionUpdate', checkEditorActive)
    editor.on('update', checkEditorActive)

    // Initial check
    checkEditorActive()

    return () => {
      editor.off('focus', checkEditorActive)
      editor.off('blur', checkEditorActive)
      editor.off('selectionUpdate', checkEditorActive)
      editor.off('update', checkEditorActive)
      if (hostNodeId) setAiTextSelection(null) // Clear pill if this editor unmounts
    }
  }, [editor, onEditorActiveChange, hostNodeId])

  // Detect when cursor is inside commented text and show/select comment
  // Only works when comments are already visible (showComments is true)
  useEffect(() => {
    if (!editor || !onCommentHover || comments.length === 0) return

    const handleSelectionUpdate = () => {
      try {
        const { from } = editor.state.selection

        // Check if cursor is within any comment's range
        const commentAtCursor = comments.find(comment => {
          try {
            return from >= comment.from && from <= comment.to
          } catch (error) {
            return false
          }
        })

        if (commentAtCursor) {
          onCommentHover(commentAtCursor.id)
        } else {
          onCommentHover(null)
        }
      } catch (error) {
        // Ignore errors in selection handling
      }
    }

    // Listen to selection changes - use 'update' event which fires on any editor change including selection
    editor.on('update', handleSelectionUpdate)
    editor.on('selectionUpdate', handleSelectionUpdate)

    // Also check on mount and when editor becomes available
    handleSelectionUpdate()

    return () => {
      editor.off('update', handleSelectionUpdate)
      editor.off('selectionUpdate', handleSelectionUpdate)
    }
  }, [editor, comments, onCommentHover])

  // Handle clicks on commented text to show/select comment
  useEffect(() => {
    if (!editor || comments.length === 0 || !onCommentClick) return

    const handleClick = (event: MouseEvent) => {
      try {
        const { from } = editor.state.selection

        // Check if click is within any comment's range
        const commentAtClick = comments.find(comment => {
          try {
            return from >= comment.from && from <= comment.to
          } catch (error) {
            return false
          }
        })

        if (commentAtClick && onCommentClick) {
          // Show comments if hidden, and select the clicked comment
          onCommentClick(commentAtClick.id)
        }
      } catch (error) {
        // Ignore errors
      }
    }

    // Listen to clicks on the editor
    const editorDom = editor.view.dom
    editorDom.addEventListener('click', handleClick)

    return () => {
      editorDom.removeEventListener('click', handleClick)
    }
  }, [editor, comments, onCommentClick])

  useEffect(() => {
    if (!editor || editor.isDestroyed || !editor.view) return
    // Yjs owns the doc while multiplayer is synced — postgres HTML must not clobber carets
    const aiForce = forceContentSyncKey !== lastAiForceSyncRef.current
    if (collabActive && !aiForce) return
    // Caret owns the doc while typing — except when AI review forces a content swap
    if (editor.isFocused && forceContentSyncKey === lastAiForceSyncRef.current) return
    // While RF is dragging the frame, never setContent AND never consume a force-sync key
    // (consuming here dropped the post-drag restore and left row cards empty until a 2nd drag).
    if (suspendContentSync || dragSuspendRef?.current) return
    // I-bar handoff: `content` trails the capture buffer by a keystroke, so syncing it here
    // rewinds the doc the caret is typing into (ProseMirror then reconciles the live DOM against
    // the stale doc and doubles a char / splits the tail into its own block). Focus alone is not a
    // usable guard — the editor is momentarily unfocused between seed and focus('end').
    if (seedSuspendRef?.current) return
    if (forceContentSyncKey !== lastAiForceSyncRef.current) {
      lastAiForceSyncRef.current = forceContentSyncKey
    }
    const readEditorHtml = (): string | null => {
      if (editor.isDestroyed || !editor.view) return null
      try {
        return editor.getHTML()
      } catch {
        return null
      }
    }
    // Compare DOCUMENTS, not HTML strings. The boardLink NodeView adds a class and TipTap emits
    // attributes in its own order, so editor.getHTML() never byte-equals the stored HTML once a
    // boardLink exists — a raw string compare re-ran setContent every sync (infinite loop / page
    // unresponsive). doc.eq() ignores cosmetic class/attr-order/whitespace, so it's exact + stable.
    let differs = true
    try {
      const tmp = document.createElement('div') // Off-DOM parse target
      tmp.innerHTML = unwrapNestedFramesHtml(content || '<p></p>')
      const parsed = PMDOMParser.fromSchema(editor.schema).parse(tmp) // Stored HTML → PM doc
      differs = !editor.state.doc.eq(parsed) // Semantic equality (not string)
    } catch {
      const live = readEditorHtml()
      differs = live == null ? true : live !== content // View torn down mid-sync → restore on remount
    }
      // Same Notion DB atom already in the editor — skip setContent (avoids table remount on drag-end)
      if (differs && hasDatabaseBlockHtml(content)) {
        const propId = content.match(/data-notion-database-id=["']([^"']+)["']/i)?.[1]
        // Holder object, not a `let`: TS narrows a captured `let` to its initializer and can't see
        // the assignment inside `descendants`, which typed the id as `never` at the compare below.
        const found: { id: string | null } = { id: null }
        editor.state.doc.descendants((node) => {
          if (node.type.name === 'databaseBlock') {
            found.id = (node.attrs.notionDatabaseId as string) || null
            return false
          }
          return true
        })
        const editorId = found.id
        if (propId && editorId && propId.replace(/-/g, '') === editorId.replace(/-/g, '')) {
          differs = false
        }
      }
      // Row card / atom frames: editor may look “eq” after a remount stripped propertyBlocks — force restore
      const live = readEditorHtml()
      if (hasFrameAtomHtml(content)) {
        if (live != null) {
          const lostProps =
            countPropertyBlocks(content) > 0 && countPropertyBlocks(live) < countPropertyBlocks(content)
          const lostAtoms = !hasFrameAtomHtml(live) || isBlockContentEmpty(live)
          if (lostProps || lostAtoms) differs = true
        }
      }
      // Prop HTML lags a just-added cell — setContent here would drop it before the save lands
      if (
        live != null &&
        countPropertyBlocks(live) > countPropertyBlocks(content || '')
      ) {
        differs = false // Keep the editor doc
        onContentChangeRef.current?.(live) // Persist the richer HTML into promptContent / DB
      }
      // Sync prop → editor only when the document actually changed
      if (differs) {
        // TipTap setContent uses flushSync — defer so we never flush mid-React render/lifecycle
        const html = unwrapNestedFramesHtml(content || '<p></p>')
        const shouldFocusEmpty = !content || content.trim() === '' || content === '<p></p>'
        const commentList = comments
        queueMicrotask(() => {
          if (editor.isDestroyed || !editor.view) return
          // Focus can land BETWEEN the isFocused check above and this microtask — the I-bar seed
          // hands the caret over mid-keystroke (setContent → focus('end')). Re-check, or a stale
          // `content` prop rewinds the doc the caret is typing into and ProseMirror's DOMObserver
          // reconciles the live DOM against it: characters double, or the tail parses as a second
          // block (`<p>gsgsgsgs</p><p>g</p>`). AI force-sync still owns the doc regardless.
          if (editor.isFocused && !aiForce) return
          // emitUpdate:false — programmatic AI eye/discard/save must not fire onUpdate
          // (that set promptHasChanges and blocked discard from restoring the original)
          editor.commands.setContent(html, { emitUpdate: false })
          // Ensure cursor is visible by focusing if editor is empty
          if (shouldFocusEmpty) {
            // Set cursor position to start to show cursor
            setTimeout(() => {
              if (!editor.isDestroyed) editor.commands.setTextSelection(0)
            }, 0)
          }
          // Re-apply comment highlights after content is set
          if (commentList.length > 0) {
            setTimeout(() => {
              if (editor.isDestroyed) return
              const tr = editor.state.tr
              commentList.forEach((comment) => {
                try {
                  const { from, to } = comment
                  if (from >= 0 && to <= editor.state.doc.content.size && from < to) {
                    // Remove all existing highlight marks (including yellow) and apply blue highlight
                    tr.removeMark(from, to, editor.schema.marks.highlight)
                    tr.addMark(from, to, editor.schema.marks.highlight.create({ color: '#dbeafe' })) // blue-100 - slightly darker than blue-50
                  }
                } catch (error) {
                  console.error('Error applying comment highlight:', error)
                }
              })
              // Dispatch the transaction if there are any changes
              if (tr.steps.length > 0) {
                editor.view.dispatch(tr)
              }
            }, 0)
          }
        })
      }
  }, [editor, content, comments, suspendContentSync, forceContentSyncKey, collabActive])

  // Focus editor + place I-bar — only when the frame is already selected (not the select click)
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (!editor) return
    if (e.button !== 0) return // Right-click is the frame menu, not an I-bar
    // Unselected: never place caret — RF selects/drags the frame first
    if (!isPanelSelected) return
    // Sync highlight → let click bubble to frame onClick (red toggle); no I-bar
    const t = e.target as HTMLElement | null
    if (t?.closest?.('[data-notion-sync="true"]')) {
      clearFrameTextEditActive()
      return
    }
    // Same gesture that just selected the frame / armed a nest — no I-bar
    if (selectOnlyClickRef.current) {
      selectOnlyClickRef.current = false
      clearFrameTextEditActive() // First-select click must not arm text-edit Delete
      return
    }
    // Selected-frame click opens the frame menu; I-bar only after that (menu open) or while editing
    if (hostNodeId && !isFrameTextEditActive(hostNodeId) && !document.querySelector('.node-popup')) {
      return
    }
    // Drag-select ends with a click — collapsing to a caret here wiped the range every time
    if (!editor.state.selection.empty) {
      if (hostNodeId) setFrameTextEditActive(hostNodeId) // Keep text-edit Delete armed
      return
    }
    // DB table / cell inputs own the gesture — don't steal focus after a row warm.
    if (t?.closest?.('.tt-notion-db, .tt-database-block, input, textarea, select, [data-tt-db-row-warm]')) {
      return
    }
    e.stopPropagation()
    if (editor.isDestroyed) return
    if (!editor.isEditable) editor.setEditable(true) // Fit-to was non-editable so the previous press could drag
    if (hostNodeId) setFrameTextEditActive(hostNodeId) // Later text click → caret; Backspace edits text
    // Sync in this tap — setTimeout(0) broke iOS: first tap focused nothing, second placed I-bar
    try {
      // Always resolve against click coords so empty lines get the caret (not doc start/end)
      const posResult = editor.view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (posResult != null && posResult.pos >= 0) {
        editor.chain().focus().setTextSelection(posResult.pos).run()
        return
      }
    } catch {
      /* fall through */
    }
    editor.commands.focus()
  }, [editor, isPanelSelected, hostNodeId])

  // Extract 'inline' from className if present to apply inline-block display
  const isInline = className?.includes('inline')
  const otherClasses = className?.replace(/\binline\b/g, '').trim()
  // `loadCrossfade` is really just `fadeIn !== true`: a permanent per-frame prop, not "this is the
  // board load". So every *later* live mount replayed the board-load shell, and because RF unmounts
  // culled frames, panning one out and back re-promoted it and flashed shimmer bars over content that
  // had been correct on screen a moment earlier — caught in the act as live + shimmer + fade-out on the
  // same frame. A frame that has been live before this mount is a re-promotion: the right placeholder
  // is its own cold copy (what the eye just saw), held until the editor exists.
  const promoteKey = `${hostMessageId || hostNodeId || ''}:${section || ''}`
  const [isRepromotion] = useState(() => livePromotedFrames.has(promoteKey))
  useEffect(() => {
    livePromotedFrames.add(promoteKey)
  }, [promoteKey])
  // Keep the load shell until it finishes fading — TipTap mounts under it (immediatelyRender: false)
  const [keepShimmer, setKeepShimmer] = useState(
    () =>
      !!enableBlockHandles &&
      !isFlashcard &&
      !livePromotedFrames.has(promoteKey) &&
      (!!loadCrossfade || !!viewportCrossfade) &&
      !editor // Load / viewport shells — not new fadeIn frames
  )
  const [shimmerExiting, setShimmerExiting] = useState(false) // Opacity 1→0 once the editor exists
  // A re-promotion shows its cold copy instead of a shell, so the frame reads as itself for the whole
  // ~100–300ms TipTap mount rather than blinking to bars (or to nothing) and back.
  const coldPlaceholder = isRepromotion && !editor
  const showFrameShimmer =
    !!enableBlockHandles && !isFlashcard && !coldPlaceholder && (!editor || keepShimmer) // Mount shell, then load overlay
  const shimmerHasText = frameHasVisibleText(content) // Text lines vs solid box (empty / spaces)
  useEffect(() => {
    if (!editor || !keepShimmer) return // Nothing to fade, or already gone
    if (!enableBlockHandles || isFlashcard || (!loadCrossfade && !viewportCrossfade)) {
      setKeepShimmer(false) // Chat/flashcard/new frames never overlay a load shell
      return
    }
    setShimmerExiting(true) // Fade the shell out as real blocks are on screen
    const t = window.setTimeout(() => setKeepShimmer(false), BOARD_LOAD_FADE_MS) // Unmount after the CSS fade
    return () => window.clearTimeout(t)
  }, [editor, enableBlockHandles, isFlashcard, keepShimmer, loadCrossfade, viewportCrossfade])

  if (!editor && (!enableBlockHandles || isFlashcard)) return null // Chat/flashcard keep prior null mount

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-visible', // Grips sit in the panel’s left chrome (negative left)
        centerInShape ? 'w-fit max-w-full mx-auto' : 'w-full',
        isFlashcard ? 'cursor-pointer' : fitBodyDrag || !isPanelSelected ? 'cursor-grab' : 'cursor-text',
        !isPanelSelected && 'tt-frame-unselected', // CSS: no text select / callout until selected
        fitBodyDrag && 'tt-fit-body-drag', // Beat .ProseMirror user-select/cursor !important so a real drag isn't a text selection
        // Selected: nodrag so padding taps don't start RF drag. Fit-to skips it until a caret —
        // the hug is the whole hit target, so the body has to move the frame.
        isPanelSelected && !isFlashcard && !fitBodyDrag && 'nodrag nopan',
        isInline && 'inline-block',
        otherClasses
      )}
      onDragStart={(e) => {
        if (!fitBodyDrag) return
        e.preventDefault() // A native text drag replaces mousemove, so the frame never follows the pointer
      }}
      onClick={(e) => {
        // Unselected: let the click bubble so RF selects the frame (no caret)
        if (!isPanelSelected) return
        handleContainerClick(e)
      }}
    >
      {/* Notion-style format popup — outside highlight edge, stays open with selection */}
      {editor ? (
        <SelectionFormatPopupAnchor
          editor={editor}
          containerRef={containerRef}
          onComment={onComment}
        />
      ) : null}

      {/* Apply shimmer animation to prompt text when response is loading (not for flashcards) */}
      <div
        className={cn(
          'relative overflow-visible',
          centerInShape ? 'w-fit max-w-full mx-auto' : 'w-full',
          isLoading && !isFlashcard && 'shimmer'
        )}
      >
        {editor ? (
          <div>
            {/* ⋮⋮ paints outside the fill (negative left into panel chrome); no pl-6 inside the frame.
                Keep mounted during RF drag — unmounting mid-drag remounted atom NodeViews. */}
            <div>
              <TipTapBlockHandles
                editor={editor}
                enabled={enableBlockHandles && showBlockHandles && !isFlashcard}
                isPanelSelected={!!isPanelSelected}
                hostNodeId={hostNodeId}
                conversationId={conversationId}
                hostMessageId={hostMessageId}
                boardInTargets={boardInTargets}
                onPageTurnInto={onPageTurnInto}
                onPropertyTurnInto={onPropertyTurnInto}
                notionConnected={notionConnected}
                notionSync={notionSync}
                onNotionConnection={onNotionConnection}
                contentPadLeft={contentPadLeft}
                frameScale={frameScale}
                handleGutterFlow={handleGutterFlow}
              />
            </div>
            <EditorContent
              editor={editor}
              className={cn(
                'block',
                centerInShape ? 'w-fit max-w-full' : 'w-full',
                isPanelSelected && !fitBodyDrag && 'nodrag nopan'
              )}
            />
          </div>
        ) : null}
        {coldPlaceholder ? (
          <TipTapContentDeferred
            content={content}
            className={className}
            enableBlockHandles={enableBlockHandles}
            isFlashcard={isFlashcard}
            isPanelSelected={isPanelSelected}
            deferredBox={deferredBox}
            conversationId={conversationId}
            hostMessageId={hostMessageId}
            section={section}
            dbAlwaysExpanded={dbAlwaysExpanded}
          />
        ) : null}
        {showFrameShimmer ? (
          <div
            className={cn(
              editor && 'absolute inset-0 z-[1]',
              shimmerExiting && 'tt-board-load-fade-out'
            )}
            aria-hidden={!!editor}
          >
            <FrameContentShimmer
              hasText={shimmerHasText}
              barCount={shimmerBarCountFromHtml(content)}
              withGutter={false} // Gutter is panel chrome, not inside the fill shell
              style={
                !editor && !shimmerHasText
                  ? { width: BLOCK_LOCKED_MIN_W, height: BLOCK_MIN_FRAME_H, minWidth: BLOCK_LOCKED_MIN_W }
                  : undefined
              }
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function TipTapContent(
  props: Parameters<typeof TipTapContentLive>[0] & {
    mountImmediately?: boolean
    deferredBox?: DeferredFrameBox | null
    coldReady?: boolean
  }
) {
  const { mountImmediately, coldReady, ...liveProps } = props
  // Host computes coldReady once; re-deriving it here could disagree with `contentDeferred` and size
  // the frame as if live while this renders cold.
  const mountReason = useFrameContentMountReason(liveProps.hostNodeId)
  // DB frames always promote on near — TipTapContentDeferred cannot paint a databaseBlock.
  const isDbFrame = hasDatabaseBlockHtml(liveProps.content || '')
  // Phone: proximity never mounts. One imported page or a tall frame OOMs Safari on load.
  const stayColdOnNear = isPhoneLikeBoard() || (coldReady && !isDbFrame)
  const mountContent =
    mountReason !== false && !(mountReason === 'near' && stayColdOnNear)
  // RF mounts nodes as they cross the viewport edge. A first TipTap mount costs 100–300ms
  // (editor + NodeViews), so frames appearing mid-pan used to hitch the gesture — measured
  // p95 120ms / p99 306ms panning a 33-frame board vs 9ms/18ms when the visible set held still.
  const navigating = useSyncExternalStore(
    subscribeBoardNavigating,
    isBoardNavigating,
    () => false
  )
  const everLiveRef = useRef(false) // Already-live frames stay live — unmounting mid-pan remounts DB NodeViews
  const wantLive =
    mountImmediately ||
    liveProps.isPanelSelected ||
    liveProps.isFlashcard ||
    !liveProps.enableBlockHandles ||
    mountContent
  // Deferring a *first* mount through a gesture is only acceptable when a snapshot can stand in.
  // Without one there is no twin path anymore (it drifted and does not generalize), so mount TipTap
  // even mid-gesture — once, to capture idle paint — then stay cold on later proximity.
  // DB frames and already-live frames mount / stay live mid-nav so tables are not blank until stop.
  const canRenderCold = !!liveProps.enableBlockHandles && !liveProps.isFlashcard && !isDbFrame
  const shouldMountLive =
    wantLive && (!navigating || everLiveRef.current || !canRenderCold || !coldReady)
  useEffect(() => {
    if (shouldMountLive) everLiveRef.current = true
  }, [shouldMountLive])
  if (!shouldMountLive) {
    return <TipTapContentDeferred {...liveProps} deferredBox={liveProps.deferredBox} />
  }
  return (
    <TipTapContentLive
      {...liveProps}
      viewportCrossfade={
        !mountImmediately &&
        !liveProps.loadCrossfade &&
        !!liveProps.enableBlockHandles &&
        !liveProps.isFlashcard
      }
    />
  )
}

// Fetch study sets from user metadata
async function fetchStudySets(): Promise<Array<{ id: string; name: string }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('metadata')
      .eq('id', user.id)
      .single()

    if (error) {
      console.error('Error fetching study sets:', error)
      return []
    }

    const studySets = (profile?.metadata as Record<string, any>)?.studySets || []
    return Array.isArray(studySets) ? studySets : []
  } catch (error) {
    console.error('Error fetching study sets:', error)
    return []
  }
}

// Hook to check if flashcard tags are loaded and get tag IDs
// Uses React Query to ensure study sets are cached and ready
function useFlashcardTagsLoaded(responseMessageId: string | undefined): { isReady: boolean; tagIds: string[] } {
  const supabase = createClient()
  const [taggedStudySetIds, setTaggedStudySetIds] = useState<string[]>([])
  const [messageLoaded, setMessageLoaded] = useState(false)
  
  // Use React Query for study sets (same as TagBoxes) to ensure cache is ready
  const { data: studySets = [], isLoading: studySetsLoading } = useQuery({
    queryKey: ['studySets'],
    queryFn: fetchStudySets,
  })

  // Fetch message metadata to get tag IDs
  useEffect(() => {
    if (!responseMessageId) {
      setMessageLoaded(true)
      return
    }

    const fetchMessage = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setMessageLoaded(true)
          return
        }

        const { data: message, error } = await supabase
          .from('messages')
          .select('metadata')
          .eq('id', responseMessageId)
          .single()

        if (error) {
          if (error.code !== 'PGRST116' && error.message !== 'JSON object requested, multiple (or no) rows returned') {
            console.error('Error fetching message metadata:', error)
          }
          setMessageLoaded(true)
          return
        }

        const metadata = (message?.metadata as Record<string, any>) || {}
        const studySetIds = (metadata.studySetIds || []) as string[]
        setTaggedStudySetIds(studySetIds)
        setMessageLoaded(true)
      } catch (error) {
        if (error instanceof Error && !error.message.includes('PGRST')) {
          console.error('Error fetching message metadata:', error)
        }
        setMessageLoaded(true)
      }
    }

    fetchMessage()
  }, [responseMessageId, supabase])

  // Return true only when:
  // 1. Message is loaded (or no message ID)
  // 2. Study sets are loaded (or no tags)
  // 3. If there are tags, verify all have names in study sets
  const isReady = messageLoaded && !studySetsLoading && (
    taggedStudySetIds.length === 0 || 
    taggedStudySetIds.every(id => studySets.some(s => s.id === id))
  )

  return { isReady, tagIds: taggedStudySetIds }
}

// Tag boxes component - displays study set tags for a flashcard
function TagBoxes({ responseMessageId, initialTagIds }: { responseMessageId: string; initialTagIds?: string[] }) {
  const supabase = createClient()
  const { selectedTag, setSelectedTag } = useReactFlowContext() // Get selected tag state for filtering
  const [taggedStudySetIds, setTaggedStudySetIds] = useState<string[]>(initialTagIds || [])
  const [studySetNames, setStudySetNames] = useState<Map<string, string>>(new Map())
  const [hasInitialLoad, setHasInitialLoad] = useState(!!initialTagIds) // If initialTagIds provided, skip initial fetch

  // Update tag IDs when initialTagIds prop changes
  useEffect(() => {
    if (initialTagIds) {
      setTaggedStudySetIds(initialTagIds)
      setHasInitialLoad(true)
    }
  }, [initialTagIds])

  // Fetch current study set IDs from message metadata (only if not provided initially)
  const fetchTaggedStudySets = useCallback(async () => {
    if (!responseMessageId) {
      setHasInitialLoad(true)
      return
    }

    try {
      // Check if user is authenticated first (required for RLS)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // Not authenticated - can't fetch message metadata (expected for public homepage boards)
        setHasInitialLoad(true)
        return
      }

      const { data: message, error } = await supabase
        .from('messages')
        .select('metadata')
        .eq('id', responseMessageId)
        .single()

      if (error) {
        // RLS errors (like PGRST116) are expected for messages user doesn't own
        // Only log unexpected errors
        if (error.code !== 'PGRST116' && error.message !== 'JSON object requested, multiple (or no) rows returned') {
        console.error('Error fetching message metadata:', error)
        }
        setHasInitialLoad(true)
        return
      }

      const metadata = (message?.metadata as Record<string, any>) || {}
      const studySetIds = (metadata.studySetIds || []) as string[]
      setTaggedStudySetIds(studySetIds)
      setHasInitialLoad(true)
    } catch (error) {
      // Silently handle errors (expected for public boards)
      // Only log if it's an unexpected error type
      if (error instanceof Error && !error.message.includes('PGRST')) {
      console.error('Error fetching tagged study sets:', error)
      }
      setHasInitialLoad(true)
    }
  }, [responseMessageId, supabase])

  useEffect(() => {
    // Skip initial fetch if tag IDs were provided
    if (!initialTagIds) {
      fetchTaggedStudySets()
    }

    // Subscribe to message updates to refresh tags
    const channel = supabase
      .channel(`tag-boxes-${responseMessageId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `id=eq.${responseMessageId}`,
        },
        () => {
          fetchTaggedStudySets()
        }
      )
      .subscribe()

    // Listen for custom event when flashcard is tagged
    const handleTagged = (event: CustomEvent) => {
      if (event.detail?.messageId === responseMessageId) {
        fetchTaggedStudySets()
      }
    }
    window.addEventListener('flashcard-tagged', handleTagged as EventListener)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('flashcard-tagged', handleTagged as EventListener)
    }
  }, [responseMessageId, supabase, fetchTaggedStudySets, initialTagIds])

  // Fetch study sets using React Query (same cache as TagButton for instant access)
  const { data: studySets = [] } = useQuery({
    queryKey: ['studySets'],
    queryFn: fetchStudySets,
  })

  // Update study set names map only when content actually changes
  // Use ref to track previous key and avoid infinite loops
  const prevMapKeyRef = useRef<string>('')
  
  useEffect(() => {
    // Create stable key from current values
    const taggedIdsKey = taggedStudySetIds.join(',')
    const studySetsKey = JSON.stringify(studySets.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.id.localeCompare(b.id)))
    const mapKey = `${taggedIdsKey}|${studySetsKey}`
    
    // Skip if key hasn't changed (content is the same)
    if (mapKey === prevMapKeyRef.current) {
      return
    }
    
    prevMapKeyRef.current = mapKey

    if (taggedStudySetIds.length === 0) {
      setStudySetNames(prev => prev.size === 0 ? prev : new Map())
      return
    }

    const namesMap = new Map<string, string>()
    taggedStudySetIds.forEach((id) => {
      const studySet = studySets.find((s) => s.id === id)
      if (studySet) {
        namesMap.set(id, studySet.name)
      }
    })

    setStudySetNames(prev => {
      // Compare to avoid unnecessary updates
      if (prev.size !== namesMap.size) {
        return namesMap
      }
      for (const [id, name] of namesMap) {
        if (prev.get(id) !== name) {
          return namesMap
        }
      }
      return prev // No change
    })
    // Dependencies: we check the key inside, so we need the arrays to be in scope
    // but we only run when the key actually changes (checked via ref)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taggedStudySetIds, studySets])

  // Only return null after initial load confirms there are no tags
  if (hasInitialLoad && taggedStudySetIds.length === 0) return null

  // Filter to only show tags that have names loaded
  const tagsWithNames = taggedStudySetIds.filter(id => studySetNames.has(id))
  
  // Don't show anything if no tags have names yet
  if (tagsWithNames.length === 0) return null

  // Show container with tags that have names
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tagsWithNames.map((studySetId) => {
        const name = studySetNames.get(studySetId)!

        const isSelected = selectedTag === studySetId

        return (
          <div
            key={studySetId}
            onClick={(e) => {
              e.stopPropagation() // Prevent panel selection when clicking tag
              setSelectedTag(studySetId) // Toggle tag selection
            }}
            className={cn(
              "px-2 py-0.5 text-xs rounded-md border cursor-pointer transition-colors",
              isSelected
                ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-700 dark:border-blue-400"
                : "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50"
            )}
          >
            {name}
          </div>
        )
      })}
    </div>
  )
}

// Tag button component - reusable for both collapsed and expanded states
function TagButton({ responseMessageId }: { responseMessageId: string }) {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const [newStudySetName, setNewStudySetName] = useState('')
  const [isCreatingStudySet, setIsCreatingStudySet] = useState(false)
  const [showNewStudySetInput, setShowNewStudySetInput] = useState(false)

  // Fetch study sets for the dropdown
  const { data: studySets = [] } = useQuery({
    queryKey: ['studySets'],
    queryFn: fetchStudySets,
  })

  // Handle tagging flashcard to study set
  const handleTagToStudySet = async (studySetId: string) => {
    if (!responseMessageId) return

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // Get current message metadata
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('metadata')
        .eq('id', responseMessageId)
        .single()

      if (fetchError) throw new Error(fetchError.message || 'Failed to fetch message')

      const existingMetadata = (message?.metadata as Record<string, any>) || {}
      const studySetIds = (existingMetadata.studySetIds || []) as string[]

      // Add study set ID if not already present
      if (!studySetIds.includes(studySetId)) {
        const updatedStudySetIds = [...studySetIds, studySetId]

        // Update message metadata
        const { error } = await supabase
          .from('messages')
          .update({
            metadata: { ...existingMetadata, studySetIds: updatedStudySetIds },
          })
          .eq('id', responseMessageId)

        if (error) throw new Error(error.message || 'Failed to tag flashcard')

        // Invalidate queries to refresh study set views
        await queryClient.invalidateQueries({ queryKey: ['flashcards-for-study-set'] })
        await queryClient.invalidateQueries({ queryKey: ['studySets'] })
        
        // Trigger a custom event to refresh tag boxes
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('flashcard-tagged', { detail: { messageId: responseMessageId } }))
        }
      }
    } catch (error: any) {
      console.error('Failed to tag flashcard:', error)
      alert(error.message || 'Failed to tag flashcard. Please try again.')
    }
  }

  // Handle creating new study set
  const handleCreateStudySet = async () => {
    if (!newStudySetName.trim() || isCreatingStudySet) return

    setIsCreatingStudySet(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // Get current profile metadata
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('metadata')
        .eq('id', user.id)
        .single()

      if (fetchError) throw new Error(fetchError.message || 'Failed to fetch profile')

      const existingMetadata = (profile?.metadata as Record<string, any>) || {}
      const studySets = (existingMetadata.studySets || []) as Array<{ id: string; name: string }>

      // Create new study set
      const newStudySetId = generateUUID() // Compatible with all browsers including older Safari
      const newStudySet = { id: newStudySetId, name: newStudySetName.trim() }
      const updatedStudySets = [...studySets, newStudySet]

      // Update profile metadata
      const { error } = await supabase
        .from('profiles')
        .update({
          metadata: { ...existingMetadata, studySets: updatedStudySets },
        })
        .eq('id', user.id)

      if (error) throw new Error(error.message || 'Failed to create study set')

      // Invalidate queries to refresh the list
      await queryClient.invalidateQueries({ queryKey: ['studySets'] })

      // Tag the flashcard to the new study set
      if (responseMessageId) {
        await handleTagToStudySet(newStudySetId)
      }

      // Reset form
      setNewStudySetName('')
      setShowNewStudySetInput(false)
      
      // Trigger a custom event to refresh tag boxes
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('flashcard-tagged', { detail: { messageId: responseMessageId } }))
      }
    } catch (error: any) {
      console.error('Failed to create study set:', error)
      alert(error.message || 'Failed to create study set. Please try again.')
    } finally {
      setIsCreatingStudySet(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          onClick={(e) => e.stopPropagation()}
          title="Tag to study set"
        >
          <Plus className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {/* New set button at the top */}
        {!showNewStudySetInput ? (
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              setShowNewStudySetInput(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            New set
          </DropdownMenuItem>
        ) : (
          <div className="px-2 py-1.5">
            <input
              type="text"
              value={newStudySetName}
              onChange={(e) => setNewStudySetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newStudySetName.trim() && !isCreatingStudySet) {
                  handleCreateStudySet()
                } else if (e.key === 'Escape') {
                  setShowNewStudySetInput(false)
                  setNewStudySetName('')
                }
              }}
              placeholder="Study set name"
              className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex gap-1 mt-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  handleCreateStudySet()
                }}
                disabled={!newStudySetName.trim() || isCreatingStudySet}
              >
                {isCreatingStudySet ? 'Creating...' : 'Create'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowNewStudySetInput(false)
                  setNewStudySetName('')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
        {studySets.length > 0 && (
          <>
            {showNewStudySetInput && (
              <div className="h-px bg-gray-200 dark:bg-gray-700 my-1 mx-1" />
            )}
            {studySets.map((studySet) => (
              <DropdownMenuItem
                key={studySet.id}
                onClick={(e) => {
                  e.stopPropagation()
                  handleTagToStudySet(studySet.id)
                }}
              >
                {studySet.name}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Shared empty result so the stack-side selector can bail without allocating. */
const EMPTY_STACK_SIDES: Array<{ side: FrameStackSide; groupId: string }> = []

function ChatPanelNodeInner({ data, selected, id, dragging }: NodeProps<PanelNodeData>) {
  // Handle both ChatPanelNodeData and ProjectBoardPanelNodeData
  const isProjectBoard = isProjectBoardData(data)

  // Extract data based on type
  const promptMessage: Message | null = isProjectBoard
    ? { id: data.boardId, role: 'user' as const, content: data.boardTitle, created_at: '' }
    : data.promptMessage
  const responseMessage: Message | undefined = isProjectBoard
    ? data.recentUserMessage
    : data.responseMessage
  const conversationId = isProjectBoard ? data.boardId : data.conversationId
  const projectId = isProjectBoard ? data.projectId : undefined
  // Chat-linked logo sides (thread-hidden) + sides with a painted chat thread
  const { logoSides: chatLinkLogoSides, threadVisibleSides: chatThreadVisibleSides } =
    useChatFrameLinkLogoSides(promptMessage?.id)
  // TipTap NodeViews cannot see RF `selected` — publish so databaseBlock collapses on deselect
  useLayoutEffect(() => {
    const keys = [id, promptMessage?.id].filter(Boolean) as string[]
    for (const k of keys) setFramePanelSelected(k, !!selected)
    return () => {
      for (const k of keys) setFramePanelSelected(k, false)
    }
  }, [id, promptMessage?.id, selected])
  const dataCollapsed = data.isResponseCollapsed || false
  const supabase = createClient()
  const queryClient = useQueryClient()
  const router = useRouter()
  const {
    displayContentFor,
    isFramePending,
    pendingForMessage,
    setFocusedEditId,
    previewOriginal,
    justRestoredByMessage,
    consumeRestoredContent,
    patchPendingProposedContent,
  } = useAiEditSession() // AI edit review session
  const warmFrameContentMount = useWarmFrameContentMount() // Prefetch TipTap before pan-in
  const wasAiPendingRef = useRef(false) // Detect pending → cleared (Remove / Save)
  const healedNotionMarksRef = useRef<string | null>(null) // Dedupe orphan mark heal writes
  const [aiForceSyncKey, setAiForceSyncKey] = useState(0) // Bump to setContent even while focused
  const { reactFlowInstance, panelWidth, getSetNodes, flashcardMode, setFlashcardMode, selectedTag } = useReactFlowContext() // Get zoom, panel width, setNodes function, flashcard study mode, and selected tag
  const { setNodes, getNodes } = useReactFlow() // Get setNodes and getNodes for NodeToolbar actions
  const { isMobileMode } = useSidebarContext() // Unselected frames need a hold before drag on phone
  const { manualDragNodeId } = usePhoneFrameDrag() // Manual hold-drag (RF nodrag on unselected phone panels)
  const handleNotionConnection = useCallback(async (next: { connected: boolean; sync?: NotionSyncMode }) => {
    if (!promptMessage?.id) return // No row to patch
    const existing = { ...((promptMessage.metadata as Record<string, unknown>) || {}) } // Keep other frame meta
    if (!next.connected) {
      existing.notionConnected = false // Explicit unlink
      delete existing.notionSync
    } else {
      existing.notionConnected = true
      existing.notionSync = normalizeNotionSyncMode(next.sync)
    }
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? {
              ...n,
              data: {
                ...n.data,
                promptMessage: { ...promptMessage, metadata: existing },
              },
            }
          : n
      )
    )
    try {
      await supabase.from('messages').update({ metadata: existing }).eq('id', promptMessage.id)
    } catch (err) {
      console.error('Failed to save Notion connection:', err)
    }
  }, [promptMessage, setNodes, id, supabase])
  // Turn into → Property: empty cell in the frame (same as dragging a property icon in).
  const handlePropertyTurnInto = useCallback(
    (nextType: PropertyTypeId) => {
      if (!promptMessage?.id) return // No row to patch
      window.dispatchEvent(
        new CustomEvent('tt-add-frame-property', {
          detail: {
            nodeIds: [id], // This frame
            messageIds: [promptMessage.id], // Cold HTML path if the editor is not mounted
            propertyType: nextType, // Type chosen in the pane
          },
        })
      )
    },
    [promptMessage?.id, id]
  )
  const updateNodeInternals = useUpdateNodeInternals() // Remeasure auto-sized frames without setNodes (avoids RO→setNodes storms)
  const rfStoreApi = useStoreApi() // Unselect legacy wrapper before RF snapshots dragItems (frame-body drag)
  // Selected-frame chrome layout (gutters / ⋮⋮ column) tracks LIVE viewport CSS zoom
  // (store transform can lag until the gesture ends — that was the post-zoom snap).
  const rfZoom = useLiveBoardZoom(Boolean(selected))
  const [promptHasChanges, setPromptHasChanges] = useState(false)
  const [responseHasChanges, setResponseHasChanges] = useState(false)
  const editorActiveRef = useRef(false) // Skip Notion page pull while the frame editor is focused
  // Single text body: plain-merge legacy prompt + response (no section split).
  // Legacy: sole databaseBlock → boardLink when linkedBoardId exists (pages only).
  // Notion DB frames / board bodies keep the live databaseBlock (row→card must not wipe the table).
  const [promptContent, setPromptContent] = useState(() => {
    if (isProjectBoard) return data.boardTitle || ''
    const responseRaw = data.responseMessage?.content
    const responseHtml = responseRaw ? formatResponseContent(responseRaw) : ''
    const merged = mergePanelHtml(data.promptMessage?.content, responseHtml)
    const meta = (data.promptMessage?.metadata || {}) as Record<string, unknown>
    if (isBoardBodyMeta(meta) || meta.notionObject === 'database') return merged
    const linkedId = getLinkedBoardId(meta)
    if (!linkedId) return merged
    const iconMeta = meta.notionIcon as { type?: string; emoji?: string } | null
    const emoji = iconMeta?.type === 'emoji' && iconMeta.emoji ? iconMeta.emoji : null
    return (
      migrateSoleDatabaseBlockToBoardLink(merged, {
        boardId: linkedId,
        title: typeof meta.blockTitle === 'string' ? meta.blockTitle : null,
        icon: emoji,
      }) || merged
    )
  })
  const [responseContent, setResponseContent] = useState(responseMessage?.content || '')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isResponseCollapsed, setIsResponseCollapsed] = useState(dataCollapsed || false) // Track if response is collapsed
  const [showPromptMoreMenu, setShowPromptMoreMenu] = useState(!dataCollapsed) // Track if prompt more menu should be visible (with delay)
  const [comments, setComments] = useState<Comment[]>([]) // Store all comments for this panel
  const [showComments, setShowComments] = useState(false) // Toggle comment panels visibility
  const [commentSide, setCommentSide] = useState<'left' | 'right'>('right') // Park comments on the side with room
  const [selectedCommentId, setSelectedCommentId] = useState<string | null>(null) // Track which comment is selected
  const [replyTexts, setReplyTexts] = useState<Record<string, string>>({}) // Reply input text per comment
  const [newCommentData, setNewCommentData] = useState<{
    selectedText: string
    from: number
    to: number
    section: 'prompt' | 'response'
  } | null>(null) // Track new comment data (selected text and position)
  const [newCommentText, setNewCommentText] = useState('') // New comment input text
  const [emojiReactions, setEmojiReactions] = useState<EmojiReaction[]>([]) // Store all emoji reactions for this panel
  const [isBookmarked, setIsBookmarked] = useState(false) // Track if panel is bookmarked
  const panelRef = useRef<HTMLDivElement>(null) // Ref to panel container for positioning comment box
  const commentPanelsRef = useRef<HTMLDivElement>(null) // Ref to comment panels container for click-away detection
  const hasInitialShrunkRef = useRef<string | null>(null) // Track which panel ID we've done initial shrink for
  const [isInitialShrinkComplete, setIsInitialShrinkComplete] = useState(false) // Track if initial shrink is done (for hiding panel until ready)
  const promptEditorRef = useRef<any>(null) // Ref to prompt editor instance
  const responseEditorRef = useRef<any>(null) // Ref to response editor instance
  const newCommentTextareaRef = useRef<HTMLTextAreaElement>(null) // Ref for new comment textarea
  const replyTextareaRefs = useRef<Record<string, HTMLTextAreaElement>>({}) // Refs for reply textareas
  const hasAutoFocusedRef = useRef(false) // Track if note editor has been auto-focused
  const { resolvedTheme } = useTheme() // Get theme to set transparent background color
  
  // Resize state for panel scaling — seed from place/persist meta so I-bar type paints scaled on first frame
  const seedResizeDims = initialResizeDimsFromMeta(promptMessage?.metadata)
  const seedFrameScale = initialFrameScaleFromMeta(promptMessage?.metadata)
  const [resizeDimensions, setResizeDimensions] = useState<{ width: number; height: number } | null>(
    () => seedResizeDims
  ) // Track resized dimensions
  const [isUserResized, setIsUserResized] = useState(() => seedResizeDims != null) // True after corner-drag, place seed, or saved resizeDimensions
  const [fontScale, setFontScale] = useState(1) // Legacy editor font-size scale (blocks use frameScale instead)
  const [frameUnlocked, setFrameUnlocked] = useState(
    () => (promptMessage?.metadata as { frameUnlocked?: boolean } | undefined)?.frameUnlocked === true
  ) // Unlocked: free resize; locked: content scales with frame. Seed so a shaped create doesn't hug first.
  const [frameTextWrap, setFrameTextWrap] = useState(false) // Wrap lines in the frame width; free mode contain-fits if the box is shorter
  const [wrapColWidth, setWrapColWidth] = useState<number | null>(null) // Unscaled wrap column width — fixed on locked resize, restored on rewrap
  const [contentFitBox, setContentFitBox] = useState<{ width: number; height: number; col?: number } | null>(null) // Free: centred fill-px box content contain-fits into; col = wrap width the +'s were set at (scale basis); null = fill edges
  const [frameAlignX, setFrameAlignX] = useState<FrameAlignX>(() =>
    parseFrameAlignX((promptMessage?.metadata as { frameAlignX?: unknown } | undefined)?.frameAlignX)
  ) // Glyph text-align — wrap column stays mid-frame
  const [dbAlwaysExpanded, setDbAlwaysExpanded] = useState(false) // Notion DB frames: Expanded vs Preview (frame menu)
  // Per-frame row unlock for Notion DB show-more (12 → 50 → +50). Not shared across duplicate frames.
  const [dbVisibleRowCap, setDbVisibleRowCap] = useState(12)
  const [frameScale, setFrameScale] = useState(() => seedFrameScale) // Uniform content scale while frame is locked
  const [unlockedFrameSize, setUnlockedFrameSize] = useState<{ width: number; height: number } | null>(null) // Saved free-resize box — restored on unlock after fit-to-text
  const [unlockedFrameScale, setUnlockedFrameScale] = useState<number | null>(null) // Scale paired with unlockedFrameSize (bookkeeping only)
  const needsCollapsedDbFrameHealRef = useRef(false) // Load skipped corrupt DB clip — persist clear once persistFrameMeta exists

  // Seed at plain-text hug (grip+3ch × one line) — boardLink floor inflated empty frames before first measure
  const [intrinsicSize, setIntrinsicSize] = useState({ width: BLOCK_LOCKED_MIN_W, height: BLOCK_MIN_FRAME_H })
  const [databaseExtents, setDatabaseExtents] = useState<{ width: number; height: number } | null>(null) // Full table box for clip preview / overflow
  const [intrinsicMeasured, setIntrinsicMeasured] = useState(false) // True after first contentFit measure (avoid hug flash)
  const [isFrameHovering, setIsFrameHovering] = useState(false) // Frame hover — page-open menu (not lock/rotate)
  const [rotation, setRotation] = useState(0) // Degrees of item rotation (persisted in message metadata)
  const [frameShape, setFrameShape] = useState<FrameShapeType | null>(() =>
    parseFrameShape((promptMessage?.metadata as { frameShape?: unknown } | undefined)?.frameShape)
  ) // Silhouette (null = default frame). Seed so Smart Draw paints the shape on first frame.
  const isResizingRef = useRef(false) // Track if currently resizing
  const [frameResizing, setFrameResizing] = useState(false) // Render flag — hides wrap line during a frame resize
  const contentFitRef = useRef<HTMLDivElement>(null) // Inner unscaled content wrapper for intrinsic measure
  const frameScaleRef = useRef(1) // Latest scale — resize-end must not close over a stale render
  if (!isResizingRef.current) frameScaleRef.current = frameScale // Mid-adjust: handleResize owns the ref
  const frameUnlockedRef = useRef(frameUnlocked) // Live lock — resize callbacks stay identity-stable
  frameUnlockedRef.current = frameUnlocked // Sync every render so d3-drag can read without rebinding
  const unlockedFrameSizeRef = useRef(unlockedFrameSize) // Last free-resize box — restore after fit-to-text
  unlockedFrameSizeRef.current = unlockedFrameSize
  const unlockedFrameScaleRef = useRef(unlockedFrameScale)
  unlockedFrameScaleRef.current = unlockedFrameScale
  // Last fit-mode box for a sole image — free→fit restores this (text hugs content; images must not hug the bitmap)
  const imageFitSizeRef = useRef<{ width: number; height: number } | null>(null)
  const frameTextWrapRef = useRef(frameTextWrap) // Live wrap flag for the same stable resize handlers
  frameTextWrapRef.current = frameTextWrap
  const wrapColWidthRef = useRef(wrapColWidth) // Live wrap columns — locked proportional math
  wrapColWidthRef.current = wrapColWidth
  const wrapLineFillRef = useRef<HTMLDivElement>(null) // Fill shell — wrap-line pointer → local X
  const wrapLineDraggingRef = useRef(false) // True while dragging the wrap column line
  const [wrapPaintBox, setWrapPaintBox] = useState<{ left: number; width: number } | null>(null) // Live PM wrap column in fill px — zoom-safe
  const wrapDragBoxRef = useRef<{ left: number; width: number } | null>(null) // Pointer gap while a wrap line is down — render must not snap back to the word box
  const wrapGapRef = useRef<{ width: number; align: 'left' | 'center' | 'right' } | null>(null) // Released gap — settle must not park the lines on the word box or the fill
  const [wrapMeasureTick, setWrapMeasureTick] = useState(0) // Bumped on wrap-drag release — refs clearing alone never re-runs the measure
  const contentFitBoxRef = useRef(contentFitBox) // Live fit box for resize / wrap scale
  contentFitBoxRef.current = contentFitBox
  const fitLineDraggingRef = useRef(false) // True while dragging a grey content-fit line
  const wrapShiftPosRef = useRef<{ x: number; y: number } | null>(null) // Fit left/center wrap drag: moved RF XY to persist on release
  const wrapDragPaintRef = useRef<number | null>(null) // Paint scale frozen at wrap-line press — contain-fit must not remap the bar
  const freeFitScaleRef = useRef(1) // Last settled contain-fit — reused for the whole wrap-line drag
  const nowrapCapRef = useRef<number | null>(null) // Column where this drag turns wrap off — light blue from there
  const paintScaleRef = useRef(1) // Live CSS scale so wrap-line drag converts fill X → unscaled col
  const frameAlignXRef = useRef(frameAlignX) // Wrap-line drag — fit-to-content shows one bar
  frameAlignXRef.current = frameAlignX
  const wrapContainHRef = useRef<number | null>(null) // Wrap-stack height at the natural column (box ÷ frameScale)
  const wrapContainBoxWRef = useRef<number | null>(null) // Free box width that wrapContainHRef was measured at
  const rotationRef = useRef(rotation) // Live frame rotation for AABB → content size
  rotationRef.current = rotation
  const promptContentRef = useRef(promptContent) // Live HTML for min-width during a drag
  promptContentRef.current = promptContent
  const intrinsicSizeRef = useRef(intrinsicSize) // Live unscaled content box for locked-wrap height
  intrinsicSizeRef.current = intrinsicSize
  const fontScaleRef = useRef(fontScale) // Persist on resize-end without closing over a stale callback
  fontScaleRef.current = fontScale
  const resizeRafRef = useRef<number | null>(null) // Coalesce live resize setState to one paint
  const pendingResizeRef = useRef<{ width: number; height: number; scale?: number } | null>(null) // Last drag sample waiting for rAF
  // Same-tick drag sample — render + DOM read this so peach / adjust ring don't wait for rAF setState
  const liveResizeBoxRef = useRef<{ width: number; height: number; scale?: number } | null>(null)
  const freeContentMinRef = useRef({ width: 1, height: 1 }) // Live fit-to-text hug — free shrink floor
  // Identity-stable apply — handleResize must not close over push/setNodes (phone d3-drag rebind)
  const applyLiveAdjustBoxRef = useRef<(contentW: number, contentH: number, outerAlready?: boolean) => void>(
    () => {}
  )
  const persistFrameMetaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // Debounce hug-to-text saves
  const lockedResizeStartRef = useRef<{ width: number; height: number; scale: number } | null>(null) // Locked drag baseline
  const initialResizeWidthRef = useRef<number | null>(null) // Track initial panel width when resize starts (for note panels)
  const initialResizeHeightRef = useRef<number | null>(null) // Track initial panel height when resize starts (for note panels)
  const initialTextWidthRef = useRef<number | null>(null) // Track initial TEXT content width (for proper fill scaling)
  const isFirstResizeCallRef = useRef(true) // Track if this is the first resize call in the current session
  const initialTextAspectRatioRef = useRef<number | null>(null) // Track text's natural aspect ratio (width/height)
  const hasLoadedResizeStateRef = useRef(false) // Track if we've already loaded and applied resize state from metadata
  const isRotatingRef = useRef(false) // True while pointer-dragging the rotation handle
  // Pointer math for live rotate — pivot is frozen at gesture start (left-locked AABB would drift center)
  const rotationDragRef = useRef<{
    startAngle: number
    startRotation: number
    pivotX: number
    pivotY: number
    startX: number // Pointer down screen X — click vs drag
    startY: number // Pointer down screen Y
    didDrag: boolean // True once pointer moved past click slop
  } | null>(null)

  // Helper function to convert hex color to rgba with opacity
  // Maintains transparency by converting hex to rgba with specified opacity
  const hexToRgba = useCallback((hex: string, opacity: number): string => {
    // Remove # if present
    const cleanHex = hex.replace('#', '')

    // Parse RGB values
    const r = parseInt(cleanHex.substring(0, 2), 16)
    const g = parseInt(cleanHex.substring(2, 4), 16)
    const b = parseInt(cleanHex.substring(4, 6), 16)

    return `rgba(${r}, ${g}, ${b}, ${opacity})`
  }, [])

  // Calculate panel background color
  // Pastels stored light-canonical; empty = transparent; legacy + dark theme remap at paint
  const panelBackgroundColor = useMemo(() => {
    return resolveFrameFillColor(data.fillColor, resolvedTheme) ?? 'transparent'
  }, [data.fillColor, resolvedTheme])

  // Calculate prompt/grey area background color — inherit frame fill when set
  const promptAreaBackgroundColor = useMemo(() => {
    return resolveFrameFillColor(data.fillColor, resolvedTheme) ?? 'transparent'
  }, [data.fillColor, resolvedTheme])

  // Calculate response/white area background color — inherit frame fill when set
  const responseAreaBackgroundColor = useMemo(() => {
    return resolveFrameFillColor(data.fillColor, resolvedTheme) ?? 'transparent'
  }, [data.fillColor, resolvedTheme])

  const resolvedBorderColor = useMemo(
    () => resolveFrameBorderColor(data.borderColor, resolvedTheme),
    [data.borderColor, resolvedTheme]
  )

  // Connection points: blue fill + white border (matches selection chrome blue-500)
  const handleColor = '#3b82f6'
  const handleHoverColor = '#2563eb' // Slightly darker on hover/active
  const handleBorderColor = '#ffffff'

  // Check if panel is minimal (transparent fill + no visible border)
  // When minimal and not selected, handles should be hidden
  // Empty borderColor = transparent; only explicit borderStyle 'none' hides a colored border
  const isFillTransparent = !data.fillColor || data.fillColor === '' || data.fillColor === null
  const isBorderColorTransparent =
    !data.borderColor || data.borderColor === '' || data.borderColor === null
  const isBorderNone =
    isBorderColorTransparent || data.borderStyle === 'none' // Color alone is enough to show a border
  const slashMenuPending =
    (promptMessage?.metadata as Record<string, unknown> | undefined)?.slashMenuPending === true
  // Empty frames (no text / atoms) get a soft grey outline so the box is findable on the board
  const showEmptyFrameBorder =
    isBlockContentEmpty(promptContent) && // Live TipTap HTML — flips off as soon as content lands
    !slashMenuPending && // I-bar `/` spawn — no grey flash before the slash menu opens
    isBorderColorTransparent && // User-set borderColor wins over empty chrome
    data.borderStyle !== 'none' && // Explicit "no border" stays invisible
    !frameShape // Silhouette stroke is the outline when shaped
  const emptyFrameBorderColor = resolvedTheme === 'dark' ? '#4b5563' : '#d1d5db' // Thin grey (gray-600 / gray-300)
  const isMinimalPanel = isFillTransparent && isBorderNone // Empty grey chrome does not count as styled
  const shouldHideHandles = isMinimalPanel && !selected

  // Handle click away from comment panels to deselect
  useEffect(() => {
    if (!showComments || !selectedCommentId) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      // Don't deselect if clicking on comment panels
      if (commentPanelsRef.current && commentPanelsRef.current.contains(target)) {
        return
      }

      // Check if clicking on highlighted commented text in editors
      const promptEditor = promptEditorRef.current
      const responseEditor = responseEditorRef.current

      let isClickOnCommentedText = false

      if (promptEditor && promptEditor.view.dom.contains(target)) {
        try {
          const pos = promptEditor.view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (pos) {
            isClickOnCommentedText = comments.some(c => c.section === 'prompt' && pos.pos >= c.from && pos.pos <= c.to)
          }
        } catch {
          // Ignore errors
        }
      }

      if (!isClickOnCommentedText && responseEditor && responseEditor.view.dom.contains(target)) {
        try {
          const pos = responseEditor.view.posAtCoords({ left: event.clientX, top: event.clientY })
          if (pos) {
            isClickOnCommentedText = comments.some(c => c.section === 'response' && pos.pos >= c.from && pos.pos <= c.to)
          }
        } catch {
          // Ignore errors
        }
      }

      // If clicking on commented text, don't deselect
      if (isClickOnCommentedText) {
        return
      }

      // Otherwise, deselect immediately (clicking anywhere else - outside comment panels and not on commented text)
      setTimeout(() => { setSelectedCommentId(null) }, 0)
    }

    // Use capture phase and add immediately (no timeout)
    document.addEventListener('mousedown', handleClickOutside, true)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  }, [showComments, selectedCommentId, comments])

  // Re-pick left/right whenever comments (or the composer) are up — chrome + pan change available air
  useEffect(() => {
    if (!showComments && !newCommentData) return
    const update = () => setCommentSide(pickCommentSide(panelRef.current))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [showComments, newCommentData, comments.length])

  // Tell the frame menu which side the reactions card uses so it can park opposite
  useEffect(() => {
    const visible = Boolean(newCommentData) || (showComments && comments.length > 0)
    window.dispatchEvent(
      new CustomEvent('tt-comment-side', {
        detail: { nodeId: id, side: visible ? commentSide : null },
      })
    )
  }, [id, commentSide, showComments, newCommentData, comments.length])

  // Sync with data prop
  useEffect(() => {
    if (dataCollapsed !== undefined) {
      setIsResponseCollapsed(dataCollapsed)
      // Update prompt more menu visibility based on initial state
      if (dataCollapsed) {
        setShowPromptMoreMenu(false)
      } else {
        setShowPromptMoreMenu(true)
      }
    }
  }, [dataCollapsed])

  // Load bookmark state from message metadata (only for regular panels, not project boards)
  useEffect(() => {
    if (isProjectBoard) return // Project boards don't have bookmarks

    const checkBookmark = async () => {
      if (!responseMessage) return

      const { data: message } = await supabase
        .from('messages')
        .select('metadata')
        .eq('id', responseMessage.id)
        .single()

      if (message?.metadata && typeof message.metadata === 'object') {
        setIsBookmarked((message.metadata as any).bookmarked === true)
      }
    }

    checkBookmark()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProjectBoard, responseMessage?.id]) // Only depend on responseMessage.id to avoid unnecessary re-runs

  // Load resize dimensions/fontScale from message metadata on mount to restore panel size
  // Note: This effect calculates isBlock inline to avoid dependency on isBlock before it's defined
  useEffect(() => {
    if (isProjectBoard || !promptMessage || hasLoadedResizeStateRef.current) return // Project boards don't persist resize, and only load once

    // Block panel: metadata.isBlock, or empty user-only body
    const isBlockPanel = isBlockMeta(promptMessage?.metadata) ||
      (promptMessage?.role === 'user' && 
       !responseMessage && 
       (!promptMessage?.content || promptMessage.content.trim() === '' || promptMessage.content === '<p></p>' || promptMessage.content === '<p><br></p>'))

    const loadResizeState = async () => {
      // Saved frame state lives in the same metadata blob the board's bulk message query already
      // loaded. Re-reading the row per frame was an N+1: 33 frames fired 33
      // `messages?select=metadata&id=eq.…` GETs inside one millisecond, ~3.6s of request time on a
      // cold load. Fall back to the network only when node data arrived without metadata.
      let blob = promptMessage.metadata as Record<string, any> | null | undefined
      if (!blob || typeof blob !== 'object') {
        const { data: message } = await supabase
          .from('messages')
          .select('metadata')
          .eq('id', promptMessage.id)
          .single()
        blob = (message?.metadata ?? null) as Record<string, any> | null
      }

      if (blob && typeof blob === 'object') {
        const metadata = blob
        
        // For note panels: load fontScale (legacy scale-to-fit)
        if (isBlockPanel && metadata.fontScale && typeof metadata.fontScale === 'number') {
          setFontScale(metadata.fontScale)
        }

        // Restore saved rotation for items (degrees around panel center)
        if (isBlockPanel && typeof metadata.rotation === 'number') {
          setRotation(metadata.rotation) // Apply persisted angle so layout survives reload
        }

        // Frame silhouette (frames act as shapes)
        if (isBlockPanel) {
          setFrameShape(parseFrameShape(metadata.frameShape))
        }

        // Frame lock: default locked; unlocked lets the box resize independently of content
        if (isBlockPanel && typeof metadata.frameUnlocked === 'boolean') {
          setFrameUnlocked(metadata.frameUnlocked)
        }
        if (isBlockPanel && typeof metadata.frameTextWrap === 'boolean') {
          setFrameTextWrap(metadata.frameTextWrap) // Restore wrap-in-frame preference (unlocked chrome)
        }
        if (isBlockPanel) {
          setFrameAlignX(parseFrameAlignX(metadata.frameAlignX)) // Restore glyph text-align
        }
        if (isBlockPanel && typeof metadata.dbAlwaysExpanded === 'boolean') {
          setDbAlwaysExpanded(metadata.dbAlwaysExpanded) // Restore Always expanded vs Expand when selected
        }
        if (isBlockPanel && typeof metadata.dbVisibleRowCap === 'number' && metadata.dbVisibleRowCap > 0) {
          setDbVisibleRowCap(metadata.dbVisibleRowCap) // Per-frame show-more depth
        } else if (isBlockPanel && metadata.dbAlwaysExpanded === true) {
          setDbVisibleRowCap(50) // Expanded default: one Notion page
        } else if (isBlockPanel) {
          setDbVisibleRowCap(12) // Preview default
        }
        if (isBlockPanel && typeof metadata.wrapColWidth === 'number' && metadata.wrapColWidth > 0) {
          setWrapColWidth(metadata.wrapColWidth) // Restore the fixed wrap column width (unwrap/rewrap point)
        }
        if (isBlockPanel) {
          const fb = metadata.contentFitBox as { width?: unknown; height?: unknown; col?: unknown } | null | undefined // Grey fit-line box
          setContentFitBox(
            fb && typeof fb.width === 'number' && typeof fb.height === 'number' && fb.width > 0 && fb.height > 0
              ? {
                  width: fb.width,
                  height: fb.height,
                  ...(typeof fb.col === 'number' && fb.col > 0 ? { col: fb.col } : {}), // Scale basis at + set
                } // Restore the centred contain-fit box
              : null // Missing — lines sit on the fill edges
          )
        }        if (
          isBlockPanel &&
          metadata.unlockedFrameSize &&
          typeof metadata.unlockedFrameSize === 'object'
        ) {
          const u = metadata.unlockedFrameSize as { width?: number; height?: number }
          if (u.width && u.height && u.width > 0 && u.height > 0) {
            setUnlockedFrameSize({ width: u.width, height: u.height }) // Shape to return to on unlock
          }
        }
        if (isBlockPanel && typeof metadata.unlockedFrameScale === 'number' && metadata.unlockedFrameScale > 0) {
          setUnlockedFrameScale(metadata.unlockedFrameScale) // Scale paired with the unlocked shape
        }
        if (isBlockPanel && metadata.imageFitSize && typeof metadata.imageFitSize === 'object') {
          const fit = metadata.imageFitSize as { width?: number; height?: number }
          if (fit.width && fit.height && fit.width > 0 && fit.height > 0) {
            imageFitSizeRef.current = { width: fit.width, height: fit.height } // Restore target for free→fit
          }
        }
        if (isBlockPanel && typeof metadata.frameScale === 'number' && metadata.frameScale > 0) {
          setFrameScale(metadata.frameScale) // Locked proportional scale
        }
        // Load explicit box size for items + other panels (corner resize baseline).
        // Skip collapsed databaseBlock boxes left by post-drag hug while the table NodeView remounted
        // (heal-to-relock runs in a later effect once persistFrameMeta exists).
        if (metadata.resizeDimensions && typeof metadata.resizeDimensions === 'object') {
          const dims = metadata.resizeDimensions as { width?: number; height?: number }
          const contentHtml =
            typeof promptMessage?.content === 'string' ? promptMessage.content : ''
          const corruptDbClip =
            hasDatabaseBlockHtml(contentHtml) &&
            typeof dims.width === 'number' &&
            typeof dims.height === 'number' &&
            isCollapsedDatabaseFrameSize(dims.width, dims.height)
          if (corruptDbClip) {
            setFrameUnlocked(false) // Relock so next hug expands to the live table
            setResizeDimensions(null)
            setIsUserResized(false)
            setUnlockedFrameSize(null)
            needsCollapsedDbFrameHealRef.current = true // Also covered by heal effect below
            // Persist clear here — heal effect may not re-run if dims were never applied
            void (async () => {
              if (isProjectBoard || !promptMessage) return
              const { data: message } = await supabase
                .from('messages')
                .select('metadata')
                .eq('id', promptMessage.id)
                .single()
              const existingMetadata = (message?.metadata as Record<string, any>) || {}
              await supabase
                .from('messages')
                .update({
                  metadata: {
                    ...existingMetadata,
                    frameUnlocked: false,
                    frameScale: 1,
                    resizeDimensions: null,
                    unlockedFrameSize: null,
                    unlockedFrameScale: null,
                  },
                })
                .eq('id', promptMessage.id)
            })()
          } else if (dims.width && dims.height && dims.width > 0 && dims.height > 0) {
            const lockedRowCard =
              isRowCardAtomHtml(contentHtml) && metadata.frameUnlocked !== true
            if (lockedRowCard) {
              // Locked row cards live-hug — stale resize boxes must not load (RF node + panel).
              setResizeDimensions(null)
              setIsUserResized(false)
              const setNodesFunc = getSetNodes()
              if (setNodesFunc) {
                setNodesFunc((nodes: any[]) =>
                  nodes.map((node: any) => {
                    if (node.id !== id) return node
                    const style = { ...(node.style || {}) }
                    delete style.width
                    delete style.height
                    return { ...node, style, width: undefined, height: undefined }
                  })
                )
              }
              void (async () => {
                if (isProjectBoard || !promptMessage) return
                const { data: message } = await supabase
                  .from('messages')
                  .select('metadata')
                  .eq('id', promptMessage.id)
                  .single()
                const existingMetadata = (message?.metadata as Record<string, any>) || {}
                if (existingMetadata.resizeDimensions == null) return
                await supabase
                  .from('messages')
                  .update({
                    metadata: {
                      ...existingMetadata,
                      resizeDimensions: null,
                      frameUnlocked: false,
                    },
                  })
                  .eq('id', promptMessage.id)
              })()
            } else {
            setResizeDimensions({ width: dims.width, height: dims.height })
            setIsUserResized(true) // Persisted resize → wrap in fixed box; skip line-grow
            if (
              metadata.frameUnlocked !== true &&
              isSoleImageBlockHtml(contentHtml) &&
              dims.width > 0 &&
              dims.height > 0
            ) {
              // While locked, the live box is the fit size free→fit should restore
              imageFitSizeRef.current = { width: dims.width, height: dims.height }
            }

            // RF chrome size = upright AABB when rotated (content dims stay in resizeDimensions)
            const rot =
              typeof metadata.rotation === 'number' ? metadata.rotation : 0
            const shape = parseFrameShape(metadata.frameShape)
            const aabb =
              Math.abs(rot) > 0.5
                ? rotatedFrameAabbSize(dims.width, dims.height, rot, shape)
                : { width: dims.width, height: dims.height }
            const setNodesFunc = getSetNodes()
            if (setNodesFunc) {
              setNodesFunc((nodes: any[]) =>
                nodes.map((node: any) =>
                  node.id === id
                    ? {
                        ...node,
                        width: aabb.width,
                        height: aabb.height,
                        style: {
                          ...(node.style || {}),
                          width: aabb.width,
                          height: aabb.height,
                        },
                      }
                    : node
                )
              )
            }
            }
          }
        }
      }
      
      // Mark as loaded to prevent re-running
      hasLoadedResizeStateRef.current = true
    }

    loadResizeState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProjectBoard, promptMessage?.id]) // Load once on mount - only depend on promptMessage.id

  // Update node data when collapse state changes
  const handleCollapseChange = useCallback((collapsed: boolean) => {
    setIsResponseCollapsed(collapsed)

    // Hide prompt more menu immediately when collapsing
    if (collapsed) {
      setShowPromptMoreMenu(false)
    } else {
      // Show prompt more menu after 0.2s delay when expanding to prevent flash
      setTimeout(() => {
        setShowPromptMoreMenu(true)
      }, 200)
    }
    const setNodes = getSetNodes()
    if (setNodes && reactFlowInstance) {
      setNodes((nodes: any[]) =>
        nodes.map((node: any) =>
          node.id === id
            ? { ...node, data: { ...node.data, isResponseCollapsed: collapsed } }
            : node
        )
      )
    }
  }, [id, getSetNodes, reactFlowInstance])

  // Handle resize end - clear resizing flag and reset refs for next resize session
  // handleResizeEnd is defined after isBlock to access it - see below

  // Handle comment creation from text selection
  const handleComment = useCallback((selectedText: string, from: number, to: number, section: 'prompt' | 'response') => {
    setNewCommentData({ selectedText, from, to, section })
    setNewCommentText('') // Reset comment text
    setShowComments(true) // Reactions toggle stays on while the composer is up
  }, [])

  // Handle adding emoji reaction
  const handleAddReaction = useCallback((selectedText: string, from: number, to: number, emoji: string, section: 'prompt' | 'response') => {
    // Get the appropriate editor (prompt or response)
    const editor = section === 'prompt' ? promptEditorRef.current : responseEditorRef.current

    // Apply blue highlight to the selected text (same as comments)
    if (editor) {
      try {
        // Use transaction to remove all highlight marks and apply blue
        const tr = editor.state.tr
        // Remove all highlight marks in the range
        tr.removeMark(from, to, editor.schema.marks.highlight)
        // Add blue highlight mark using blue-100 - slightly darker than blue-50
        tr.addMark(from, to, editor.schema.marks.highlight.create({ color: '#dbeafe' }))
        editor.view.dispatch(tr)
      } catch (error) {
        console.error('Error applying blue highlight to reacted text:', error)
      }
    }

    // Check if there's already a reaction for this exact text range
    const existingReaction = emojiReactions.find(
      reaction => reaction.from === from && reaction.to === to && reaction.section === section && reaction.emoji === emoji
    )

    if (existingReaction) {
      // Increment count if same emoji on same range
      setEmojiReactions(prev =>
        prev.map(reaction =>
          reaction.id === existingReaction.id
            ? { ...reaction, count: reaction.count + 1 }
            : reaction
        )
      )
    } else {
      // Create new reaction
      const newReaction: EmojiReaction = {
        id: `reaction-${Date.now()}-${Math.random()}`,
        selectedText,
        from,
        to,
        section,
        emoji,
        count: 1,
        createdAt: new Date().toISOString(),
      }
      setEmojiReactions(prev => [...prev, newReaction])
    }
  }, [emojiReactions])

  // Save new comment
  const handleSaveComment = useCallback(() => {
    if (!newCommentData || !newCommentText.trim()) return

    // Get the appropriate editor (prompt or response)
    const editor = newCommentData.section === 'prompt' ? promptEditorRef.current : responseEditorRef.current

    // Remove any existing highlight (yellow) and apply blue highlight
    if (editor) {
      try {
        const { from, to } = newCommentData
        // Use transaction to remove all highlight marks and apply blue
        const tr = editor.state.tr
        // Remove all highlight marks in the range
        tr.removeMark(from, to, editor.schema.marks.highlight)
        // Add blue highlight mark using blue-100 - slightly darker than blue-50
        tr.addMark(from, to, editor.schema.marks.highlight.create({ color: '#dbeafe' }))
        editor.view.dispatch(tr)
      } catch (error) {
        console.error('Error applying blue highlight to commented text:', error)
      }
    }

    const newComment: Comment = {
      id: `comment-${Date.now()}-${Math.random()}`,
      selectedText: newCommentData.selectedText,
      from: newCommentData.from,
      to: newCommentData.to,
      section: newCommentData.section,
      comment: newCommentText.trim(),
      createdAt: new Date().toISOString(),
    }

    setComments(prev => [...prev, newComment])
    setNewCommentData(null)
    setNewCommentText('')
    setShowComments(true) // Show comments after creating one
  }, [newCommentData, newCommentText])

  // Get comment count
  const commentCount = comments.length

  // Auto-resize new comment textarea to maintain pill shape
  useEffect(() => {
    if (newCommentTextareaRef.current) {
      // Reset to base state for measurement
      newCommentTextareaRef.current.style.height = '52px'
      newCommentTextareaRef.current.style.lineHeight = '52px'
      newCommentTextareaRef.current.style.paddingTop = '0px'
      newCommentTextareaRef.current.style.paddingBottom = '0px'

      // Check if content fits in one line (pill shape)
      const scrollHeight = newCommentTextareaRef.current.scrollHeight
      const fitsInOneLine = scrollHeight <= 52

      if (fitsInOneLine) {
        // Content fits in one line - keep pill shape
        newCommentTextareaRef.current.style.height = '52px'
        newCommentTextareaRef.current.style.lineHeight = '52px' // Match height exactly for perfect pill
        newCommentTextareaRef.current.style.paddingTop = '0px' // No padding to maintain pill shape
        newCommentTextareaRef.current.style.paddingBottom = '0px' // No padding to maintain pill shape
        newCommentTextareaRef.current.style.overflow = 'hidden'
      } else {
        // Content needs multiple lines - expand naturally
        newCommentTextareaRef.current.style.height = 'auto'
        newCommentTextareaRef.current.style.lineHeight = '1.4'
        newCommentTextareaRef.current.style.paddingTop = '13px' // Add padding when expanded
        newCommentTextareaRef.current.style.paddingBottom = '13px' // Add padding when expanded
        const expandedHeight = newCommentTextareaRef.current.scrollHeight
        newCommentTextareaRef.current.style.height = `${expandedHeight}px`
        newCommentTextareaRef.current.style.overflow = 'auto'
      }
    }
  }, [newCommentText])

  // Auto-resize reply textareas to maintain pill shape
  useEffect(() => {
    Object.entries(replyTextareaRefs.current).forEach(([commentId, textarea]) => {
      if (textarea) {
        // Reset to base state for measurement
        textarea.style.height = '52px'
        textarea.style.lineHeight = '52px'
        textarea.style.paddingTop = '0px'
        textarea.style.paddingBottom = '0px'

        // Check if content fits in one line (pill shape)
        const scrollHeight = textarea.scrollHeight
        const fitsInOneLine = scrollHeight <= 52

        if (fitsInOneLine) {
          // Content fits in one line - keep pill shape
          textarea.style.height = '52px'
          textarea.style.lineHeight = '52px' // Match height exactly for perfect pill
          textarea.style.paddingTop = '0px' // No padding to maintain pill shape
          textarea.style.paddingBottom = '0px' // No padding to maintain pill shape
          textarea.style.overflow = 'hidden'
        } else {
          // Content needs multiple lines - expand naturally
          textarea.style.height = 'auto'
          textarea.style.lineHeight = '1.4'
          textarea.style.paddingTop = '13px' // Add padding when expanded
          textarea.style.paddingBottom = '13px' // Add padding when expanded
          const expandedHeight = textarea.scrollHeight
          textarea.style.height = `${expandedHeight}px`
          textarea.style.overflow = 'auto'
        }
      }
    })
  }, [replyTexts])

  // Determine if this is a flashcard - move definition up to use in hooks
  const isFlashcard = promptMessage?.metadata?.isFlashcard === true
  
  // Check if flashcard tags are loaded (for controlling toolbar visibility)
  const { isReady: tagsLoaded, tagIds } = useFlashcardTagsLoaded(isFlashcard && responseMessage?.id ? responseMessage.id : undefined)
  
  // Block card: metadata.isBlock, or empty user-only body
  const isBlock = isBlockMeta(promptMessage?.metadata) ||
    (promptMessage?.role === 'user' && 
     !responseMessage && 
     (!promptMessage?.content || promptMessage.content.trim() === '' || promptMessage.content === '<p></p>' || promptMessage.content === '<p><br></p>'))
  const mountReason = useFrameContentMountReason(id) // always / warm / near — proximity is not enough
  // A frame with a current DOM snapshot renders cold pixel-identically, so proximity no longer earns
  // a live editor: mounting is reserved for interaction (hover, pointer-down, selection). Frames with
  // no capture yet still promote on proximity so the board warms itself once and then stays cheap.
  // A frame with a current DOM snapshot renders cold pixel-identically, so proximity no longer earns
  // a live editor: mounting is reserved for interaction (hover, pointer-down, selection). Frames with
  // no capture yet still promote on proximity so the board warms itself once and then stays cheap.
  // Subscribe to store epoch so the first idle capture flips coldReady without a content edit.
  const snapshotEpoch = useSyncExternalStore(
    subscribeFrameSnapshots,
    getFrameSnapshotEpoch,
    () => 0
  )
  const coldReady = useMemo(
    () =>
      readFrameSnapshot(
        conversationId,
        frameSnapshotKey(promptMessage?.id, 'prompt', {
          dbExpand: dbExpandSnapshotSlot(promptContent || '', dbAlwaysExpanded),
        }),
        promptContent || ''
      ) !== null,
    [conversationId, promptMessage?.id, promptContent, dbAlwaysExpanded, snapshotEpoch]
  )
  // Notion DB frames have no cold twin without a TipTap idle paint — proximity must mount TipTap
  // even when a snapshot exists, or they stay blank until hover / nav stop.
  const isDbFrame = hasDatabaseBlockHtml(promptContent || '')
  const dbNotionId =
    (promptContent || '').match(/data-notion-database-id=["']([^"']+)["']/i)?.[1] || null
  const stayColdOnNear = isPhoneLikeBoard() || (coldReady && !isDbFrame) // Phone: tap (warm) only
  const mountContent =
    mountReason !== false && !(mountReason === 'near' && stayColdOnNear)
  const contentDeferred =
    isBlock &&
    !isFlashcard &&
    !selected &&
    promptMessage?.metadata?.fadeIn !== true &&
    !mountContent
  // Not gated on `contentDeferred`: `TipTapContent` also renders cold when a gesture blocks a *first*
  // live mount, and that happens after `mountContent` (and so `contentDeferred`) has already flipped.
  // Without a box the cold branch loses its cached size *and* its kind, so a 1422×546 database frame
  // entering view mid-zoom rendered a bare 52×32 shimmer — a frame that looks blank until release.
  // Both consumers below still check `contentDeferred`, so a live frame's geometry is untouched.
  // `fadeIn` is deliberately absent: it marks a frame created by the I-bar / grip so it mounts live for
  // typing, but it is persisted on the message, so months later those frames still skip the box — and
  // the gesture gate defers them anyway. On this board 5 of 9 frames carry it, which is most of what
  // "frames don't show until I release" was.
  const coldBoxEligible = isBlock && !isFlashcard && !selected
  // Stable key — metadata object identity changes on every message patch would rebuild the box
  // and re-fire the deferred setNodes effect (fights auto-size strip → max update depth).
  const deferredMetaKey = JSON.stringify({
    rd: (promptMessage?.metadata as Record<string, unknown> | undefined)?.resizeDimensions ?? null,
  })
  const deferredBox = useMemo(() => {
    if (!coldBoxEligible) return null
    return resolveDeferredFrameBox(
      id,
      conversationId,
      promptContent,
      (promptMessage?.metadata as Record<string, unknown>) || null
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deferredMetaKey stands in for metadata
  }, [coldBoxEligible, id, conversationId, promptContent, deferredMetaKey])
  const deferredLayoutBox = useMemo(() => {
    if (!deferredBox) return null
    return { width: deferredBox.width, height: deferredBox.height }
  }, [deferredBox])
  const isOnThreadFrame = Boolean(
    readOnThread(promptMessage?.metadata as Record<string, unknown> | undefined)
  )
  const { connected: notionConnected, sync: notionSync } = readNotionConnection(
    promptMessage?.metadata as Record<string, unknown> | undefined
  ) // Frame Connections → Notion
  const framePropertyType = readFramePropertyType(
    promptMessage?.metadata as Record<string, unknown> | undefined
  ) // Turn into → Property → top chrome
  // Empty property icons — HTML seed until the live editor reports the doc list
  const [chromePropertyHeaders, setChromePropertyHeaders] = useState<PropertyHeaderItem[]>(() =>
    seedPropertyHeaders(promptContent || '', framePropertyType)
  )
  const [propBandH, setPropBandH] = useState(CONNECTIONS_GROUP_H) // Live wrapped strip (grows past one row)
  const [connBandH, setConnBandH] = useState(CONNECTIONS_GROUP_H) // Live wrapped connections (grows past one row)
  const propHeaderHostRef = useRef<HTMLDivElement>(null) // Measure flex-wrap height for the adjust-box top gap
  const connHeaderHostRef = useRef<HTMLDivElement>(null) // Measure flex-wrap height for the adjust-box bottom gap
  const onPropertyHeadersChange = useCallback((items: PropertyHeaderItem[]) => {
    setChromePropertyHeaders((prev) =>
      prev.length === items.length &&
      prev.every(
        (it, i) =>
          it.type === items[i].type && it.name === items[i].name && it.from === items[i].from
      )
        ? prev
        : items
    )
  }, [])
  useEffect(() => {
    setChromePropertyHeaders((prev) => {
      if (prev.some((it) => it.from >= 0)) return prev // Live editor owns positions
      return seedPropertyHeaders(promptContent || '', framePropertyType)
    })
  }, [promptContent, framePropertyType])

  // Live silhouette from menu / optimistic node patch (not only first metadata load)
  useEffect(() => {
    if (!isBlock) return
    const fromMeta = parseFrameShape(promptMessage?.metadata?.frameShape)
    const fromData = !isProjectBoard
      ? parseFrameShape((data as ChatPanelNodeData).frameShape)
      : null
    setFrameShape(fromMeta ?? fromData)
  }, [isBlock, isProjectBoard, promptMessage?.metadata?.frameShape, data])

  // Live alignment from the frame menu (optimistic node patch)
  useEffect(() => {
    if (!isBlock) return
    setFrameAlignX(parseFrameAlignX(promptMessage?.metadata?.frameAlignX))
  }, [isBlock, promptMessage?.metadata?.frameAlignX])

  // When Shape menu patches metadata, adopt unlock + box without waiting for remount
  useEffect(() => {
    if (!isBlock || !promptMessage?.metadata) return
    const meta = promptMessage.metadata as Record<string, unknown>
    if (!('frameShape' in meta) && !meta.resizeDimensions) return
    if (typeof meta.frameUnlocked === 'boolean') {
      setFrameUnlocked(meta.frameUnlocked)
    }
    const dims = meta.resizeDimensions as { width?: number; height?: number } | null | undefined
    if (dims && typeof dims.width === 'number' && typeof dims.height === 'number') {
      const contentHtml =
        typeof promptMessage?.content === 'string' ? promptMessage.content : ''
      // Don't re-apply locked hug dims while unlocked — metadata can lag after fit→free toggle.
      if (meta.frameUnlocked) {
        const cur = resizeDimensionsRef.current
        if (
          cur &&
          (Math.abs(cur.width - dims.width) > 1 || Math.abs(cur.height - dims.height) > 1)
        ) {
          return
        }
      }
      // Don't re-apply a post-drag stub size onto a live Notion database frame
      if (
        hasDatabaseBlockHtml(contentHtml) &&
        isCollapsedDatabaseFrameSize(dims.width, dims.height)
      ) {
        return
      }
      setResizeDimensions({ width: dims.width, height: dims.height })
      setIsUserResized(true)
    }
  }, [
    isBlock,
    promptMessage?.metadata?.frameShape,
    promptMessage?.metadata?.frameUnlocked,
    // Intentionally stringify dims so object identity from patches still triggers
    JSON.stringify(
      (promptMessage?.metadata as Record<string, unknown> | undefined)?.resizeDimensions ?? null
    ),
  ])

  // Miro split (locked):
  // • Connection **point** = invisible RF Handle on the frame edge (geometry + snap)
  // • Connection **indicator** = plain DOM dot outside — starts drag on the edge point (not an RF Handle)
  const isThreadConnecting = useIsThreadConnecting() // Hide adjust chrome while dragging a thread
  const nearThreadSides = useNearThreadConnectionSides(id) // Adjust box → all dots; fill → connection box
  const isNearThreadSnap = nearThreadSides !== 0 // This frame is under the thread end
  const showConnectionBox =
    isThreadConnecting && (nearThreadSides & THREAD_CONNECTION_BOX) !== 0 // Fill shows the connection box
  const groupMulti = useGroupMultiSelect() // Shared box owns handles, dots, and the rotate/reactions row
  // Mid-press on the body — hide connection indicators only (resize / ⋮⋮ / rotate stay mounted)
  const [pressing, setPressing] = useState(false)
  // Full adjust chrome when selected + idle (not mid-drag / thread connect)
  const showAdjustFrame = Boolean(selected && isBlock && !isThreadConnecting && !dragging)
  // Transient blue outline while moving; selected frames keep `selected` and regain adjust chrome on release
  const showDragBorderOnly = Boolean((dragging || manualDragNodeId === id) && isBlock)
  // Blue-box L/R gutters when selected. Property / connections sit OUTSIDE the fill
  // (above / below). Selected T/B bands reserve room in the blue box; unselected
  // connections hang out. Property icons paint only while the frame is selected.
  // Full L/R gutters + RF position shift only when selected — not on unselected drag (showDragBorderOnly).
  // Turning chrome on at drag-start used to shift RF position while d3 already had the grab point → jump.
  const showFrameChrome = Boolean(isBlock && selected && !isThreadConnecting)
  // Live L/R pad while selected (⋮⋮ stays centered in the blue↔fill strip as zoom changes).
  // Upright fill stays put via negative margins on the panel (same paint as the pad).
  // Rotated fill stays put: glueFrameChromePad shifts RF XY by half the AABB delta.
  const chromeScale =
    isBlock && Math.abs(frameScale - 1) > FRAME_SCALE_EPSILON
      ? Math.max(FRAME_SCALE_EPSILON, frameScale)
      : 1 // Place + locked resize — gutters track CSS-scaled fill
  const screenChromeScale = frameScreenChromeScale(rfZoom || 1) // Handles / dots / rotate only
  const adjustChromeX = showFrameChrome
    ? Math.round(adjustChromeXFlow(rfZoom || 1, chromeScale))
    : 0
  const handleGutterFlow = showFrameChrome
    ? handleGutterFlowPx(rfZoom || 1, chromeScale) // Live — matches pad so grip stays centered in the strip
    : 0
  const adjustPadCss = showFrameChrome ? `${adjustChromeX}px` : undefined
  // pushAabb / painted sync read this — callbacks must not close over a stale pad
  const adjustChromeXRef = useRef(0)
  adjustChromeXRef.current = adjustChromeX
  const chromeBandH = Math.round(CONNECTIONS_GROUP_H * chromeScale) // Property / connections strip
  const chromePadX = Math.round(BLOCK_FRAME_PAD_X * chromeScale) // Band inset matches scaled fill pad
  const adjustGapY = showFrameChrome
    ? Math.round(adjustGapYFlow(rfZoom || 1, chromeScale))
    : 0 // Blue↔fill air when a T/B strip is absent
  const showFrameConnections = useShowFrameConnections() // On shows the Notion mark under unselected frames
  // Properties are blocks inside the frame. The top gap stays only to match a connection row below.
  const hasPropBand = false
  // Notion mark under the frame: toggle on keeps it on unselected frames; off keeps it on the selected frame.
  const hasConnBand = Boolean(
    notionConnected && !isFlashcard && (showFrameConnections || showFrameChrome)
  )
  // Selected: property / connections live in the adjust box (above / below the fill).
  const uprightChrome = Math.abs(rotation) <= 0.5
  // Painted strip heights (0 when that row is absent — nothing reserved for it)
  const propBandPaintH = hasPropBand ? Math.max(chromeBandH, propBandH) : 0
  const connBandPaintH = hasConnBand ? Math.max(chromeBandH, connBandH) : 0
  const dbFooterH =
    isDbFrame && uprightChrome
      ? Math.round(DB_ROWS_REVEAL_FOOTER_H * chromeScale)
      : 0 // `+# rows` lives in the bottom adjust band, above connections
  // One row is mirrored on the empty side so the fill stays centered; wrap/footer are not
  const adjustPads =
    showFrameChrome && uprightChrome
      ? selectedAdjustChromeY({
          gapY: adjustGapY, // Air only when both strips are absent
          rowH: chromeBandH, // One property / connections row
          propH: propBandPaintH, // 0 when there are no property icons
          connH: connBandPaintH, // 0 when there is no connections row
          footerH: dbFooterH, // DB footer grows the bottom only
          dbTopBand: isDbFrame, // DB top stays open without property icons
        })
      : { yTop: 0, yBottom: 0 }
  const adjustChromeYTop = adjustPads.yTop // Gap from the blue top to the fill (matches a connection row below)
  const adjustChromeYBottom = adjustPads.yBottom // Gap from the fill to the blue bottom
  const connZone = Math.max(0, adjustChromeYBottom - dbFooterH) // Bottom pad under the DB footer
  const connCenterOffset = connBandPaintH
    ? Math.max(0, Math.round((connZone - connBandPaintH) / 2))
    : 0
  const adjustChromeYTopRef = useRef(0)
  adjustChromeYTopRef.current = adjustChromeYTop
  const adjustChromeYBottomRef = useRef(0)
  adjustChromeYBottomRef.current = adjustChromeYBottom
  // Wrapped property rows: grow the adjust-box top gap to the painted strip (CSS scale is visual-only)
  useLayoutEffect(() => {
    const host = propHeaderHostRef.current
    if (!host || !hasPropBand) {
      if (propBandH !== chromeBandH) setPropBandH(chromeBandH) // Reset when the strip is gone
      return
    }
    const measure = () => {
      const inner = host.querySelector('[data-tt-property-header]') as HTMLElement | null
      const raw = inner?.offsetHeight ?? 0 // Unscaled 14px icons + 2px air — same size as frame text
      if (raw < 1) return
      const visual = Math.max(chromeBandH, Math.round(raw * chromeScale)) // Match fill CSS scale
      setPropBandH((prev) => (Math.abs(prev - visual) <= 0.5 ? prev : visual))
    }
    measure()
    const ro = new ResizeObserver(measure) // Width change → wrap rows → new top gap
    const inner = host.querySelector('[data-tt-property-header]')
    if (inner) ro.observe(inner)
    ro.observe(host)
    return () => ro.disconnect()
  }, [hasPropBand, chromePropertyHeaders.length, chromeScale, chromeBandH, selected, resizeDimensions?.width, frameScale])
  // Wrapped connection rows: grow the bottom gap the same way (extra is not mirrored on top)
  useLayoutEffect(() => {
    const host = connHeaderHostRef.current // Outer band — inner header is the unscaled row
    if (!host || !hasConnBand) {
      if (connBandH !== chromeBandH) setConnBandH(chromeBandH) // Reset when the strip is gone
      return
    }
    const measure = () => {
      const inner = host.querySelector('[data-tt-connections-header]') as HTMLElement | null
      const raw = inner?.offsetHeight ?? 0 // Unscaled row — may wrap past one line
      if (raw < 1) return
      const visual = Math.max(chromeBandH, Math.round(raw * chromeScale)) // Match fill CSS scale
      setConnBandH((prev) => (Math.abs(prev - visual) <= 0.5 ? prev : visual))
    }
    measure() // First paint
    const ro = new ResizeObserver(measure) // Width change → wrap → taller bottom gap
    const inner = host.querySelector('[data-tt-connections-header]')
    if (inner) ro.observe(inner) // The row itself
    ro.observe(host) // The band
    return () => ro.disconnect()
  }, [hasConnBand, chromeScale, chromeBandH, selected, resizeDimensions?.width, frameScale])
  // Rotated chrome is baked into the upright AABB — shift RF by half the AABB delta so the fill
  // stays centered. Upright frames do not move: negative margins cancel the pad in the same paint.
  // A deferred −X shift lost the race to drag-stop and only stuck on the second select.
  const frameChromeOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const glueFrameChromePad = useCallback(() => {
    if (!isBlock || dragging) return // Drag owns the transform; shifting here jumps the grab
    let wantX = 0
    let wantY = 0
    const upright = Math.abs(rotation) <= 0.5
    if (showFrameChrome && !upright) {
      const dims = liveLockedContentRef.current ?? resizeDimensionsRef.current
      if (dims) {
        const inner = rotatedFrameAabbSize(dims.width, dims.height, rotation, frameShape)
        const outer = rotatedFrameAabbSize(
          dims.width + adjustChromeX * 2,
          dims.height,
          rotation,
          frameShape
        )
        wantX = (outer.width - inner.width) / 2 // Half the extra AABB — grow both ways
        wantY = (outer.height - inner.height) / 2
      } else {
        wantX = adjustChromeX // No dims yet — shift by the gutter until the AABB is known
      }
    }
    const storeNode = rfStoreApi.getState().nodeInternals.get(id)
    const storePos = storeNode?.position
    if (!storePos) return
    const applied = readFrameChromePad(storeNode?.data)
    const fill = fillOriginFromFlowPosition(storePos, applied) // Undo any leftover −X from the old path
    const nextPos = flowPositionFromFillOrigin(fill, { x: wantX, y: wantY })
    frameChromeOffsetRef.current = { x: wantX, y: wantY }
    if (
      Math.abs(nextPos.x - storePos.x) < 0.5 &&
      Math.abs(nextPos.y - storePos.y) < 0.5 &&
      applied.x === wantX &&
      applied.y === wantY
    ) {
      return // Store XY and pad already match — upright pad stays unset
    }
    const setNodesFunc = getSetNodes()
    if (!setNodesFunc) return
    setNodesFunc((nds: any[]) =>
      nds.map((n) => {
        if (n.id !== id) return n
        const padNow = readFrameChromePad(n.data)
        const fillNow = fillOriginFromFlowPosition(n.position, padNow)
        const pos = flowPositionFromFillOrigin(fillNow, { x: wantX, y: wantY })
        const data = { ...(n.data || {}) }
        if (wantX || wantY) data.frameChromePad = { x: wantX, y: wantY }
        else delete data.frameChromePad // Upright: margins own the gutter; pad would double-shift
        if (Math.abs(pos.x - n.position.x) < 0.5 && Math.abs(pos.y - n.position.y) < 0.5) {
          const had = readFrameChromePad(n.data)
          const padSame = had.x === wantX && had.y === wantY
          return padSame ? n : { ...n, data }
        }
        return { ...n, position: pos, data }
      })
    )
    updateNodeInternals(id)
  }, [
    isBlock,
    id,
    showFrameChrome,
    adjustChromeX,
    rotation,
    frameShape,
    dragging,
    getSetNodes,
    updateNodeInternals,
    rfStoreApi,
  ])
  useLayoutEffect(() => {
    glueFrameChromePad() // Clear a stale RF −X before paint so it cannot stack with the margins
  }, [glueFrameChromePad, showFrameChrome, adjustChromeX, rotation])
  // Stack/hide unmounts the node while chrome is still on — without this, RF keeps the
  // chrome-shifted XY and remount reapplies chrome → frame jumps up/left one gutter.
  useLayoutEffect(() => {
    if (!isBlock) return
    return () => {
      const baked = frameChromeOffsetRef.current
      if (baked.x === 0 && baked.y === 0) return
      frameChromeOffsetRef.current = { x: 0, y: 0 }
      const setNodesFunc = getSetNodes()
      if (!setNodesFunc) return
      setNodesFunc((nds: any[]) =>
        nds.map((n) => {
          if (n.id !== id) return n
          const pad = readFrameChromePad(n.data)
          const fill = fillOriginFromFlowPosition(n.position, pad)
          const data = { ...(n.data || {}) }
          delete data.frameChromePad
          return { ...n, position: fill, data }
        })
      )
    }
  }, [isBlock, id, getSetNodes])
  // Stack lines: one per adjust-box side that has a mate further out on that side’s tree.
  // Equality fn is required — a fresh `[]` every store tick re-rendered every frame on pinch
  // (large Notion DB tables → phone Safari tab reload over tunnel).
  const stackMeta = (promptMessage?.metadata || {}) as Record<string, unknown>
  // Whether *this* frame is stacked depends only on its own metadata, so it is answered before the
  // store scan below. Without it, every mounted frame walked all of nodeInternals × 4 sides on every
  // store update: a pan that fired 13 RF `dimensions` changes did ~57k metadata reads and measured
  // 421ms of blocking. `isBoardNavigating()` does not cover this — wheel/trackpad pan in Scroll mode
  // goes through setViewport, which fires neither onMoveStart nor onMove.
  const myStackSides = useMemo(() => readSideStacks(stackMeta), [stackMeta])
  const hasAnyStackSide = FRAME_STACK_SIDES.some((side) => !!myStackSides[side])
  const stackGapSides = useStore(
    (s) => {
      if (!hasAnyStackSide) return EMPTY_STACK_SIDES
      if (isBoardNavigating() || isFrameDragging()) return EMPTY_STACK_SIDES
      const mine = myStackSides
      const sides: Array<{ side: FrameStackSide; groupId: string }> = []
      for (const side of FRAME_STACK_SIDES) {
        const entry = mine[side]
        if (!entry) continue
        const myIdx = entry.anchor ? 0 : entry.index
        let hasOut = false
        s.nodeInternals.forEach((n) => {
          if (n.id === id || n.type !== 'chatPanel') return
          const m = (n.data?.promptMessage?.metadata || {}) as Record<string, unknown>
          const other = readSideStacks(m)[side]
          if (!other || other.groupId !== entry.groupId) return
          const idx = other.anchor ? 0 : other.index
          if (idx > myIdx) hasOut = true
        })
        if (hasOut) sides.push({ side, groupId: entry.groupId })
      }
      return sides
    },
    (a, b) =>
      a.length === b.length &&
      a.every((x, i) => x.side === b[i].side && x.groupId === b[i].groupId)
  )

  // Connection points: selected frame (idle), or the frame under a dragged thread end.
  // Mid-press on the *body* hides them (`pressing`); press on the indicator itself is excluded so
  // the simulator stays mounted and can arm the thread instead of RF frame-dragging.
  const showIndicators =
    isBlock &&
    !isFlashcard &&
    !dragging &&
    !pressing && // Body mid-press hides simulators; resize corners stay (onFrameChrome exclusion)
    // Group selection keeps the blue box but not the simulated connection dots.
    ((selected && !isThreadConnecting && !groupMulti) || (isThreadConnecting && isNearThreadSnap))

  // Invisible edge connection point — size from live CSS --tt-frame-ui-scale; paint stays transparent
  const connectionPointStyle = (): React.CSSProperties => ({
    opacity: 0,
    backgroundColor: 'transparent',
    border: 'none',
    boxShadow: 'none',
    cursor: 'default',
  }) as React.CSSProperties
  
  // Measured frame box for chrome scale / AABB — seed at plain-text hug (not 200×120 card stub)
  const [itemBoxSize, setItemBoxSize] = useState({ width: BLOCK_LOCKED_MIN_W, height: BLOCK_MIN_FRAME_H })
  // In-place nested board for a titled item’s linked page
  const [pagePreviewOpen, setPagePreviewOpen] = useState(false)
  const [pagePreviewMounted, setPagePreviewMounted] = useState(false) // Keep iframe warm after first open/hover
  const [previewTargetBoardId, setPreviewTargetBoardId] = useState<string | null>(null) // Which page the preview shows (boardLink or frame)
  const linkedBoardId = !isProjectBoard
    ? (getLinkedBoardId(promptMessage?.metadata as Record<string, unknown> | null) || undefined)
    : undefined
  const activePreviewBoardId = previewTargetBoardId || linkedBoardId || null // Page the shell renders
  const blockTitleLabel =
    (promptMessage?.metadata?.blockTitle as string | undefined) || ''
  // Notion deep link for Open in Notion in the shared page open menu
  const notionUrl =
    !isProjectBoard && typeof promptMessage?.metadata?.notionUrl === 'string'
      ? (promptMessage.metadata.notionUrl as string)
      : null
  const isBoardBody = isBoardBodyMeta(promptMessage?.metadata) // Body on its own page — no nested open menu
  // Frame already has a boardLink for this page → that NodeView owns the open menu
  const hasBoardLinkForFrame = !!(
    linkedBoardId &&
    (promptContent.includes(`data-board-id="${linkedBoardId}"`) ||
      promptContent.includes(`data-board-id='${linkedBoardId}'`) ||
      promptContent.includes(`data-page-id="${linkedBoardId}"`) ||
      promptContent.includes(`data-page-id='${linkedBoardId}'`))
  )
  // databaseBlock NodeView owns Preview/Open when this is a Notion DB frame
  const hasDatabaseBlockForFrame = /data-type=["']databaseBlock["']/i.test(promptContent)
  // Page frames whose content is still regular TipTap blocks (legacy title) need the menu too
  const showFrameBoardOpenMenu =
    !!linkedBoardId &&
    !isBoardBody &&
    !pagePreviewOpen &&
    !hasBoardLinkForFrame &&
    !hasDatabaseBlockForFrame &&
    (isFrameHovering || selected)

  // One-shot: legacy sole-databaseBlock map frames → boardLink (Notion **pages** only).
  // Notion databases keep the live table — remount after row→card must not wipe databaseBlock.
  // Nested board body / imported map boardLinks already have the right shape.
  const migratedDbFrameRef = useRef(false)
  useEffect(() => {
    if (migratedDbFrameRef.current || isProjectBoard || isBoardBody) return
    if (!promptMessage?.id || !conversationId) return
    if (hasBoardLinkForFrame) return
    const meta = (promptMessage.metadata as Record<string, unknown>) || {}
    if (meta.notionObject === 'database') return // Live table stays on this frame / board body
    const serverContent = promptMessage.content || ''
    const needsMigrate =
      isSoleDatabaseBlockContent(serverContent) || isSoleDatabaseBlockContent(promptContent)
    if (!needsMigrate) return

    migratedDbFrameRef.current = true
    void (async () => {
      try {
        const client = createClient()
        const { data: auth } = await client.auth.getUser()
        const userId = auth.user?.id
        if (!userId) {
          migratedDbFrameRef.current = false
          return
        }
        const sourceHtml = isSoleDatabaseBlockContent(serverContent) ? serverContent : promptContent

        // Fast path: linkedBoardId already known → rewrite HTML locally + persist
        if (linkedBoardId) {
          const iconMeta = promptMessage.metadata?.notionIcon as { type?: string; emoji?: string } | null
          const emoji = iconMeta?.type === 'emoji' && iconMeta.emoji ? iconMeta.emoji : null
          const next = migrateSoleDatabaseBlockToBoardLink(sourceHtml, {
            boardId: linkedBoardId,
            title: blockTitleLabel || null,
            icon: emoji,
          })
          if (!next) {
            migratedDbFrameRef.current = false
            return
          }
          setPromptContent(next)
          setPromptHasChanges(true) // Block content-sync from clobbering until write lands
          const existingMeta = (promptMessage.metadata as Record<string, unknown>) || {}
          await client
            .from('messages')
            .update({
              content: next,
              metadata: { ...existingMeta, isBoard: true, blockType: 'board' },
            })
            .eq('id', promptMessage.id)
          setPromptHasChanges(false)
          await queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
          return
        }

        // Slow path: no linkedBoardId yet — resolve/create nested page then rewrite
        const result = await ensureNotionMapFrameIsBoardLink(client, {
          messageId: promptMessage.id,
          userId,
          parentConversationId: conversationId,
          content: sourceHtml,
          metadata: (promptMessage.metadata as Record<string, unknown>) || {},
        })
        if (!result) {
          migratedDbFrameRef.current = false
          return
        }
        setPromptContent(result.content)
        setPromptHasChanges(false)
        await queryClient.invalidateQueries({ queryKey: ['conversations'] })
        await queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      } catch (err) {
        console.error('Failed to migrate Notion DB frame to boardLink:', err)
        migratedDbFrameRef.current = false
      }
    })()
  }, [
    isProjectBoard,
    isBoardBody,
    linkedBoardId,
    promptMessage?.id,
    promptMessage?.content,
    promptMessage?.metadata,
    hasBoardLinkForFrame,
    promptContent,
    blockTitleLabel,
    conversationId,
    queryClient,
  ])

  // One-shot: board/boardIn frames must be sole boardLink — repair sibling leak from prepend-only sync.
  // Never peel a live Notion databaseBlock or Card-view frames (boardLink + property cells).
  const repairedBoardFrameRef = useRef(false)
  useEffect(() => {
    if (repairedBoardFrameRef.current || isProjectBoard || isBoardBody) return
    if (!promptMessage?.id || !linkedBoardId) return
    const meta = (promptMessage.metadata as Record<string, unknown>) || {}
    if (meta.notionObject === 'database') return
    if (meta.dbLayout === 'card') return // Row→card frames keep title + property cells
    const bt = typeof meta.blockType === 'string' ? meta.blockType : ''
    if (bt !== 'board' && bt !== 'boardIn' && bt !== 'page' && bt !== 'pageIn') return
    const serverContent = promptMessage.content || ''
    const source = !isSoleBoardLinkContent(serverContent)
      ? serverContent
      : !isSoleBoardLinkContent(promptContent)
        ? promptContent
        : null
    if (!source) return
    if (isSoleDatabaseBlockContent(source)) return // Keep live table; do not rewrite to boardLink
    // Property cells on a board frame are intentional (Card view) — not sibling leak
    if (/data-type=["']propertyBlock["']/i.test(source)) return

    repairedBoardFrameRef.current = true
    void (async () => {
      try {
        const client = createClient()
        const { data: auth } = await client.auth.getUser()
        const userId = auth.user?.id
        if (!userId) {
          repairedBoardFrameRef.current = false
          return
        }
        const result = await repairBoardFrameToSoleLink(client, {
          messageId: promptMessage.id,
          userId,
          content: source,
          metadata: meta,
        })
        if (!result) {
          repairedBoardFrameRef.current = false
          return
        }
        setPromptContent(result.content)
        setAiForceSyncKey((k) => k + 1) // Swap TipTap even if focused
        await queryClient.invalidateQueries({ queryKey: ['messages-for-panels', conversationId] })
        await queryClient.invalidateQueries({ queryKey: ['messages-for-panels', linkedBoardId] })
      } catch (err) {
        console.error('Failed to repair board frame to sole boardLink:', err)
        repairedBoardFrameRef.current = false
      }
    })()
  }, [
    isProjectBoard,
    isBoardBody,
    linkedBoardId,
    promptMessage?.id,
    promptMessage?.content,
    promptMessage?.metadata,
    promptContent,
    conversationId,
    queryClient,
  ])

  // One-shot: board-body must not duplicate the board name as its only/first block
  const cleanedTitleBodyRef = useRef(false)
  useEffect(() => {
    if (cleanedTitleBodyRef.current || !isBoardBody || isProjectBoard) return
    if (!promptMessage?.id || !conversationId) return
    const title =
      (blockTitleLabel || '').trim() ||
      (typeof promptMessage.metadata?.blockTitle === 'string'
        ? promptMessage.metadata.blockTitle.trim()
        : '')
    if (!title) return
    const source = promptMessage.content || promptContent || ''
    // Never strip a live Notion database atom as if it were a title line
    if (isSoleDatabaseBlockContent(source) || /data-type=["']databaseBlock["']/i.test(source)) {
      return
    }
    const cleaned = bodyHtmlWithoutBoardTitle(source, title)
    if (cleaned === source.trim()) return // Already free of a title-line duplicate

    cleanedTitleBodyRef.current = true
    void (async () => {
      try {
        const client = createClient()
        if (isBlockContentEmpty(cleaned)) {
          // Title-only body → remove the frame; name stays on conversations.title
          await client.from('messages').delete().eq('id', promptMessage.id)
          const { data: page } = await client
            .from('conversations')
            .select('metadata')
            .eq('id', conversationId)
            .maybeSingle()
          if (page) {
            const meta = (page.metadata as Record<string, unknown>) || {}
            await client
              .from('conversations')
              .update({ metadata: { ...meta, hasContent: false } })
              .eq('id', conversationId)
          }
        } else {
          await client.from('messages').update({ content: cleaned }).eq('id', promptMessage.id)
          setPromptContent(cleaned)
          setAiForceSyncKey((k) => k + 1)
        }
        await queryClient.invalidateQueries({ queryKey: ['messages-for-panels', conversationId] })
        await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      } catch (err) {
        console.error('Failed to strip board title from board-body:', err)
        cleanedTitleBodyRef.current = false
      }
    })()
  }, [
    isBoardBody,
    isProjectBoard,
    promptMessage?.id,
    promptMessage?.content,
    promptMessage?.metadata,
    promptContent,
    blockTitleLabel,
    conversationId,
    queryClient,
  ])

  // One-shot: restore Notion DB table if migrate/repair wiped databaseBlock (empty / sole boardLink)
  const restoredDbBlockRef = useRef(false)
  useEffect(() => {
    if (restoredDbBlockRef.current || isProjectBoard) return
    if (!promptMessage?.id || !conversationId) return
    const meta = (promptMessage.metadata as Record<string, unknown>) || {}
    const serverContent = promptMessage.content || ''
    const healed = restoreWipedDatabaseBlockHtml(serverContent, meta)
    if (!healed) return

    restoredDbBlockRef.current = true
    void (async () => {
      try {
        const client = createClient()
        await client.from('messages').update({ content: healed }).eq('id', promptMessage.id)
        setPromptContent(healed)
        setAiForceSyncKey((k) => k + 1)
        await queryClient.invalidateQueries({ queryKey: ['messages-for-panels', conversationId] })
      } catch (err) {
        console.error('Failed to restore wiped Notion databaseBlock:', err)
        restoredDbBlockRef.current = false
      }
    })()
  }, [
    isProjectBoard,
    promptMessage?.id,
    promptMessage?.content,
    promptMessage?.metadata,
    conversationId,
    queryClient,
  ])

  // Warm lean embed document (and mount hidden iframe) so first nav isn’t a cold boot
  const prefetchPagePreview = () => {
    if (!linkedBoardId) return
    prefetchBoardEmbed(linkedBoardId)
    router.prefetch(`/embed/${linkedBoardId}`)
    setPagePreviewMounted(true)
  }

  // Actions handed to boardLink NodeViews (open/close preview, open page, prefetch, rename, Notion)
  const boardLinkActions = useMemo<BoardLinkActions>(
    () => ({
      previewBoardId: pagePreviewOpen ? activePreviewBoardId : null,
      openPreview: (pid: string) => {
        setPreviewTargetBoardId(pid) // Point the shared shell at this child page
        setPagePreviewMounted(true)
        setPagePreviewOpen(true)
      },
      closePreview: () => setPagePreviewOpen(false),
      openBoard: (pid: string) => router.push(`/board/${pid}`),
      prefetch: (pid: string) => {
        prefetchBoardEmbed(pid)
        router.prefetch(`/embed/${pid}`)
        setPagePreviewMounted(true)
      },
      renameTitle: async (pid: string, title: string) => {
        try {
          const supabase = createClient()
          await supabase.from('conversations').update({ title: boardTitleOrDefault(title) }).eq('id', pid)
          await queryClient.invalidateQueries({ queryKey: ['conversations'] })
        } catch (err) {
          console.error('Failed to rename linked page:', err)
        }
      },
      setIcon: async (pid: string, iconEmoji: string | null) => {
        try {
          const supabase = createClient()
          const { data: row } = await supabase.from('conversations').select('metadata').eq('id', pid).single()
          const existing = (row?.metadata as Record<string, unknown>) || {}
          const nextMeta = { ...existing }
          if (iconEmoji) nextMeta.icon = { type: 'emoji', emoji: iconEmoji } // Notion-compatible icon shape
          else delete nextMeta.icon
          await supabase.from('conversations').update({ metadata: nextMeta }).eq('id', pid)
          await queryClient.invalidateQueries({ queryKey: ['conversations'] })
          await queryClient.invalidateQueries({ queryKey: ['path-board-menu'] })
        } catch (err) {
          console.error('Failed to set linked page icon:', err)
        }
      },
      notionUrl, // Open in Notion button when this frame is Notion-linked
      // DB / legacy titled frames (no boardLink NodeView) reuse this for BoardOpenMenu
      hostLinkedBoardId: hasBoardLinkForFrame ? null : linkedBoardId || null,
      hostMessageId: promptMessage?.id || null, // Convert layout from DB table / row ⋮⋮
      conversationId: conversationId || null,
      hostNodeId: id || null, // RF node id for Sort / selection store
      frameSelected: !!selected, // React-reactive select — TipTap storage alone does not re-render NodeViews
    }),
    [
      pagePreviewOpen,
      activePreviewBoardId,
      router,
      queryClient,
      notionUrl,
      hasBoardLinkForFrame,
      linkedBoardId,
      promptMessage?.id,
      conversationId,
      id,
      selected,
    ]
  )

  // Update title-chip perimeter when the note/item box changes size
  useEffect(() => {
    if (!isBlock || !panelRef.current) return
    const updateFromSize = () => {
      if (!panelRef.current) return
      const width = panelRef.current.offsetWidth || BLOCK_LOCKED_MIN_W
      const height = panelRef.current.offsetHeight || BLOCK_MIN_FRAME_H
      setItemBoxSize((prev) =>
        Math.abs(prev.width - width) <= 1 && Math.abs(prev.height - height) <= 1
          ? prev
          : { width, height }
      )
    }
    updateFromSize()
    const resizeObserver = new ResizeObserver(updateFromSize)
    resizeObserver.observe(panelRef.current)
    return () => resizeObserver.disconnect()
  }, [isBlock])

  const hugFreezeUntilRef = useRef(0) // Skip hug that would shrink atom frames right after drag
  const frameDragSuspendRef = useRef(false) // Sync — onUpdate must see this before React re-renders

  // Natural content box (not the stretched w-full width when unlocked+resized) — lock hug needs this.
  // Debounced: RO can fire in bursts; avoid setState storms into BoardFlow.
  // Skip while the frame is being dragged — RF transforms make Range/gBCR measurements collapse
  // (esp. for databaseBlock tables) and hug would shrink the frame so the table “disappears”.
  useEffect(() => {
    if (!isBlock || dragging) return
    const el = contentFitRef.current
    if (!el) return
    let raf = 0
    const measure = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        if (isResizingRef.current) return // Corner-drag owns size — hug RO would hitch the gesture (esp. phone)
        if (Date.now() < hugFreezeUntilRef.current) return // Post-drag: wait for property NodeViews
        if (isBoardNavigating()) return // Pinch freeze silhouette — don’t hug to stub size
        // A deferred frame is showing a shell, not its content, so its natural width is the ~98px
        // empty-frame hug. Hugging that writes the stub into node state (and the layout cache), and
        // the frame then stays a clipped one-word column at every zoom until it next goes live —
        // which is what "frames don't show when I zoom out / pan" actually was. Only measure content.
        if (contentDeferred) return
        const previewEl = el.querySelector('[data-page-preview]') as HTMLElement | null
        if (previewEl && previewEl.offsetHeight < 8) return // Preview opening — wait for the card box
        // databaseBlock: wait until the Notion table NodeView is mounted. Measuring the title
        // stub (~52×40) after a remount would hug-shrink the frame and clip the table away.
        const dbHost = el.querySelector('.tt-database-block') as HTMLElement | null
        if (dbHost && !dbHost.querySelector('.tt-notion-db')) return
        // Row card: wait until property cells remount after drag-end setContent (first-drag hug
        // otherwise collapses to grip+I-bar; a second drag remeasured and “brought it back”).
        const expectProps = countPropertyBlocks(promptContent)
        if (expectProps > 0) {
          const liveProps = el.querySelectorAll('.tt-property-block').length
          if (liveProps < expectProps) return
        }
        // Atom NodeViews mount async — don’t hug to the empty stub before they’re in the DOM.
        // Must include imageBlock (and media): image-only frames used to hit this return forever
        // (hasFrameAtomHtml true, but no boardLink/DB/property) → tiny blue box + overflowing img.
        if (
          hasFrameAtomHtml(promptContent) &&
          !el.querySelector(
            '.tt-board-link, .tt-database-block, .tt-property-block, .tt-image-block, .tt-media-block'
          )
        ) {
          return
        }
        // imageBlock: wait until media has a bitmap — but do NOT hug the frame to the image.
        // Insert/fit is contain-inside-frame; growing the box was the old width-led behavior.
        const imageHost = el.querySelector('.tt-image-block-has-src') as HTMLElement | null
        const soleImage = isSoleImageBlockHtml(promptContent)
        if (soleImage) {
          // Keep prior intrinsic / resizeDimensions — frame size is sticky on image insert
          if (imageHost) {
            const img = imageHost.querySelector('.tt-image-block-img') as HTMLImageElement | null
            if (img && (!img.complete || img.naturalWidth < 1)) return
            setIntrinsicMeasured(true)
          }
          return
        }
        if (imageHost) {
          const media = imageHost.querySelector('.tt-image-block-media') as HTMLElement | null
          const img = imageHost.querySelector('.tt-image-block-img') as HTMLImageElement | null
          if (img && (!img.complete || img.naturalWidth < 1)) return
          if (media && (media.offsetWidth < 4 || media.offsetHeight < 4)) return
        }
        const rowCard = isRowCardAtomHtml(promptContent)
        // Prefer DB scrollHeight extents — contentFit border-box stays fixed when the frame
        // already has resizeDimensions, so RO on contentFit alone never sees live-table growth.
        const dbBox = measureDatabaseBlockExtents(el, notionConnected)
        const width = Math.max(
          1,
          Math.round(
            dbBox?.width ??
              (rowCard ? measureRowCardContentWidth(el) : measureNaturalContentWidth(el))
          )
        )
        // Keep 2dp: rounding here would be re-multiplied by frameScale into visible bottom slack
        const height = Math.max(
          1,
          Math.round((dbBox?.height ?? measureNaturalContentHeight(el, notionConnected)) * 100) / 100
        )
        setDatabaseExtents(dbBox)
        if (
          (dbHost || hasDatabaseBlockHtml(promptContent)) &&
          isCollapsedDatabaseFrameSize(width, height)
        ) {
          return // Reject collapsed stub measures
        }
        // Mounted property cells can be narrower than 120 (icon + "Empty"). The liveProps
        // wait above already skips the grip+I-bar stub; a hard floor left the frame at the
        // text seed and the scaled cell ran past the blue edge.
        // Post-drag only: block stub measures that would halve a good box (not shrink from a bad wide measure).
        const prev = intrinsicSizeRef.current
        if (
          isRowCardAtomHtml(promptContent) &&
          Date.now() < hugFreezeUntilRef.current &&
          prev.width > 80 &&
          prev.height > 40 &&
          (width < prev.width * 0.5 || height < prev.height * 0.5)
        ) {
          return
        }
        setIntrinsicMeasured(true)
        setIntrinsicSize((prevSize) => {
          // Sub-px epsilon on height: the measure is fractional and stable per keystroke now, and
          // frameScale multiplies any stale fraction into slack under the block — so don't hold a
          // near-match. Width keeps the 1px epsilon (glyph advance noise, no scale amplification).
          if (Math.abs(prevSize.width - width) <= 1 && Math.abs(prevSize.height - height) <= 0.02) {
            return prevSize
          }
          return { width, height }
        })
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // Live/static DB swaps change inner scrollHeight without resizing contentFit’s border box
    const dbHost = el.querySelector('.tt-database-block') as HTMLElement | null
    if (dbHost) ro.observe(dbHost)
    const notionDb = dbHost?.querySelector('.tt-notion-db') as HTMLElement | null
    if (notionDb) ro.observe(notionDb)
    // imageBlock media width changes after onLoad / Resize presets — observe so hug tracks
    // (skip sole-image: sticky box + CSS contain — observing media caused resize feedback loops)
    if (!isSoleImageBlockHtml(promptContent)) {
      el.querySelectorAll('.tt-image-block-media').forEach((node) =>
        ro.observe(node as HTMLElement)
      )
    }
    const connStrip = el.querySelector(
      '[data-tt-connections-header], [data-tt-notion-hug]'
    ) as HTMLElement | null
    if (connStrip) ro.observe(connStrip)
    const previewCard = el.querySelector('[data-page-preview]') as HTMLElement | null
    if (previewCard) ro.observe(previewCard) // Shaped/locked hug must grow with the in-block preview
    const onDbResize = () => measure()
    el.addEventListener('tt-db-content-resize', onDbResize)
    const mo = new MutationObserver(() => {
      const nextDb = el.querySelector('.tt-notion-db') as HTMLElement | null
      if (nextDb) ro.observe(nextDb)
      if (!isSoleImageBlockHtml(promptContent)) {
        el.querySelectorAll('.tt-image-block-media').forEach((node) =>
          ro.observe(node as HTMLElement)
        )
      }
      const conn = el.querySelector(
        '[data-tt-connections-header], [data-tt-notion-hug]'
      ) as HTMLElement | null
      if (conn) ro.observe(conn)
      const preview = el.querySelector('[data-page-preview]') as HTMLElement | null
      if (preview) ro.observe(preview) // Preview mounts after open — observe so the silhouette expands
      measure()
    })
    mo.observe(el, { childList: true, subtree: true })
    if (dbHost) {
      mo.observe(dbHost, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tt-db-live'] })
    }
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      el.removeEventListener('tt-db-content-resize', onDbResize)
      mo.disconnect()
    }
  }, [isBlock, dragging, promptContent, frameUnlocked, frameTextWrap, frameScale, selected, contentDeferred, notionConnected, pagePreviewOpen])
  // Note: do NOT depend on resizeDimensions — hug writes that and would loop
  // `contentDeferred` is a dep so the frame re-measures the moment real content replaces the shell

  // After frame drag: restore atom HTML only if the editor actually lost atoms.
  // Always force-setContent remounted property NodeViews → hug measured Empty stubs → first-drag collapse.
  const wasDraggingRef = useRef(false)
  const preDragContentRef = useRef<string | null>(null)
  const draggingRef = useRef(!!dragging)
  draggingRef.current = !!dragging
  // promptContentRef already declared above (live HTML for min-width during drag)
  const [dragAtomGuard, setDragAtomGuard] = useState(false)
  // Outer panel px snapshot — atom frames use fit-content and collapse when NodeViews remount on first drag
  const [layoutBoxFreeze, setLayoutBoxFreeze] = useState<{ width: number; height: number } | null>(
    null
  )
  useEffect(() => {
    // Layout freeze is for row cards only — DB tables hug via max-content (zIndex fix covers vanish)
    if (!isBlock || !isRowCardAtomHtml(promptContent)) return
    const panel = panelRef.current
    if (!panel) return
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      // Arm for selected + unselected — selected cards drag via chrome; state alone is too late
      frameDragSuspendRef.current = true
      setDragAtomGuard(true)
      const w = Math.round(panel.offsetWidth)
      const h = Math.round(panel.offsetHeight)
      // Freeze CSS box before select+drag remounts property NodeViews (fit-content → 0)
      if (w > 40 && h > 20) setLayoutBoxFreeze({ width: w, height: h })
    }
    const onUp = () => {
      // RF still owns the gesture — clear only after drag-end restore (below)
      if (draggingRef.current || wasDraggingRef.current) return
      frameDragSuspendRef.current = false
      setDragAtomGuard(false)
      setLayoutBoxFreeze(null)
    }
    panel.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    return () => {
      panel.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
    }
  }, [isBlock, promptContent])

  // Drop a leftover layout freeze if this isn’t a row card (DB must not keep a bloated box)
  useEffect(() => {
    if (!isRowCardAtomHtml(promptContent) && layoutBoxFreeze) setLayoutBoxFreeze(null)
  }, [promptContent, layoutBoxFreeze])

  useEffect(() => {
    if (dragging) {
      if (!wasDraggingRef.current) {
        const msg =
          typeof promptMessage?.content === 'string' ? promptMessage.content : ''
        const live = promptContentRef.current || ''
        const score = (html: string) =>
          (hasFrameAtomHtml(html) ? 100 : 0) + countPropertyBlocks(html)
        // Prefer the richer atom HTML (message can lag behind a fresh convert)
        preDragContentRef.current =
          score(msg) >= score(live) && msg ? msg : live || msg || null
        frameDragSuspendRef.current = true
        setDragAtomGuard(true)
        // Row-card layout freeze only — DB tables must keep hugging the table columns
        if (isRowCardAtomHtml(live) || isRowCardAtomHtml(msg)) {
          const panel = panelRef.current
          if (panel) {
            const w = Math.round(panel.offsetWidth)
            const h = Math.round(panel.offsetHeight)
            if (w > 40 && h > 20) setLayoutBoxFreeze({ width: w, height: h })
          }
        }
      }
      wasDraggingRef.current = true
      return
    }
    if (!wasDraggingRef.current) return
    wasDraggingRef.current = false
    const frozen = preDragContentRef.current
    preDragContentRef.current = null
    hugFreezeUntilRef.current = Date.now() + 450

    const clearFreezeSoon = () => {
      window.setTimeout(() => setLayoutBoxFreeze(null), 450)
    }

    // If TipTap still has the card atoms, do NOT setContent (remount → Empty stubs → hug collapse)
    let editorHtml = ''
    try {
      const ed = promptEditorRef.current
      if (ed && !ed.isDestroyed) editorHtml = ed.getHTML()
    } catch {
      editorHtml = ''
    }
    const expectProps = frozen ? countPropertyBlocks(frozen) : 0
    const editorOk =
      hasFrameAtomHtml(editorHtml) &&
      !isBlockContentEmpty(editorHtml) &&
      (expectProps === 0 || countPropertyBlocks(editorHtml) >= expectProps)
    if (editorOk) {
      if (editorHtml && editorHtml !== promptContentRef.current) {
        setPromptContent(editorHtml)
      }
      frameDragSuspendRef.current = false
      setDragAtomGuard(false)
      clearFreezeSoon()
      return
    }

    const restore =
      (frozen && hasFrameAtomHtml(frozen) ? frozen : null) ||
      (hasFrameAtomHtml(promptContent) ? promptContent : null) ||
      (typeof promptMessage?.content === 'string' && hasFrameAtomHtml(promptMessage.content)
        ? promptMessage.content
        : null)
    if (!restore) {
      frameDragSuspendRef.current = false
      setDragAtomGuard(false)
      clearFreezeSoon()
      return
    }
    if (restore !== promptContent) setPromptContent(restore)
    // Keep suspend until force-sync applies, then clear
    const t = window.setTimeout(() => {
      setAiForceSyncKey((k) => k + 1)
      frameDragSuspendRef.current = false
      setDragAtomGuard(false)
      clearFreezeSoon()
    }, 0)
    return () => window.clearTimeout(t)
  }, [dragging, promptContent, promptMessage?.content])

  // Push cached outer box to RF while TipTap is deferred (threads/minimap need real geometry).
  useEffect(() => {
    if (!contentDeferred || !deferredLayoutBox || !isBlock) return
    const setNodesFunc = getSetNodes()
    if (!setNodesFunc) return
    setNodesFunc((nodes: any[]) => {
      const node = nodes.find((n: any) => n.id === id)
      if (!node) return nodes
      const styleW =
        typeof node.style?.width === 'number' ? node.style.width : parseFloat(node.style?.width)
      const styleH =
        typeof node.style?.height === 'number' ? node.style.height : parseFloat(node.style?.height)
      if (
        Number.isFinite(styleW) &&
        Number.isFinite(styleH) &&
        Math.abs(styleW - deferredLayoutBox.width) <= 1 &&
        Math.abs(styleH - deferredLayoutBox.height) <= 1
      ) {
        return nodes
      }
      return nodes.map((n: any) =>
        n.id === id
          ? {
              ...n,
              width: deferredLayoutBox.width,
              height: deferredLayoutBox.height,
              style: { ...n.style, width: deferredLayoutBox.width, height: deferredLayoutBox.height },
            }
          : n
      )
    })
  }, [contentDeferred, deferredLayoutBox, isBlock, id, getSetNodes])

  useEffect(() => {
    if (!contentDeferred || !deferredBox || intrinsicMeasured) return
    setIntrinsicSize({
      width: Math.max(BLOCK_LOCKED_MIN_W, deferredBox.width - BLOCK_FRAME_PAD_X * 2),
      height: Math.max(BLOCK_MIN_FRAME_H, deferredBox.height - BLOCK_FRAME_PAD_Y * 2),
    })
  }, [contentDeferred, deferredBox, intrinsicMeasured])

  // Regular chat panels are those that are not flashcards and not notes
  const isRegularChatPanel = !isFlashcard && !isBlock

  // Explicit box → RF node style. NEVER drive this from ResizeObserver: RF also writes measured
  // node.width/height, so RO→setNodes fights those numbers and allocates a new nodes[] every tick.
  // Push when resizeDimensions or rotation (AABB) change.
  // Rotated: RF size = upright AABB so blue adjust chrome tracks live; left edge stays locked.
  // Snap mates repark against that AABB so side-stacks ride rotation (not only the blue box).
  const lastPushedBoxRef = useRef<{ w: number; h: number; rot: number } | null>(null)
  const resizeDimensionsRef = useRef(resizeDimensions)
  resizeDimensionsRef.current = resizeDimensions
  const frameShapeRef = useRef(frameShape)
  frameShapeRef.current = frameShape
  // Locked fit-to-text: live hug (stamped each render) so RF selection can't stay taller than peach fill
  const liveLockedContentRef = useRef<{ width: number; height: number } | null>(null)

  /** Push host AABB + repark snap/stack mates for `rot` (live rotate + effect). */
  const pushAabbAndSnapMates = useCallback(
    (rot: number, opts?: { forceMates?: boolean }) => {
      // Prefer live hug over stale resizeDimensions (place/seed often left height at FRAME_RESIZE_MIN)
      const dims = liveLockedContentRef.current ?? resizeDimensionsRef.current
      if (!isBlock || !dims) return
      // Selected L/R chrome is outside the fill — RF box must include it or handles sit inset of the blue ring
      const chromeX = adjustChromeXRef.current * 2
      // Prefer painted panel box when upright + locked hug — estimates drifted from peach (blue>peach gap)
      const panel = panelRef.current
      const usePainted =
        !!panel && !!liveLockedContentRef.current && Math.abs(rot) <= 0.5 && !opts?.forceMates
      const aabb = usePainted
        ? { width: panel.offsetWidth, height: panel.offsetHeight }
        : Math.abs(rot) > 0.5
          ? // Inflate unrotated width by chrome so ⋮⋮ overhang stays inside the upright AABB
            rotatedFrameAabbSize(dims.width + chromeX, dims.height, rot, frameShapeRef.current)
          : {
              width: dims.width + chromeX,
              height:
                dims.height +
                adjustChromeYTopRef.current +
                adjustChromeYBottomRef.current,
            }
      const boxW = Math.round(aabb.width)
      const boxH = Math.round(aabb.height)
      const prev = lastPushedBoxRef.current
      const sizeSame =
        !!prev && Math.abs(prev.w - boxW) <= 1 && Math.abs(prev.h - boxH) <= 1
      const rotSame = !!prev && Math.abs(prev.rot - rot) < 0.05
      // Skip only when AABB + angle unchanged (mates already parked for this box)
      if (sizeSame && rotSame && !opts?.forceMates) return
      lastPushedBoxRef.current = { w: boxW, h: boxH, rot }
      // Keep the panel DOM in sync (defeats stale inline widths from line-grow helpers)
      if (panelRef.current && Math.abs(rot) > 0.5) {
        panelRef.current.style.width = `${boxW}px`
        panelRef.current.style.height = `${boxH}px`
        panelRef.current.style.maxWidth = `${boxW}px`
        panelRef.current.style.maxHeight = `${boxH}px`
      }
      const setNodesFunc = getSetNodes()
      if (!setNodesFunc) return
      setNodesFunc((nodes: any[]) => {
        let changed = false
        let next = nodes.map((node: any) => {
          if (node.id !== id) return node
          const styleW =
            typeof node.style?.width === 'number' ? node.style.width : parseFloat(node.style?.width)
          const styleH =
            typeof node.style?.height === 'number'
              ? node.style.height
              : parseFloat(node.style?.height)
          // Compare intended style only — ignore RF measured node.width (drifts vs border-box)
          const styleOk =
            Number.isFinite(styleW) &&
            Number.isFinite(styleH) &&
            Math.abs(styleW - boxW) <= 1 &&
            Math.abs(styleH - boxH) <= 1
          if (styleOk) return node
          changed = true
          // Left-locked: do not shift position.x when AABB width grows/shrinks with rotation
          return {
            ...node,
            width: boxW,
            height: boxH,
            style: { ...node.style, width: boxW, height: boxH },
          }
        })
        // Keep snap/stack mates flush to the new upright AABB (live while rotating)
        const withMates = applySnapMateRelayout(next, id, { width: boxW, height: boxH })
        if (withMates !== next) {
          changed = true
          next = withMates
        }
        return changed ? next : nodes
      })
      updateNodeInternals(id) // Remeasure resize chrome to the new AABB
    },
    [isBlock, id, getSetNodes, updateNodeInternals]
  )

  // Paint frame + RF adjust box on the pointer tick (not the later rAF React commit)
  applyLiveAdjustBoxRef.current = (contentW: number, contentH: number, outerAlready = false) => {
    const rot = rotationRef.current // Live angle — AABB when rotated
    const chromeX = adjustChromeXRef.current // L/R gutter already in the RF outer box
    const yTop = adjustChromeYTopRef.current // Selected property band
    const yBottom = adjustChromeYBottomRef.current // Selected connections band
    // Unlocked upright: NodeResizeControl params already are the RF outer box — don't add chrome again
    const aabb = outerAlready
      ? { width: contentW, height: contentH }
      : Math.abs(rot) > 0.5
        ? rotatedFrameAabbSize(contentW + chromeX * 2, contentH, rot, frameShapeRef.current)
        : { width: contentW + chromeX * 2, height: contentH + yTop + yBottom }
    const boxW = Math.round(aabb.width) // RF + panel outer (fill + chrome)
    const boxH = Math.round(aabb.height)
    lastPushedBoxRef.current = { w: boxW, h: boxH, rot } // Skip the post-setState pushAabb echo
    const panel = panelRef.current
    if (panel) {
      panel.style.width = `${boxW}px` // Peach + painted ring follow the drag now
      panel.style.height = `${boxH}px`
      panel.style.minWidth = `${boxW}px`
      panel.style.minHeight = `${boxH}px`
      panel.style.maxWidth = `${boxW}px`
      panel.style.maxHeight = `${boxH}px`
    }
    const setNodesFunc = getSetNodes()
    if (!setNodesFunc) return
    setNodesFunc((nodes: any[]) => {
      let changed = false
      const next = nodes.map((node: any) => {
        if (node.id !== id) return node
        const styleW =
          typeof node.style?.width === 'number' ? node.style.width : parseFloat(node.style?.width)
        const styleH =
          typeof node.style?.height === 'number'
            ? node.style.height
            : parseFloat(node.style?.height)
        if (
          Number.isFinite(styleW) &&
          Number.isFinite(styleH) &&
          Math.abs(styleW - boxW) <= 0.5 &&
          Math.abs(styleH - boxH) <= 0.5
        ) {
          return node // RF already at this adjust box
        }
        changed = true
        return {
          ...node,
          width: boxW,
          height: boxH,
          style: { ...node.style, width: boxW, height: boxH },
        }
      })
      return changed ? next : nodes
    })
  }

  useEffect(() => {
    if (!isBlock || !isUserResized || !resizeDimensions) {
      if (!isUserResized) lastPushedBoxRef.current = null // Next resize must push fresh
      return
    }
    // Skip effect while pointer-rotating / adjusting — those gestures push AABB every tick
    if (isRotatingRef.current || isResizingRef.current || wrapLineDraggingRef.current) return // Wrap-line drag owns the box via applyLiveAdjustBox
    pushAabbAndSnapMates(rotation)
  }, [
    isBlock,
    isUserResized,
    resizeDimensions?.width,
    resizeDimensions?.height,
    // Re-push when measure/scale changes even before hug writes resizeDimensions (clears bottom gap)
    intrinsicSize.width,
    intrinsicSize.height,
    frameScale,
    frameUnlocked,
    rotation,
    frameShape,
    adjustChromeX, // Live L/R pad — RF outer box must include chrome as zoom changes
    adjustChromeYTop, // Wrapped property rows grow the top gap
    pushAabbAndSnapMates,
  ])

  // Unresized (max-content) frames: remasure handles via updateNodeInternals — never setNodes style.
  const lastSyncedNodeSizeRef = useRef<{ w: number; h: number } | null>(null)
  const syncRafRef = useRef<number | null>(null)
  const syncStormRef = useRef({ n: 0, t: 0 })
  const clearedAutoSizeStyleRef = useRef<string | null>(null)
  const wasUserResizedForStripRef = useRef(isUserResized) // Edge-detect leave-resized → allow one strip
  useEffect(() => {
    if (!isBlock || !panelRef.current || !isInitialShrinkComplete) return
    if (isUserResized) {
      wasUserResizedForStripRef.current = true // Remember explicit-box mode; strip only after leaving it
      return // Explicit box path owns RF size above
    }
    // Cold/deferred frames need RF style from deferredLayoutBox. Stripping here races that
    // effect (apply ↔ strip setNodes) and nests updates until React hits max update depth —
    // Notion Add page tree mounts many deferred boardLinks at once and tripped this.
    if (contentDeferred) return
    // Left explicit-box (unlock→relock / heal) — allow one strip of leftover style.width/height
    if (wasUserResizedForStripRef.current) {
      clearedAutoSizeStyleRef.current = null
      wasUserResizedForStripRef.current = false
    }
    const el = panelRef.current
    lastSyncedNodeSizeRef.current = null
    syncStormRef.current = { n: 0, t: Date.now() }

    // One-shot: strip leftover style.width/height so max-content can own size
    if (clearedAutoSizeStyleRef.current !== id) {
      clearedAutoSizeStyleRef.current = id
      const setNodesFunc = getSetNodes()
      if (setNodesFunc) {
        setNodesFunc((nodes: any[]) => {
          let changed = false
          const next = nodes.map((node: any) => {
            if (node.id !== id) return node
            const hasStyleW = node.style?.width != null && node.style?.width !== ''
            const hasStyleH = node.style?.height != null && node.style?.height !== ''
            if (!hasStyleW && !hasStyleH) return node
            changed = true
            const style = { ...(node.style || {}) }
            delete style.width
            delete style.height
            return { ...node, style, width: undefined, height: undefined }
          })
          return changed ? next : nodes
        })
      }
    }

    const syncNodeSize = () => {
      if (isResizingRef.current || !el) return
      const width = Math.ceil(el.offsetWidth)
      const height = Math.ceil(el.offsetHeight)
      if (width <= 0 || height <= 0) return
      const prev = lastSyncedNodeSizeRef.current
      if (prev && Math.abs(prev.w - width) <= 1 && Math.abs(prev.h - height) <= 1) return
      const now = Date.now()
      if (now - syncStormRef.current.t > 1000) syncStormRef.current = { n: 0, t: now }
      syncStormRef.current.n += 1
      if (syncStormRef.current.n > 20) return // Circuit breaker
      lastSyncedNodeSizeRef.current = { w: width, h: height }
      updateNodeInternals(id) // Remeasure only — never setNodes
    }

    const schedule = () => {
      if (syncRafRef.current != null) cancelAnimationFrame(syncRafRef.current)
      syncRafRef.current = requestAnimationFrame(() => {
        syncRafRef.current = null
        syncNodeSize()
      })
    }

    schedule()
    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    return () => {
      ro.disconnect()
      if (syncRafRef.current != null) cancelAnimationFrame(syncRafRef.current)
    }
  }, [
    isBlock,
    id,
    getSetNodes,
    isInitialShrinkComplete,
    isUserResized,
    contentDeferred,
    updateNodeInternals,
  ])

  // Persist frame lock / scale / box size (resize end + lock toggle + overflow expand)
  const persistFrameMeta = useCallback(async (patch: Record<string, unknown>) => {
    if (isProjectBoard || !promptMessage) return // Nothing to persist on project boards
    const { data: message, error: fetchError } = await supabase
      .from('messages')
      .select('metadata')
      .eq('id', promptMessage.id)
      .single()
    if (fetchError) {
      console.error('Error fetching message for frame save:', fetchError)
      return
    }
    const existingMetadata = (message?.metadata as Record<string, any>) || {}
    const { error: updateError } = await supabase
      .from('messages')
      .update({ metadata: { ...existingMetadata, ...patch } })
      .eq('id', promptMessage.id)
    if (updateError) console.error('Error saving frame metadata:', updateError)
  }, [isProjectBoard, promptMessage, supabase])
  const persistFrameMetaRef = useRef(persistFrameMeta) // Stable resize-end persist — don't rebind d3-drag
  persistFrameMetaRef.current = persistFrameMeta // Always the latest saver
  const selectedRef = useRef(selected) // Group reactions toggle reads selection without resubscribing
  selectedRef.current = selected

  // Publish painted geometry and apply group resize / rotate / reactions from the shared box.
  useEffect(() => {
    publishLiveGroupGeom(id, {
      frameScale, // Locked scale the group multiplies
      rotation, // Content angle the group adds to
      unlocked: frameUnlocked, // Explicit box vs fit-to-text
      contentW: resizeDimensions?.width ?? 0, // Fill width, 0 until measured
      contentH: resizeDimensions?.height ?? 0,
    })
    return () => clearLiveGroupGeom(id) // Unmount must not leave a stale box
  }, [id, frameScale, rotation, frameUnlocked, resizeDimensions])

  useEffect(() => {
    const onTransform = (event: Event) => {
      const detail = (event as CustomEvent<GroupTransformDetail>).detail // Group box gesture
      if (!detail?.patches) return
      const patch = detail.patches.find((item) => item.id === id)
      if (!patch) return // Another frame
      if (detail.phase === 'start') {
        if (detail.kind === 'resize') isResizingRef.current = true // Hug must not fight the scale
        if (detail.kind === 'rotate') isRotatingRef.current = true // AABB push waits until release
        return
      }
      if (patch.rotation != null) setRotation(patch.rotation) // Paint the new angle
      if (patch.frameScale != null) {
        frameScaleRef.current = patch.frameScale // Resize-end reads the ref, not the previous render
        setFrameScale(patch.frameScale)
      }
      if (patch.unlocked && patch.content) {
        setIsUserResized(true) // Explicit box wins over fit-to-text hug
        setResizeDimensions(patch.content) // Fill size
        const panel = panelRef.current
        if (panel) {
          panel.style.width = `${patch.width}px` // Outer box tracks the group scale immediately
          panel.style.height = `${patch.height}px`
          panel.style.minWidth = `${patch.width}px`
          panel.style.minHeight = `${patch.height}px`
          panel.style.maxWidth = `${patch.width}px`
          panel.style.maxHeight = `${patch.height}px`
        }
      }
      if (detail.phase === 'end') {
        isResizingRef.current = false // Allow hug / AABB sync again
        isRotatingRef.current = false
        const scale = frameScaleRef.current
        const rot = patch.rotation ?? rotationRef.current
        const dims = resizeDimensionsRef.current
        void persistFrameMetaRef.current({
          frameScale: scale,
          rotation: rot,
          ...(frameUnlockedRef.current && dims ? { resizeDimensions: dims, frameUnlocked: true } : {}),
        })
        if (detail.kind === 'rotate') pushAabbAndSnapMates(rot, { forceMates: true }) // Grow the upright box around the new angle
      }
    }
    const onComments = () => {
      if (!selectedRef.current) return // Only frames in the selection
      setShowComments((prev) => {
        if (prev) {
          queueMicrotask(() => {
            setSelectedCommentId(null) // Close highlight with the panel
            setNewCommentData(null)
            setNewCommentText('')
          })
        }
        return !prev
      })
    }
    window.addEventListener(GROUP_TRANSFORM_EVENT, onTransform)
    window.addEventListener(GROUP_COMMENTS_EVENT, onComments)
    return () => {
      window.removeEventListener(GROUP_TRANSFORM_EVENT, onTransform)
      window.removeEventListener(GROUP_COMMENTS_EVENT, onComments)
    }
  }, [id, pushAabbAndSnapMates])

  const notionPageSyncTarget = notionPageBodySyncTarget(
    promptMessage?.metadata as Record<string, unknown> | undefined
  )
  const notionLastEditedTime =
    typeof (promptMessage?.metadata as Record<string, unknown> | undefined)?.notionLastEditedTime ===
    'string'
      ? ((promptMessage?.metadata as Record<string, unknown>).notionLastEditedTime as string)
      : null

  const handleNotionUpdatesAvailable = useCallback(
    (payload: { lastEditedTime: string }) => {
      const patch = {
        notionUpdatesPending: true,
        notionRemoteLastEditedTime: payload.lastEditedTime,
      }
      if (promptMessage?.id && conversationId) {
        patchBoardMessageMetadata(queryClient, conversationId, promptMessage.id, patch)
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== id || !n.data?.promptMessage) return n
            const pm = n.data.promptMessage as { metadata?: Record<string, unknown> }
            return {
              ...n,
              data: {
                ...n.data,
                promptMessage: {
                  ...pm,
                  metadata: { ...(pm.metadata || {}), ...patch },
                },
              },
            }
          })
        )
      }
      void persistFrameMeta(patch)
    },
    [persistFrameMeta, promptMessage?.id, conversationId, queryClient, setNodes, id]
  )

  const handleNotionLastEditedTime = useCallback(
    (iso: string) => {
      const patch = { notionLastEditedTime: iso, notionUpdatesPending: false }
      if (promptMessage?.id && conversationId) {
        patchBoardMessageMetadata(queryClient, conversationId, promptMessage.id, patch)
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id !== id || !n.data?.promptMessage) return n
            const pm = n.data.promptMessage as { metadata?: Record<string, unknown> }
            return {
              ...n,
              data: {
                ...n.data,
                promptMessage: {
                  ...pm,
                  metadata: { ...(pm.metadata || {}), ...patch },
                },
              },
            }
          })
        )
      }
      void persistFrameMeta(patch)
    },
    [persistFrameMeta, promptMessage?.id, conversationId, queryClient, setNodes, id]
  )

  const { schedulePush: scheduleNotionPagePush } = useNotionPageBodySync({
    pageId: notionPageSyncTarget?.pageId ?? null,
    lastEditedTime: notionLastEditedTime,
    // Seed so TipTap remount/normalize after import does not immediately wipe Notion
    initialHtml: notionPageSyncTarget ? promptContent : null,
    onNotionUpdatesAvailable: handleNotionUpdatesAvailable,
    onLastEditedTime: handleNotionLastEditedTime,
  })

  // Register TipTap editor for Keep non red (reject selected red highlights)
  useEffect(() => {
    const mid = promptMessage?.id
    if (!mid) return
    const edit = pendingForMessage(mid)
    if (!edit || edit.source !== 'notion') return
    const ed = promptEditorRef.current
    if (!ed || ed.isDestroyed) return
    return registerNotionSyncEditor(mid, ed)
  }, [
    promptMessage?.id,
    pendingForMessage,
    promptContent,
    aiForceSyncKey,
  ])

  // Manual sync applied Notion HTML into this frame — force TipTap + RF node data to match
  useEffect(() => {
    if (!promptMessage?.id || !conversationId) return
    const onApplied = (event: Event) => {
      const detail = (event as CustomEvent<{
        conversationId?: string
        contentUpdates?: Array<{ messageId: string; content: string }>
      }>).detail
      if (detail?.conversationId && detail.conversationId !== conversationId) return
      const hit = detail?.contentUpdates?.find((u) => u.messageId === promptMessage.id)
      if (!hit) return
      setPromptContent(hit.content)
      setPromptHasChanges(false)
      setAiForceSyncKey((k) => k + 1) // setContent even if caret is in the frame
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id || !n.data?.promptMessage) return n
          const pm = n.data.promptMessage as {
            content?: string
            metadata?: Record<string, unknown>
          }
          return {
            ...n,
            data: {
              ...n.data,
              promptMessage: {
                ...pm,
                content: hit.content,
                metadata: {
                  ...(pm.metadata || {}),
                  notionUpdatesPending: false,
                },
              },
            },
          }
        })
      )
    }
    window.addEventListener('notion-pages-applied', onApplied)
    return () => window.removeEventListener('notion-pages-applied', onApplied)
  }, [promptMessage?.id, conversationId, setNodes, id])

  // Paint the latest corner-drag sample (one React update per frame, not per touchmove)
  const flushPendingResize = useCallback(() => {
    resizeRafRef.current = null // This rAF has run
    const pending = pendingResizeRef.current // Last sample from d3-drag
    if (!pending) return // Nothing queued (end already applied)
    pendingResizeRef.current = null // Don't flush twice
    if (pending.scale != null) setFrameScale(pending.scale) // Locked proportional content scale
    setResizeDimensions({ width: pending.width, height: pending.height }) // Drive panel box
  }, [])

  // Heal: post-drag hug can persist ~52×40 on a databaseBlock frame (NodeView remount stub).
  // Clear the clip box + relock so the table can hug open again. Re-runs if it collapses again.
  useEffect(() => {
    if (!isBlock) return
    const fromLoadFlag = needsCollapsedDbFrameHealRef.current
    const fromLiveDims =
      !!resizeDimensions &&
      hasDatabaseBlockHtml(promptContent) &&
      isCollapsedDatabaseFrameSize(resizeDimensions.width, resizeDimensions.height)
    if (!fromLoadFlag && !fromLiveDims) return
    needsCollapsedDbFrameHealRef.current = false
    setFrameUnlocked(false)
    setResizeDimensions(null)
    setIsUserResized(false)
    setUnlockedFrameSize(null)
    void persistFrameMeta({
      frameUnlocked: false,
      frameScale: 1,
      resizeDimensions: null,
      unlockedFrameSize: null,
      unlockedFrameScale: null,
    })
  }, [isBlock, promptContent, resizeDimensions, persistFrameMeta])

  // Identity MUST stay stable: NodeResizeControl's d3-drag effect rebinds when onResize*
  // changes, and teardown drops element touchmove (phone) while window mouse listeners survive.
  const handleResizeStart = useCallback(() => {
    isResizingRef.current = true // Block hug observer from fighting live resize
    setFrameResizing(true) // Hide wrap line while the box is being dragged
    liveResizeBoxRef.current = null // First onResize sample owns the live box
    if (resizeRafRef.current != null) cancelAnimationFrame(resizeRafRef.current) // Drop a stale paint
    resizeRafRef.current = null
    pendingResizeRef.current = null // Fresh gesture — don't flush a previous drag
    setIsUserResized(true) // Switch from line-grow to explicit frame box
    const dims = resizeDimensionsRef.current // Live box without putting it in callback deps
    const startW = dims?.width ?? panelRef.current?.offsetWidth ?? 200
    const startH = dims?.height ?? panelRef.current?.offsetHeight ?? 40
    lockedResizeStartRef.current = { width: startW, height: startH, scale: frameScaleRef.current } // Locked proportional baseline
  }, [])

  // Handle resize end - clear resizing flag and persist explicit box size from final params
  const handleResizeEnd = useCallback(async (_event: any, params?: { width: number; height: number }) => {
    if (resizeRafRef.current != null) cancelAnimationFrame(resizeRafRef.current) // Apply final size now, not next frame
    resizeRafRef.current = null
    pendingResizeRef.current = null // Don't let a queued sample overwrite the commit
    liveResizeBoxRef.current = null // End render uses committed resizeDimensions
    isResizingRef.current = false // Allow size-sync observer again
    setFrameResizing(false) // Show wrap line again after resize ends
    isFirstResizeCallRef.current = true // Reset first-call bookkeeping
    setIsUserResized(true) // Persist mode: explicit frame box
    lockedResizeStartRef.current = null // Drop drag baseline

    const dims = resizeDimensionsRef.current
    const rot = rotationRef.current
    const unlocked = frameUnlockedRef.current
    const wrapping = frameTextWrapRef.current
    const colW = wrapColWidthRef.current
    const intrinsic = intrinsicSizeRef.current
    const soleImageEnd = isSoleImageBlockHtml(promptContentRef.current || '')
    const fillMinEnd =
      unlocked && !soleImageEnd ? freeContentMinRef.current : { width: FRAME_RESIZE_MIN, height: FRAME_RESIZE_MIN } // Same content floor as fit-to-text
    const uprightFreeEnd = unlocked && Math.abs(rot) <= 0.5
    const minWEnd = uprightFreeEnd ? fillMinEnd.width + adjustChromeXRef.current * 2 : fillMinEnd.width
    const minHEnd = uprightFreeEnd
      ? fillMinEnd.height + adjustChromeYTopRef.current + adjustChromeYBottomRef.current
      : fillMinEnd.height
    let width = Math.max(params?.width ?? dims?.width ?? 0, minWEnd) // Free: not smaller than fit-to-text’s content mins
    let height = Math.max(params?.height ?? dims?.height ?? 0, minHEnd)
    // RF end params are AABB when rotated — store unrotated content size
    if (Math.abs(rot) > 0.5 && params?.width && params?.height) {
      const fallback = dims || { width, height }
      const content = contentSizeFromAabb(params.width, params.height, rot, fallback)
      width = Math.max(content.width, fillMinEnd.width)
      height = Math.max(content.height, fillMinEnd.height)
    }
    const finalScale = frameScaleRef.current // Latest scale from the drag (avoid stale closure)
    const safeScale = Math.max(FRAME_SCALE_EPSILON, finalScale) // Epsilon only — no 0.15 shrink floor
    let colToPersist: number | undefined // New wrap column width to store (unlocked-wrap resize sets the point)
    const soleImage = soleImageEnd // Same image check as the content-min floor
    if (soleImage) {
      // Keep dragged box — contain-fit fills it; never snap to intrinsic×scale
    } else if (!unlocked && wrapping) {
      // Locked wrap: hug WIDTH to the scaled FIXED columns (no reflow) + HEIGHT to wrapped content.
      // No +2 border — selected adjust chrome uses borderWidth 0 (same as scaledFrameSize).
      if (colW != null) width = Math.round(colW * safeScale) // Column × scale — same as render hug, so the wrap line doesn't jump on release
      height = Math.max(1, Math.ceil(intrinsic.height * safeScale))
    } else if (!unlocked) {
      const hugged = hugLockedFrameSize(intrinsic, finalScale, 1, frameShapeRef.current) // Nowrap: snap to scaled text — no 40px empty pad
      width = hugged.width
      height = hugged.height
    }
    // Unlocked upright: RF params are the outer adjust box — persist the fill, don't add chrome again.
    const unlockedUprightEnd = unlocked && Math.abs(rot) <= 0.5
    const chromeXEnd = adjustChromeXRef.current * 2
    const persistW = unlockedUprightEnd
      ? Math.max(fillMinEnd.width, Math.ceil(width - chromeXEnd)) // Ceil — same as scaledFrameSize, no sub-hug clip
      : width
    const persistH = unlockedUprightEnd
      ? Math.max(
          fillMinEnd.height,
          Math.round((height - adjustChromeYTopRef.current - adjustChromeYBottomRef.current) * 100) / 100
        )
      : height
    if (unlocked && wrapping && colW == null) {
      colToPersist = Math.max(1, Math.round(intrinsic.width)) // First wrap persist: seed the line, never the free box
      setWrapColWidth(colToPersist)
    }
    if (persistW > 0 && persistH > 0) {
      setResizeDimensions({ width: persistW, height: persistH }) // Fill box the contain-fit uses
      applyLiveAdjustBoxRef.current(width, height, unlockedUprightEnd) // Outer already when upright free
    }
    // Unlocked drag refreshes the last free-resize shape (restored on unlock after fit-to-text).
    if (unlocked) {
      setUnlockedFrameSize({ width: persistW, height: persistH })
      setUnlockedFrameScale(finalScale)
    } else if (soleImage) {
      // Fit-mode corner drag is the size free→fit must return to
      imageFitSizeRef.current = { width, height }
    }
    await persistFrameMetaRef.current({
      resizeDimensions: { width: persistW, height: persistH },
      frameUnlocked: unlocked,
      frameTextWrap: wrapping, // Wrap persists in either lock state now
      frameScale: finalScale,
      fontScale: fontScaleRef.current,
      ...(unlocked ? { unlockedFrameSize: { width: persistW, height: persistH }, unlockedFrameScale: finalScale } : {}),
      ...(soleImage && !unlocked ? { imageFitSize: { width, height } } : {}),
      ...(colToPersist != null ? { wrapColWidth: colToPersist } : {}), // Save the new unlocked wrap point
    })
  }, [])

  // Corner-drag: locked → proportional content scale; unlocked → free box + contain-fit
  // When rotated, RF reports AABB size — convert back to unrotated content size.
  const handleResize = useCallback((_event: any, params: { width: number; height: number }) => {
    if (!isResizingRef.current) return // Ignore mount/select noise — only after handleResizeStart
    const fallback = resizeDimensionsRef.current || lockedResizeStartRef.current || {
      width: FRAME_RESIZE_MIN,
      height: FRAME_RESIZE_MIN,
    }
    const soleImage = isSoleImageBlockHtml(promptContentRef.current || '') // Images keep the 40px floor
    const unlocked = frameUnlockedRef.current
    const fillMin =
      unlocked && !soleImage ? freeContentMinRef.current : { width: FRAME_RESIZE_MIN, height: FRAME_RESIZE_MIN } // Live content hug
    const rot = rotationRef.current
    const uprightFree = unlocked && Math.abs(rot) <= 0.5 // RF params are the outer box
    const minW = uprightFree ? fillMin.width + adjustChromeXRef.current * 2 : fillMin.width // Outer min includes L/R chrome
    const minH = uprightFree
      ? fillMin.height + adjustChromeYTopRef.current + adjustChromeYBottomRef.current
      : fillMin.height
    let width = Math.max(params.width, minW) // Free: shrink stops on the content box; grow is free
    let height = Math.max(params.height, minH)
    if (Math.abs(rot) > 0.5) {
      const content = contentSizeFromAabb(width, height, rot, fallback)
      width = Math.max(content.width, fillMin.width) // Unrotated fill min
      height = Math.max(content.height, fillMin.height)
    }
    let nextScale: number | undefined
    // Sole image: sticky box + CSS contain — never hug-to-intrinsic × frameScale (overflow + RO storms)
    if (!soleImage && !frameUnlockedRef.current && lockedResizeStartRef.current) {
      // Locked (wrap OR nowrap): proportional content scale — width/text scale together.
      const start = lockedResizeStartRef.current
      const ratio = width / Math.max(1, start.width) // keepAspectRatio → width tracks height
      nextScale = Math.max(FRAME_SCALE_EPSILON, start.scale * ratio) // No 0.15 floor — match unbounded grow
      const colW = wrapColWidthRef.current
      if (frameTextWrapRef.current && colW != null) {
        // Locked WRAP: derive the box from the FIXED column width × scale so NO character reflows —
        // the wrapped text just scales up/down (columns stay constant; no phantom border).
        width = Math.round(colW * nextScale) // Peach hugs the column — matches render hug
        height = Math.max(1, Math.round(intrinsicSizeRef.current.height * nextScale))
      } else {
        // Locked nowrap: hug the blue box to scaled content during the gesture (same as resize-end).
        // Using RF's raw drag size left a larger empty frame with the block stuck top-left so
        // connection/resize chrome no longer lined up with the ⋮⋮.
        const hugged = hugLockedFrameSize(intrinsicSizeRef.current, nextScale, 1, frameShapeRef.current)
        width = hugged.width
        height = hugged.height
      }
    }
    const unlockedUpright = frameUnlockedRef.current && Math.abs(rot) <= 0.5 // RF params are the outer box
    const contentW = unlockedUpright
      ? Math.max(fillMin.width, width - adjustChromeXRef.current * 2) // Strip chrome after the floor — same hug as fit-to-text
      : width
    const contentH = unlockedUpright
      ? Math.max(fillMin.height, height - adjustChromeYTopRef.current - adjustChromeYBottomRef.current)
      : height
    pendingResizeRef.current = { width: contentW, height: contentH, scale: nextScale } // Latest sample wins
    liveResizeBoxRef.current = { width: contentW, height: contentH, scale: nextScale } // Render reads this before rAF setState
    if (nextScale != null) frameScaleRef.current = nextScale // Keep ratio math + CSS on this sample
    resizeDimensionsRef.current = { width: contentW, height: contentH } // Other live readers (pushAabb) see this tick
    applyLiveAdjustBoxRef.current(unlockedUpright ? width : contentW, unlockedUpright ? height : contentH, unlockedUpright)
    const spacer = contentFitRef.current?.parentElement // Flex box that parks the wrap column
    const fill = wrapLineFillRef.current // Fill shell — spacer sits in here, not the chrome
    if (spacer && spacer !== fill) {
      const lockedWrapSpacer =
        !frameUnlockedRef.current && frameTextWrapRef.current && wrapColWidthRef.current != null // Fit wrap: spacer = the column
      const spacerW = lockedWrapSpacer
        ? Math.ceil(wrapColWidthRef.current! * (nextScale ?? frameScaleRef.current)) // Same as render scaledLayoutW — React won’t rewrite an equal value on release
        : contentW
      spacer.style.width = `${spacerW}px` // Same-tick as the panel — do not wait for rAF
      spacer.style.height = `${contentH}px` // Center/right flex must see the new box this pointer
      spacer.style.minWidth = `${spacerW}px` // Defeat a stale min from the last React commit
      spacer.style.minHeight = `${contentH}px` // Same for height so top/bottom align cannot lag
    }
    if (contentFitRef.current) {
      const baseScale = nextScale ?? frameScaleRef.current // Lock uses the new ratio; free keeps place-scale
      const wrapping = frameUnlockedRef.current && frameTextWrapRef.current // Free wrap — reflow down, never past fit-to-text
      const fitCol = wrapColWidthRef.current ?? intrinsicSizeRef.current.width // Fit-to-text unscaled column
      const visualW = wrapping
        ? Math.max(1, fitCol * baseScale) // Contain against the fit wrap, not the larger free box
        : Math.max(1, intrinsicSizeRef.current.width * baseScale) // Nowrap: natural painted width
      const visualH = Math.max(
        1,
        (wrapping ? (wrapContainHRef.current ?? intrinsicSizeRef.current.height) : intrinsicSizeRef.current.height) *
          baseScale
      ) // Wrap: frozen stack height; nowrap: natural painted height
      const fitLive = contentFitBoxRef.current // Grey fit-line box — contain to it, not the whole fill
      const contain = frameUnlockedRef.current
        ? freeContentFitScale(
            fitLive ? Math.min(fitLive.width, contentW) : contentW,
            fitLive ? Math.min(fitLive.height, contentH) : contentH,
            visualW,
            visualH,
            undefined,
            !!fitLive // Plus box may grow content past the last fit-to-text size
          ) // Shrink/grow to the plus box (or contain to the fill when they sit on the edge)
        : 1
      const paint = baseScale * contain // Same formula as render paintScale
      contentFitRef.current.style.transform =
        Math.abs(paint - 1) > FRAME_SCALE_EPSILON ? `scale(${paint})` : '' // Drop scale when at natural
      const freeNowrap = frameUnlockedRef.current && !frameTextWrapRef.current // Align box = fill, not a wrap column
      const lockedWrap = !frameUnlockedRef.current && frameTextWrapRef.current && wrapColWidthRef.current != null // Fit wrap parks the column by align
      contentFitRef.current.style.transformOrigin = frameUnlockedRef.current
        ? 'center center' // Free (any align): centered spacer + center origin keeps the box on the fill mid-drag
        : lockedWrap && frameAlignXRef.current === 'right'
            ? 'top right' // Pairs with the flex-end spacer
            : lockedWrap && frameAlignXRef.current === 'center'
              ? 'top center'
              : 'top left' // Lock / free center-right scale from the fill origin
      if (wrapping) {
        const col = Math.max(1, wrapColWidthRef.current ?? fitCol) // Line-owned column — resize must not reflow wrap
        contentFitRef.current.style.width = `${col}px` // Live wrap column
        contentFitRef.current.style.maxWidth = `${col}px` // Match render wrapContentWidth
      } else if (freeNowrap && frameAlignXRef.current !== 'left') {
        const col = Math.max(1, contentW / paint) // Center/right: unscaled fill so text-align can park
        contentFitRef.current.style.width = `${col}px`
        contentFitRef.current.style.maxWidth = `${col}px`
      } else if (freeNowrap) {
        contentFitRef.current.style.width = '' // Left: drop the fill-wide box — hug the widest block
        contentFitRef.current.style.maxWidth = '' // Let w-max + flex center the column
      }
    }
    if (resizeRafRef.current == null) {
      resizeRafRef.current = requestAnimationFrame(flushPendingResize) // One React paint per frame
    }
  }, [flushPendingResize])

  // Persist item rotation degrees into message metadata after a rotate gesture ends
  const saveRotation = useCallback(async (nextRotation: number) => {
    if (isProjectBoard || !promptMessage) return // Project boards / missing message: skip DB write
    const { data: message, error: fetchError } = await supabase // Fetch current metadata blob
      .from('messages')
      .select('metadata')
      .eq('id', promptMessage.id)
      .single()
    if (fetchError) { // Bail if we cannot read existing metadata
      console.error('Error fetching message for rotation save:', fetchError)
      return
    }
    const existingMetadata = (message?.metadata as Record<string, any>) || {} // Keep other metadata keys
    const { error: updateError } = await supabase // Write rotation alongside existing fields
      .from('messages')
      .update({ metadata: { ...existingMetadata, rotation: nextRotation } })
      .eq('id', promptMessage.id)
    if (updateError) console.error('Error saving rotation to database:', updateError) // Surface write failures
  }, [isProjectBoard, promptMessage, supabase])

  // Persist final angle + AABB/mates (shared by drag-end and click-reset)
  const finishRotation = useCallback(
    (next: number) => {
      setRotation(next) // Commit angle (0 on click-reset)
      void saveRotation(next) // Fire-and-forget metadata save
      pushAabbAndSnapMates(next, { forceMates: true }) // Upright AABB + repark snap mates
      const cw = resizeDimensionsRef.current?.width
      const ch = resizeDimensionsRef.current?.height
      if (!cw || !ch) return // No content box yet
      const aabb =
        Math.abs(next) > 0.5
          ? rotatedFrameAabbSize(cw, ch, next, frameShapeRef.current)
          : { width: cw, height: ch }
      queueMicrotask(() => {
        // Defer so setNodes from pushAabbAndSnapMates has flushed
        const live = getNodes()
        void persistSnapMateRelayout(live, id, {
          width: Math.ceil(aabb.width),
          height: Math.ceil(aabb.height),
        })
      })
    },
    [saveRotation, pushAabbAndSnapMates, getNodes, id]
  )

  // Begin rotate: measure angle from panel center to pointer and lock drag state
  const handleRotatePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation() // Do not select/drag the RF node
    e.preventDefault() // Avoid text selection while rotating
    if (!panelRef.current) return // Need geometry for center
    // Lock current unrotated content size so AABB math has a stable base (outer becomes AABB)
    if (!resizeDimensions) {
      const fit = contentFitRef.current
      const w = Math.max(
        blockMinFrameWidth(promptContent),
        fit?.offsetWidth || panelRef.current.offsetWidth || 200
      )
      const h = Math.max(BLOCK_MIN_FRAME_H, fit?.offsetHeight || panelRef.current.offsetHeight || 40)
      setResizeDimensions({ width: w, height: h })
      setIsUserResized(true)
    }
    const rect = panelRef.current.getBoundingClientRect() // Screen-space panel bounds
    const cx = rect.left + rect.width / 2 // Horizontal center in viewport
    const cy = rect.top + rect.height / 2 // Vertical center in viewport
    const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx) // Initial pointer angle (radians)
    isRotatingRef.current = true // Mark active rotate session
    // Freeze pivot — live AABB width grows left-locked, so rect center would drift mid-gesture
    rotationDragRef.current = {
      startAngle,
      startRotation: rotation,
      pivotX: cx,
      pivotY: cy,
      startX: e.clientX,
      startY: e.clientY,
      didDrag: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId) // Keep events on this handle while dragging
  }, [rotation, resizeDimensions, promptContent])

  // Live-update rotation from pointer deltas relative to frozen pivot
  const handleRotatePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isRotatingRef.current || !rotationDragRef.current) return // Ignore stray moves
    const drag = rotationDragRef.current
    const dx = e.clientX - drag.startX // Screen delta from down
    const dy = e.clientY - drag.startY
    if (!drag.didDrag && dx * dx + dy * dy > ROTATE_CLICK_SLOP_PX * ROTATE_CLICK_SLOP_PX) {
      drag.didDrag = true // Past click slop — treat as rotate drag
    }
    if (!drag.didDrag) return // Still a potential click — don’t nudge angle yet
    const { startAngle, startRotation, pivotX, pivotY } = drag
    const angle = Math.atan2(e.clientY - pivotY, e.clientX - pivotX) // Angle about start pivot
    const deltaDeg = ((angle - startAngle) * 180) / Math.PI // Radians → degrees
    let next = startRotation + deltaDeg // Apply delta to start rotation
    if (e.shiftKey) next = Math.round(next / 15) * 15 // Hold Shift to snap to 15° increments
    setRotation(next) // Paint live rotation on the inner shell
    // Same tick: grow upright AABB + repark snap mates (don’t wait for useEffect)
    pushAabbAndSnapMates(next)
  }, [pushAabbAndSnapMates])

  // End rotate: click → reset 0°; drag → persist live angle + mates
  const handleRotatePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isRotatingRef.current) return // Only finish an active gesture
    const didDrag = rotationDragRef.current?.didDrag === true // Click vs drag before clearing
    isRotatingRef.current = false // Clear rotating flag
    rotationDragRef.current = null // Drop drag baseline
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* already released */ }
    if (!didDrag) {
      finishRotation(0) // Click (no drag) resets upright
      return
    }
    finishRotation(rotationRef.current) // Persist dragged angle from live ref
  }, [finishRotation])

  // Toggle frame lock: lock hugs scaled text; unlock keeps the current fit box + text scale.
  const toggleFrameLock = useCallback((forceUnlocked?: boolean) => {
    const wasUnlocked = frameUnlocked
    const nextUnlocked = typeof forceUnlocked === 'boolean' ? forceUnlocked : !wasUnlocked
    if (nextUnlocked === wasUnlocked) return // Already in desired state

    const readSavedFreeBox = (): { width: number; height: number; scale: number } | null => {
      const fromRef = unlockedFrameSizeRef.current
      if (fromRef && fromRef.width > 0 && fromRef.height > 0) {
        return {
          width: fromRef.width,
          height: fromRef.height,
          scale:
            unlockedFrameScaleRef.current != null && unlockedFrameScaleRef.current > 0
              ? unlockedFrameScaleRef.current
              : frameScaleRef.current,
        }
      }
      const meta = promptMessage?.metadata as Record<string, unknown> | undefined
      const fromMeta = meta?.unlockedFrameSize as { width?: number; height?: number } | undefined
      if (fromMeta?.width && fromMeta?.height && fromMeta.width > 0 && fromMeta.height > 0) {
        const metaScale = meta?.unlockedFrameScale
        return {
          width: fromMeta.width,
          height: fromMeta.height,
          scale:
            typeof metaScale === 'number' && metaScale > 0 ? metaScale : frameScaleRef.current,
        }
      }
      return null
    }

    const measureLiveBox = () => {
      const el = panelRef.current
      return {
        width: Math.max(
          blockMinFrameWidth(promptContent),
          resizeDimensionsRef.current?.width ??
            el?.offsetWidth ??
            intrinsicSizeRef.current.width
        ),
        height: Math.max(
          BLOCK_MIN_FRAME_H,
          resizeDimensionsRef.current?.height ??
            el?.offsetHeight ??
            intrinsicSizeRef.current.height
        ),
        scale: frameScaleRef.current,
      }
    }

    let metaPatch: Record<string, unknown> = { frameUnlocked: nextUnlocked }
    let fitShift = { x: 0, y: 0 } // Relock: hug around the mid-frame free content, not the top-left
    let fitOuter: { width: number; height: number } | null = null // RF box in the same commit as the XY shift

    // Sole image: same round-trip as text, but fit size is the last sticky box (not a bitmap hug).
    const soleImage = isSoleImageBlockHtml(promptContent)
    if (soleImage) {
      const live = measureLiveBox()
      const readSavedFitBox = (): { width: number; height: number } | null => {
        const fromRef = imageFitSizeRef.current // Live ref — metadata can lag a same-session toggle
        if (fromRef && fromRef.width > 0 && fromRef.height > 0) return fromRef
        const meta = promptMessage?.metadata as Record<string, unknown> | undefined
        const fromMeta = meta?.imageFitSize as { width?: number; height?: number } | undefined
        if (fromMeta?.width && fromMeta?.height && fromMeta.width > 0 && fromMeta.height > 0) {
          return { width: fromMeta.width, height: fromMeta.height }
        }
        return null
      }
      let nextDims = { width: live.width, height: live.height }
      let nextScale = live.scale
      if (nextUnlocked) {
        // Leaving fit: keep this exact box + scale (do not restore an older free size).
        const fitBox = { width: live.width, height: live.height }
        imageFitSizeRef.current = fitBox
        nextDims = fitBox // Same fill the user was looking at
        nextScale = live.scale // Same text/image scale
        if (nextScale !== frameScale) setFrameScale(nextScale)
        setUnlockedFrameSize(fitBox) // Free bookkeeping starts at the current fit
        setUnlockedFrameScale(nextScale)
        unlockedFrameSizeRef.current = fitBox
        unlockedFrameScaleRef.current = nextScale
        metaPatch = {
          ...metaPatch,
          frameScale: nextScale,
          resizeDimensions: nextDims,
          frameTextWrap,
          imageFitSize: fitBox,
          unlockedFrameSize: fitBox,
          unlockedFrameScale: nextScale,
        }
      } else {
        // Entering fit: remember the free box, then return to the last fit box.
        const freeBox = { width: live.width, height: live.height }
        setUnlockedFrameSize(freeBox)
        setUnlockedFrameScale(live.scale)
        unlockedFrameSizeRef.current = freeBox
        unlockedFrameScaleRef.current = live.scale
        const savedFit = readSavedFitBox()
        if (savedFit) nextDims = { width: savedFit.width, height: savedFit.height }
        metaPatch = {
          ...metaPatch,
          frameScale: live.scale,
          resizeDimensions: nextDims,
          frameTextWrap,
          unlockedFrameSize: freeBox,
          unlockedFrameScale: live.scale,
          ...(savedFit ? { imageFitSize: savedFit } : {}),
        }
      }
      setResizeDimensions(nextDims)
      setIsUserResized(true)
      setFrameUnlocked(nextUnlocked)
      const setNodesSole = getSetNodes()
      if (setNodesSole) {
        setNodesSole((nds: any[]) =>
          nds.map((n: any) => {
            if (n.id !== id) return n
            const pm = n.data?.promptMessage
            if (!pm) return n
            // RF node box follows the restored fit/free size so the blue ring matches
            const chromeX = adjustChromeXRef.current * 2
            const boxW = nextDims.width + chromeX
            const boxH = nextDims.height
            return {
              ...n,
              width: boxW,
              height: boxH,
              style: { ...n.style, width: boxW, height: boxH },
              data: {
                ...n.data,
                promptMessage: {
                  ...pm,
                  metadata: { ...(pm.metadata || {}), ...metaPatch },
                },
              },
            }
          })
        )
      }
      window.dispatchEvent(new Event('tt-frame-lock-changed'))
      void persistFrameMeta({ ...metaPatch, frameTextWrap: metaPatch.frameTextWrap ?? frameTextWrap })
      return
    }

    if (nextUnlocked) {
      const hug = liveLockedContentRef.current // Live fit-to-text fill (same pixels on screen)
      const live = hug
        ? { width: hug.width, height: hug.height, scale: frameScaleRef.current }
        : measureLiveBox() // Fallback when hug has not stamped yet
      const nextDims = { width: live.width, height: live.height } // Keep the fit box
      const nextScale = live.scale // Keep the fit text scale
      if (nextScale !== frameScale) setFrameScale(nextScale)
      setResizeDimensions(nextDims)
      setIsUserResized(true)
      setUnlockedFrameSize(nextDims) // Seed free bookkeeping to this box (do not restore an older one)
      setUnlockedFrameScale(nextScale)
      unlockedFrameSizeRef.current = nextDims
      unlockedFrameScaleRef.current = nextScale
      metaPatch = {
        ...metaPatch,
        frameScale: nextScale,
        resizeDimensions: nextDims,
        frameTextWrap,
        unlockedFrameSize: nextDims,
        unlockedFrameScale: nextScale,
      }
    } else {
      // Snapshot the live free box before hugging to fit (refs — not stale closure).
      const freeSnapshot = wasUnlocked ? measureLiveBox() : readSavedFreeBox() ?? measureLiveBox()
      setUnlockedFrameSize({ width: freeSnapshot.width, height: freeSnapshot.height })
      setUnlockedFrameScale(freeSnapshot.scale)
      const fitEl = contentFitRef.current
      const dbBox = fitEl ? measureDatabaseBlockExtents(fitEl, notionConnected) : null
      if (dbBox) {
        setDatabaseExtents(dbBox)
        setIntrinsicMeasured(true)
        setIntrinsicSize({ width: dbBox.width, height: dbBox.height })
      }
      const naturalH =
        dbBox?.height ??
        (fitEl ? measureNaturalContentHeight(fitEl, notionConnected) : intrinsicSize.height)
      const naturalW =
        dbBox?.width ??
        (fitEl
          ? isRowCardAtomHtml(promptContent)
            ? measureRowCardContentWidth(fitEl)
            : measureNaturalContentWidth(fitEl)
          : intrinsicSize.width)
      const baseScale = Math.max(FRAME_SCALE_EPSILON, freeSnapshot.scale) // Place / last lock scale
      const contain = freeContentFitScale(
        freeSnapshot.width, // Current free fill
        freeSnapshot.height,
        naturalW * baseScale, // Unshrunk visual
        naturalH * baseScale
      )
      // If free-resize shrunk the blocks, bake that contain into frameScale so fit hugs that size.
      // From free: bake the painted scale — wrap contain-fits the column, not the narrower glyph run
      const nextScale = Math.max(
        FRAME_SCALE_EPSILON,
        wasUnlocked ? paintScaleRef.current : baseScale * contain
      )
      setFrameScale(nextScale) // Persist the on-screen text size
      if (frameTextWrap && resizeDimensionsRef.current) {
        const keepW = resizeDimensionsRef.current.width // Wrap column stays the free width
        const wrapH = Math.max(1, Math.ceil(naturalH * nextScale)) // Hug height to the (maybe shrunk) wrap
        const nextDims = { width: keepW, height: wrapH }
        if (!dbBox) {
          setIntrinsicSize((prev) =>
            Math.abs(prev.width - naturalW) <= 1 && Math.abs(prev.height - naturalH) <= 1
              ? prev
              : { width: naturalW, height: naturalH }
          ) // Peach hugs this widest wrapped line on the first locked paint
        }
        setResizeDimensions(nextDims)
        setIsUserResized(true)
        metaPatch = {
          ...metaPatch,
          frameScale: nextScale,
          resizeDimensions: nextDims,
          frameTextWrap: true,
          unlockedFrameSize: { width: freeSnapshot.width, height: freeSnapshot.height },
          unlockedFrameScale: freeSnapshot.scale,
        }
      } else {
        const minW = blockMinFrameWidth(promptContent)
        const hugged = hugLockedFrameSize(
          { width: naturalW, height: naturalH },
          nextScale, // Fit the current visual, not the pre-shrink size
          minW,
          frameShapeRef.current
        )
        const nextDims = { width: hugged.width, height: hugged.height }
        setIntrinsicSize((prev) =>
          Math.abs(prev.width - naturalW) <= 1 && Math.abs(prev.height - naturalH) <= 1
            ? prev
            : { width: naturalW, height: naturalH }
        )
        setResizeDimensions(nextDims)
        setIsUserResized(true)
        metaPatch = {
          ...metaPatch,
          frameScale: nextScale,
          resizeDimensions: nextDims,
          frameTextWrap: false,
          unlockedFrameSize: { width: freeSnapshot.width, height: freeSnapshot.height },
          unlockedFrameScale: freeSnapshot.scale,
        }
      }
      const fillEl = wrapLineFillRef.current // Peach — contentFit origin is fill-local
      const painted = fitEl && fillEl ? visualContentInFill(fitEl, fillEl) : null // On-screen glyphs
      if (wasUnlocked && painted) {
        const glyphW = dbBox || isRowCardAtomHtml(promptContent) ? painted.width : naturalW * nextScale // Text hug at the baked scale
        const extra = Math.max(0, painted.width - glyphW) // Column / align-box air beside the glyphs
        const alignShift =
          frameAlignXRef.current === 'right' ? extra : frameAlignXRef.current === 'center' ? extra / 2 : 0 // Glyphs sit on the aligned edge of that box
        const nextDims = { width: painted.width - extra, height: painted.height } // Hug the painted glyphs, not the wider box
        setResizeDimensions(nextDims)
        resizeDimensionsRef.current = nextDims
        metaPatch = { ...metaPatch, resizeDimensions: nextDims }
        fitShift = { x: painted.left + alignShift, y: painted.top } // Fill origin → the glyphs’ left (mid-frame in free)
        const storePos = rfStoreApi.getState().nodeInternals.get(id)?.position
        if (storePos) {
          metaPatch = {
            ...metaPatch,
            position: { x: storePos.x + fitShift.x, y: storePos.y + fitShift.y },
          }
        }
        // Size + XY in the same setNodes — shrinking the peach first left text mid-node
        const chromeX = adjustChromeXRef.current
        const rot = rotationRef.current
        const aabb =
          Math.abs(rot) > 0.5
            ? rotatedFrameAabbSize(nextDims.width + chromeX * 2, nextDims.height, rot, frameShapeRef.current)
            : {
                width: nextDims.width + chromeX * 2,
                height: nextDims.height + adjustChromeYTopRef.current + adjustChromeYBottomRef.current,
              }
        fitOuter = { width: Math.round(aabb.width), height: Math.round(aabb.height) }
        lastPushedBoxRef.current = { w: fitOuter.width, h: fitOuter.height, rot }
      }
    }

    if (nextUnlocked) {
      contentFitBoxRef.current = null // Fit → free: +'s start maxed on the fill edges
      setContentFitBox(null)
      metaPatch = { ...metaPatch, contentFitBox: null } // Drop a stale inset box from the last free pass
    }
    setFrameUnlocked(nextUnlocked)
    const setNodes = getSetNodes()
    if (setNodes) {
      setNodes((nds: any[]) =>
        nds.map((n: any) => {
          if (n.id !== id) return n
          const pm = n.data?.promptMessage
          if (!pm) return n
          const pos =
            fitShift.x || fitShift.y
              ? { x: n.position.x + fitShift.x, y: n.position.y + fitShift.y }
              : n.position
          return {
            ...n,
            position: pos, // Same commit as the hug size
            ...(fitOuter
              ? {
                  width: fitOuter.width,
                  height: fitOuter.height,
                  style: { ...n.style, width: fitOuter.width, height: fitOuter.height },
                }
              : {}),
            data: {
              ...n.data,
              promptMessage: {
                ...pm,
                metadata: { ...(pm.metadata || {}), ...metaPatch },
              },
            },
          }
        })
      )
    }
    window.dispatchEvent(new Event('tt-frame-lock-changed'))
    void persistFrameMeta({ ...metaPatch, frameTextWrap: metaPatch.frameTextWrap ?? frameTextWrap })
  }, [frameUnlocked, frameScale, frameTextWrap, intrinsicSize, persistFrameMeta, promptContent, promptMessage?.metadata, getSetNodes, id, rfStoreApi])

  const handleToggleFrameLock = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    toggleFrameLock() // Flip from under-frame chrome
  }, [toggleFrameLock])

  // Top-bar frame lock → same fit/free toggle as under-frame chrome
  useEffect(() => {
    const onTopBar = (ev: Event) => {
      const detail = (ev as CustomEvent<{ nodeIds?: string[]; unlocked?: boolean }>).detail
      if (!detail?.nodeIds?.includes(id)) return // Not this frame
      toggleFrameLock(detail.unlocked) // Apply requested unlocked state
    }
    window.addEventListener('tt-toggle-frame-lock', onTopBar)
    return () => window.removeEventListener('tt-toggle-frame-lock', onTopBar)
  }, [id, toggleFrameLock])

  // Frame menu / footer → Table rows depth. Menus live outside this node, so they broadcast and
  // the owning frame persists — one writer for frame metadata (same as `tt-toggle-frame-lock`).
  useEffect(() => {
    const onSetDbRowCap = (ev: Event) => {
      const detail = (ev as CustomEvent<{ nodeIds?: string[]; messageIds?: string[]; cap?: number }>).detail
      const forNode = !!detail?.nodeIds?.includes(id)
      const forMsg = !!promptMessage?.id && !!detail?.messageIds?.includes(promptMessage.id)
      if (!forNode && !forMsg) return
      const cap = detail?.cap
      if (typeof cap !== 'number' || !Number.isFinite(cap) || cap < 1) return
      const next = Math.floor(cap)
      const always = next > COMPACT_PREVIEW_ROWS // Snapshot slot: past compact floor = expanded
      setDbVisibleRowCap(next)
      setDbAlwaysExpanded(always)
      void persistFrameMeta({ dbVisibleRowCap: next, dbAlwaysExpanded: always })
    }
    window.addEventListener('tt-set-db-visible-row-cap', onSetDbRowCap)
    return () => window.removeEventListener('tt-set-db-visible-row-cap', onSetDbRowCap)
  }, [id, persistFrameMeta, promptMessage?.id])

  const onDbShowMore = useCallback(() => {
    const next =
      dbVisibleRowCap < NOTION_DB_CLIENT_ROW_PAGE
        ? NOTION_DB_CLIENT_ROW_PAGE
        : Math.min(NOTION_DB_CLIENT_ROW_CAP, dbVisibleRowCap + NOTION_DB_CLIENT_ROW_PAGE)
    if (next === dbVisibleRowCap) return
    window.dispatchEvent(
      new CustomEvent('tt-set-db-visible-row-cap', {
        detail: {
          nodeIds: [id],
          messageIds: promptMessage?.id ? [promptMessage.id] : [],
          cap: next,
        },
      })
    )
  }, [dbVisibleRowCap, id, promptMessage?.id])

  const onDbShowLess = useCallback(() => {
    if (dbVisibleRowCap <= COMPACT_PREVIEW_ROWS) return
    const next =
      dbVisibleRowCap <= NOTION_DB_CLIENT_ROW_PAGE
        ? COMPACT_PREVIEW_ROWS
        : Math.max(COMPACT_PREVIEW_ROWS, dbVisibleRowCap - NOTION_DB_CLIENT_ROW_PAGE)
    window.dispatchEvent(
      new CustomEvent('tt-set-db-visible-row-cap', {
        detail: {
          nodeIds: [id],
          messageIds: promptMessage?.id ? [promptMessage.id] : [],
          cap: next,
        },
      })
    )
  }, [dbVisibleRowCap, id, promptMessage?.id])

  // Drag a wrap line — free/center: both edges; fit-to-content left/right: the free edge only
  const handleWrapLinePointerDown = useCallback((side: 'left' | 'right') => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation() // Do not start frame drag or text select
    e.preventDefault() // Keep the pointer on the line hit slop
    const lineEl = e.currentTarget // Same node we capture — release on up/cancel
    try { lineEl.setPointerCapture(e.pointerId) } catch { /* already captured / detached */ } // Phone: window pointermove dies once the finger leaves the thin bar
    const pointerId = e.pointerId // Release this id even if React reuses the handler
    wrapLineDraggingRef.current = true // Hug effect must not fight the live column
    const fill = wrapLineFillRef.current // Fill-local X from this box
    const paint0 = Math.max(FRAME_SCALE_EPSILON, paintScaleRef.current) // Freeze — live contain-fit remapped the bar onto the fill edge
    wrapDragPaintRef.current = paint0 // Render uses this until pointerup
    const cf = contentFitRef.current // Probe nowrap (fit unapply) + live wrap width
    const nowrapW = Math.max(
      BLOCK_THREE_CHARS_W, // Never below the ~3ch column floor
      (cf ? measureNowrapContentWidth(cf) : 0) || intrinsicSizeRef.current.width // Text run — fit unwraps here, not the wrap-line space
    ) // Content can be narrower than the wrap space — do not use this as the far edge
    const locked0 = !frameUnlockedRef.current // Fit-to-text: the wrap bar is the fill edge
    const s0 = Math.max(FRAME_SCALE_EPSILON, frameScaleRef.current) // Locked hug = col × place-scale
    const fillW0 = fill?.offsetWidth ?? 0 // Fill width at press (flow px)
    const padX0 = BLOCK_FRAME_PAD_X * paint0 // Same pad the line render insets by
    const fillInnerW = locked0 ? Math.max(0, fillW0 - padX0 * 2) : fillW0 // Free: contentFit (with its pad) may fill the fill
    const plusBox = contentFitBoxRef.current // Stored +'s — default +'s ride the column, so the fill is the max
    const plusInnerW = plusBox ? Math.min(plusBox.width, fillInnerW) : fillInnerW // Far-edge visual: +'s, else the frame
    const spaceCol = Math.max(
      BLOCK_THREE_CHARS_W, // Same ~3ch floor as fit-to-text
      locked0
        ? Math.max(nowrapW, fillInnerW / s0) // Fit: grow to the text run; keep the fill when content is shorter
        : plusInnerW / paint0 // Free: wrap-line space is the + box or fill — settable past the glyphs
    ) // Far edge of wrap-line space — never nowrap alone (that jumped the bars onto short content)
    const unapplyCol = locked0 ? nowrapW : spaceCol // Fit unwraps at the text run; free only at the fill / + edge
    nowrapCapRef.current = unapplyCol // Light blue at the edge that turns wrap off — fit: the text run, free: the fill / +
    const edgeCol = spaceCol // Drag max = wrap-line space
    if (!frameTextWrapRef.current) {
      // Wrap unapplied: the line sits at the far edge — arm wrap there (no reflow until dragged inward)
      if (!resizeDimensionsRef.current) {
        const box = {
          width: Math.max(blockMinFrameWidth(promptContentRef.current || ''), panelRef.current?.offsetWidth ?? intrinsicSizeRef.current.width), // Live box width
          height: Math.max(BLOCK_MIN_FRAME_H, panelRef.current?.offsetHeight ?? intrinsicSizeRef.current.height), // Live box height
        } // Hugging frames have no box yet — wrap needs one to lay out into
        resizeDimensionsRef.current = box // Drag math reads this before React commits
        setResizeDimensions(box) // Seed the explicit box
      }
      setIsUserResized(true) // Explicit-box mode so wrapActive can engage
      wrapColWidthRef.current = edgeCol // Start at the + / fill edge — not a nowrap cap past the +'s
      setWrapColWidth(edgeCol)
      frameTextWrapRef.current = true // Live flag for onUp
      setFrameTextWrap(true) // Wrap layout (no visible change at the edge column)
    } else if (wrapColWidthRef.current != null && wrapColWidthRef.current > edgeCol) {
      wrapColWidthRef.current = edgeCol // Past the wrap-line space only — do not clamp inward to shorter content
      setWrapColWidth(edgeCol)
    }
    const wordMin = Math.max(BLOCK_THREE_CHARS_W, cf ? measureLongestWordWidth(cf) : BLOCK_THREE_CHARS_W) // Column stops at the longest word
    const startW = wrapColWidthRef.current ?? edgeCol // Column at press (already armed at the edge when wrap was off)
    const startVisual = Math.min(startW * paint0, plusInnerW) // Bar position as drawn — pointer maps in this space
    const startRect = fill?.getBoundingClientRect() // Screen box at press
    const flowPerScreen = fill && startRect ? fill.offsetWidth / Math.max(1, startRect.width) : 1 // Board zoom — fixed for the gesture
    const pair = !locked0 || frameAlignXRef.current === 'center' // Both bars move opposite
    const growth = pair ? 2 : 1 // Pair: column grows by twice the pointer delta
    const dirSign = side === 'right' ? 1 : -1 // Outward = right for the right bar, left for the left bar
    const shiftNode = locked0 && (side === 'left' || pair) && Math.abs(rotationRef.current) <= 0.5 // Fit: left/center must move the frame so the dragged edge follows
    const startPos = shiftNode ? rfStoreApi.getState().nodeInternals.get(id)?.position ?? null : null // Fit left/center moves the frame; free wrap does not
    const startBox = resizeDimensionsRef.current
      ? { width: resizeDimensionsRef.current.width, height: resizeDimensionsRef.current.height }
      : null // Fill at press — cancelling wrap on the far edge restores this box
    let hugRaf = 0 // One follow-up measure after wrap layout commits — the move itself can run too early
    let liveVisualW = startVisual // Where the wrap lines are — kept for the post-layout measure
    // Free wrap: lines follow the pointer. Layout stays at least one word wide so tokens do not split.
    // Glyphs shrink to that gap as soon as the lines move in — not only after they hit one word.
    const fitFreeWrapScale = (column: number, visual: number) => {
      const fitEl = contentFitRef.current // Column element — may remount across the gesture
      if (!fitEl || !fill || locked0) return // Fit-to-text shrinks frameScale instead — the peach stays on the glyphs
      fitEl.style.width = `${column}px` // Unscaled column — never narrower than the longest word
      fitEl.style.maxWidth = `${column}px` // Match wrapContentWidth so the height measure sees this move
      const s = Math.max(FRAME_SCALE_EPSILON, frameScaleRef.current) // Place scale — contain multiplies this
      const contentW = Math.max(1, column * s) // Width at place scale, before contain
      // The pointer gap is the size. A tall wrapped stack must not crush the glyphs narrower than the lines.
      const widthFit = Math.max(1, visual) / contentW // Glyphs land on the wrap lines
      const contain = Math.max(FRAME_SCALE_EPSILON, Number.isFinite(widthFit) ? widthFit : 1) // Live shrink, no word-width floor
      const paint = s * contain // On-screen glyph scale this measure
      fitEl.style.transform = Math.abs(paint - 1) > FRAME_SCALE_EPSILON ? `scale(${paint})` : '' // Shrink between the lines
      fitEl.style.transformOrigin = 'center center' // Stay centered — the frame does not grow
      freeFitScaleRef.current = contain // Render reuses this for the rest of the gesture
      paintScaleRef.current = paint // Later reads in this drag see the live size
      wrapDragPaintRef.current = paint // Bar thickness tracks the same scale
    }
    const onMove = (ev: PointerEvent) => {
      if (!fill) return // No fill — cannot convert client X
      // Press-relative. Fit-to-text moves the fill; free keeps it still and only scales the glyphs.
      const d = (ev.clientX - e.clientX) * flowPerScreen // Flow px from press — board zoom captured above
      let visualW = startVisual + growth * dirSign * d // Column width the pointer is asking for
      const minVisual = 8 // Past the longest word the lines keep closing — glyphs scale down to this gap
      const visualMax = locked0 ? edgeCol * paint0 : plusInnerW // Fit grows out to the text run; free stops on the +'s
      visualW = Math.max(minVisual, Math.min(visualMax, visualW)) // That far edge is also where wrap turns off
      const leaveSlop = 8 * flowPerScreen // ~8 screen px extra inward before bars leave the +'s (grab jitter)
      if (!locked0 && visualW > plusInnerW - leaveSlop) visualW = plusInnerW // Stay on the + until that slop is spent
      liveVisualW = visualW // Post-layout measure uses the same line gap
      const gapT = startVisual > 1 ? visualW / startVisual : 1 // 1 at the grab; inward is smaller
      const rawCol = locked0
        ? visualW / paint0 // Fit: the column is the gap — the frame hugs it
        : startW * gapT + wordMin * (1 - gapT) // Free: share the drag between reflow and shrink
      const col = Math.max(wordMin, Math.min(edgeCol, Math.round(rawCol * 100) / 100)) // Layout never splits a word
      wrapColWidthRef.current = col // Live readers (resize) see this tick
      setWrapColWidth(col) // Reflow text at the line
      if (!frameUnlockedRef.current) {
        // Past the longest word, shrink place-scale so the peach (and the line on it) keeps following the pointer.
        const glyph = Math.min(s0, visualW / Math.max(1, col))
        if (Math.abs(glyph - frameScaleRef.current) > FRAME_SCALE_EPSILON) {
          frameScaleRef.current = glyph // Hug effect is paused while the line is down
          setFrameScale(glyph)
        }
        const s = Math.max(FRAME_SCALE_EPSILON, frameScaleRef.current) // Locked hug = col × this scale
        freeFitScaleRef.current = 1 // Place-scale already holds the shrink — don't stack a free contain
        const width = Math.round(col * s * 100) / 100 // Equals the pointer gap once the column is one word wide
        if (shiftNode && startPos) {
          const shiftX = -(width - startW * s0) / growth // Keep the opposite edge or the center fixed, including glyph shrink
          const setNodes = getSetNodes() // Live RF XY
          setNodes?.((nds: any[]) =>
            nds.map((n: any) => (n.id === id ? { ...n, position: { x: startPos.x + shiftX, y: n.position.y } } : n))
          )
          wrapShiftPosRef.current = { x: startPos.x + shiftX, y: startPos.y } // Persisted on release
        }
        const spacer = cf?.parentElement // Visual box — grow this BEFORE the column so flex-end cannot shove ⋮⋮ left
        if (spacer && spacer !== fill) {
          spacer.style.width = `${width}px` // Match the hug before contentFit widens
          spacer.style.minWidth = `${width}px` // Defeat a stale min from the last commit
        }
        if (cf) {
          cf.style.width = `${col}px` // Sync wrap after the spacer — outward drag must loosen this frame
          cf.style.maxWidth = `${col}px` // Match wrapContentWidth
          cf.style.transform = Math.abs(s - 1) > FRAME_SCALE_EPSILON ? `scale(${s})` : '' // Glyphs fit the pointer gap
          cf.style.transformOrigin =
            frameAlignXRef.current === 'right'
              ? 'top right'
              : frameAlignXRef.current === 'center'
                ? 'top center'
                : 'top left' // Same origin the settled render uses, so the line stays on the glyphs
          paintScaleRef.current = s // Bar weight and the next read see the shrunk size
          wrapDragPaintRef.current = s
        }
        const height = cf
          ? Math.max(1, Math.round(measureNaturalContentHeight(cf) * s * 100) / 100) // Same 2dp hug as nowrap
          : resizeDimensionsRef.current?.height ?? Math.max(1, intrinsicSizeRef.current.height * s)
        if (spacer && spacer !== fill) spacer.style.height = `${height}px` // Live hug height with the column
        applyLiveAdjustBoxRef.current(width, height) // RF + panel on this tick — do not wait for React
        resizeDimensionsRef.current = { width, height } // Persist on pointerup before React commits
        setResizeDimensions({ width, height }) // Live hug
      } else {
        fitFreeWrapScale(col, visualW) // Glyphs fit between the lines — frame size stays
        if (hugRaf) cancelAnimationFrame(hugRaf) // Only the latest column needs a post-layout measure
        hugRaf = requestAnimationFrame(() => {
          hugRaf = 0 // This follow-up has run
          if (!wrapLineDraggingRef.current) return // Release already settled
          const column = wrapColWidthRef.current // Column the move stored
          if (column == null) return // Wrap was cleared
          fitFreeWrapScale(column, liveVisualW) // Second measure after the browser wraps the line
        })
      }
      // Lines follow the pointer. The layout column stops at the longest word, so a stale word box must not win.
      const scaledBox = cf ? wrapColumnInFill(fill, cf) : null // Glyph box after this move's scale
      const scaledMatches = !!scaledBox && Math.abs(scaledBox.width - visualW) < 4 // Use it only when it already fits the gap
      const lineMax = locked0 ? edgeCol * paint0 : plusInnerW // Fit lines ride the growing hug; free lines stay inside the +'s
      const w = Math.min(lineMax, scaledMatches && scaledBox ? scaledBox.width : visualW)
      const align = frameAlignXRef.current
      const left = scaledMatches && scaledBox
        ? scaledBox.left // Parked on the glyphs (fit left/right stay on their edge)
        : !locked0 || align === 'center'
          ? (fill.offsetWidth - w) / 2 // Free and fit-center: both lines move
          : align === 'right'
            ? Math.max(0, fill.offsetWidth - padX0 - w) // Fit right: the left line moves
            : padX0 // Fit left: the right line moves
      const dragBox = { left, width: w }
      wrapDragBoxRef.current = dragBox // Render reads this while the pointer is down
      setWrapPaintBox(dragBox)
    }
    const onUp = () => {
      if (hugRaf) cancelAnimationFrame(hugRaf) // Don’t hug again after release restored or persisted the box
      hugRaf = 0
      const releasedGap = wrapDragBoxRef.current // Where the pointer let go — keep this, the content box can be wider
      wrapLineDraggingRef.current = false // Hug / persist may run again
      wrapDragBoxRef.current = null // Render goes back to wrapPaintBox
      wrapDragPaintRef.current = null // Render may use live contain-fit again
      setWrapMeasureTick((t) => t + 1) // Re-measure the settled column — else bars keep the pre-drag box
      window.removeEventListener('pointermove', onMove) // Drop live drag
      window.removeEventListener('pointerup', onUp) // Drop end
      window.removeEventListener('pointercancel', onUp) // Phone: Safari cancel is not an up
      try { lineEl.releasePointerCapture(pointerId) } catch { /* already released */ } // Drop capture so later taps work
      const col = wrapColWidthRef.current // Final column
      const startAtUnapply = startW <= unapplyCol + 0.02 // Only unwrap from the park edge — a wider wrap (content shorter than wrap space) must stay
      const atEdge = col == null || (startAtUnapply && col >= unapplyCol - 0.02) // Free: fill / +; fit: text run — never snap inward to content
      const shiftedPos = wrapShiftPosRef.current // Fit left/center or free hug moved the frame
      wrapShiftPosRef.current = null // One-shot
      if (atEdge) {
        wrapGapRef.current = null // Unwrap — lines return to the fill / + edges
        frameTextWrapRef.current = false // Unapply wrap — back to nowrap
        setFrameTextWrap(false)
        if (frameUnlockedRef.current && startBox) {
          resizeDimensionsRef.current = startBox // Drop the live hug — release on the edge cancels wrap
          setResizeDimensions(startBox)
          applyLiveAdjustBoxRef.current(startBox.width, startBox.height) // Peach back to the pre-drag fill
          if (startPos) {
            const setNodes = getSetNodes() // Put the frame back on its press origin
            setNodes?.((nds: any[]) =>
              nds.map((n: any) => (n.id === id ? { ...n, position: { x: startPos.x, y: startPos.y } } : n))
            )
            void persistFrameMetaRef.current({ position: { x: startPos.x, y: startPos.y } })
          }
        }
        void persistFrameMetaRef.current({
          frameTextWrap: false, // Wrap only applies once dragged inward
          frameUnlocked: frameUnlockedRef.current, // Keep lock
          frameScale: frameScaleRef.current, // Keep place-scale
          ...(frameUnlockedRef.current && startBox ? { resizeDimensions: startBox } : {}), // Don’t keep the cancelled hug
        })
        if (!frameUnlockedRef.current) {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            const cf = contentFitRef.current // Nowrap layout after the reflow
            if (!cf) return // Unmounted
            const s = Math.max(FRAME_SCALE_EPSILON, frameScaleRef.current) // Same scale as hug
            const width = Math.max(
              blockMinFrameWidth(promptContentRef.current || ''), // Fit floor
              Math.ceil(measureNaturalContentWidth(cf) * s) // Nowrap text width
            )
            const height = Math.max(1, Math.round(measureNaturalContentHeight(cf) * s * 100) / 100) // 2dp hug
            setResizeDimensions({ width, height }) // Fit hugs both dims — no stale wrapped height
          }))
        }
        return
      }
      if (releasedGap) {
        wrapGapRef.current = {
          width: releasedGap.width, // Fill px at release — zoom does not change this space
          align:
            !frameUnlockedRef.current && frameAlignXRef.current === 'right'
              ? 'right'
              : !frameUnlockedRef.current && frameAlignXRef.current === 'left'
                ? 'left'
                : 'center', // Free and fit-center stay mid-frame
        }
        setWrapPaintBox(releasedGap) // First paint stays on the pointer — the measure effect must not replace it
      }
      if (shiftedPos) void persistFrameMetaRef.current({ position: shiftedPos }) // Keep the moved XY
      let scaleOut = frameScaleRef.current // Place scale written on release
      if (frameUnlockedRef.current) {
        const contain = freeFitScaleRef.current // Shrink that fit the glyphs between the lines
        if (contain > 0 && Math.abs(contain - 1) > FRAME_SCALE_EPSILON) {
          scaleOut = Math.max(FRAME_SCALE_EPSILON, scaleOut * contain) // Bake it — otherwise release grows the text back to the + box
          frameScaleRef.current = scaleOut
          setFrameScale(scaleOut)
          freeFitScaleRef.current = 1 // The baked scale is the new fit-to-text for this column
        }
        if (resizeDimensionsRef.current) setUnlockedFrameSize(resizeDimensionsRef.current) // Next free pass restores this box
      }
      void persistFrameMetaRef.current({
        frameTextWrap: true, // Dragged inward — wrap applies
        wrapColWidth: col, // Layout column — at least one word wide
        frameUnlocked: frameUnlockedRef.current, // Keep lock
        frameScale: scaleOut, // Includes the free shrink between the lines
        ...(resizeDimensionsRef.current ? { resizeDimensions: resizeDimensionsRef.current } : {}), // Hug box (fit and free)
        ...(frameUnlockedRef.current && resizeDimensionsRef.current
          ? { unlockedFrameSize: resizeDimensionsRef.current } // Free restore uses this, not the pre-wrap box
          : {}),
      })
      if (!frameUnlockedRef.current && col != null) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const cf = contentFitRef.current // Wrapped layout after the last col
          const s = Math.max(FRAME_SCALE_EPSILON, frameScaleRef.current) // Same scale as hug
          if (!cf) return // Unmounted
          const height = Math.max(1, Math.round(measureNaturalContentHeight(cf) * s * 100) / 100) // Same 2dp hug as nowrap
          setResizeDimensions({ width: Math.round(col * s), height }) // Width stays on the line
        }))
      }
    }
    window.addEventListener('pointermove', onMove) // Track past the 1px line
    window.addEventListener('pointerup', onUp) // Persist + locked re-hug
    window.addEventListener('pointercancel', onUp) // Phone: iOS cancel must not leave wrapLineDraggingRef stuck
  }, [id, getSetNodes, rfStoreApi])

  // Grey content-fit pluses — free resize only; drag a corner to resize the contain-fit box (centred)
  const handleFitCornerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation() // Do not start frame drag or grab a wrap line
    e.preventDefault()
    if (!frameUnlockedRef.current) return // Pluses exist only in free resize
    const fill = wrapLineFillRef.current
    if (!fill) return
    const plusEl = e.currentTarget // Same node we capture — release on up/cancel
    try { plusEl.setPointerCapture(e.pointerId) } catch { /* already captured / detached */ } // Phone: keep + drag once the finger leaves the mark
    const pointerId = e.pointerId // Release this id on end
    fitLineDraggingRef.current = true // Grow / hug must not fight the live box
    const maxW = Math.max(BLOCK_THREE_CHARS_W, fill.offsetWidth) // Far edge = fill — contentFit already holds the text pad
    const maxH = Math.max(BLOCK_MIN_FRAME_H, fill.offsetHeight)
    const prevCol = contentFitBoxRef.current?.col // Keep the basis set on an earlier + drag
    const liveCol = frameTextWrapRef.current ? wrapColWidthRef.current : null // Wrapped: basis = current column
    const col = prevCol ?? liveCol ?? undefined // Scale by this so the first move does not jump the lines
    const onMove = (ev: PointerEvent) => {
      const rect = fill.getBoundingClientRect() // Fill is stable — plus follows the pointer
      const sx = fill.offsetWidth / Math.max(1, rect.width)
      const sy = fill.offsetHeight / Math.max(1, rect.height)
      const localX = (ev.clientX - rect.left) * sx
      const localY = (ev.clientY - rect.top) * sy
      const w = Math.max(BLOCK_THREE_CHARS_W, Math.min(maxW, 2 * Math.abs(localX - fill.offsetWidth / 2))) // Pair — keep centred
      const h = Math.max(BLOCK_MIN_FRAME_H, Math.min(maxH, 2 * Math.abs(localY - fill.offsetHeight / 2)))
      const box = {
        width: Math.round(w * 100) / 100, // 2dp — no pixel step
        height: Math.round(h * 100) / 100,
        ...(col != null ? { col } : {}), // Same scale basis all gesture
      }
      contentFitBoxRef.current = box
      setContentFitBox(box) // Live contain-fit
    }
    const onUp = () => {
      fitLineDraggingRef.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp) // Phone: Safari cancel is not an up
      try { plusEl.releasePointerCapture(pointerId) } catch { /* already released */ } // Drop capture so later taps work
      const box = contentFitBoxRef.current
      if (!box) return // Press without a move — nothing to keep
      void persistFrameMetaRef.current({ contentFitBox: box, frameUnlocked: true }) // Keep it even at the fill edge — clearing snapped scale + +'s back
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp) // Phone: iOS cancel must not leave fitLineDraggingRef stuck
  }, [])

  // (Overflow caret removed — lock = fit-to-content; unlock keeps current visual size + free resize/clip.)

  // Locked + resized: hug WIDTH and HEIGHT to natural text (locked = hug to content) —
  // shrink/grow both dimensions on lock/type instead of keeping the taller resize box.
  useEffect(() => {
    const rowCard = isRowCardAtomHtml(promptContent)
    const dbFrame = isDbFrame
    // Sole image: frame size is sticky (contain-fit inside) — never re-hug to the bitmap
    if (isSoleImageBlockHtml(promptContent)) return
    if (!isBlock || frameUnlocked || dragging) return // Preview lives in the boardLink — hug must include it
    if (!intrinsicMeasured || isResizingRef.current || wrapLineDraggingRef.current) return // Line drag owns width while wrapping
    if (!isUserResized && !rowCard && !dbFrame && Math.abs(frameScale - 1) <= FRAME_SCALE_EPSILON) {
      return // Row/DB cards + place-scaled frames hug as soon as content is measured
    }
    // No boardLink/3ch / 40px floor — locked hug must match scaled glyphs (else text sits top-left in empty pad)
    const minW = 1
    const hugSource = shapeFitContentBox(
      dbFrame && databaseExtents ? databaseExtents : intrinsicSize,
      frameShape,
      true
    )
    const natural = scaledFrameSize(hugSource, frameScale, minW, 1)
    // Never hug a databaseBlock frame down to the remount stub — that persists as a permanent clip.
    if (
      hasDatabaseBlockHtml(promptContent) &&
      isCollapsedDatabaseFrameSize(natural.width, natural.height)
    ) {
      return
    }
    // Mounted property cells can be narrower than 120. The measure effect already waits
    // until those cells exist, so a hard floor here kept the saved box on the text seed.
    let next = natural
    let changed = true
    setResizeDimensions((prev) => {
      // Wrap keeps fixed columns × scale (not a stale prev.width that still had +2 border).
      // Nowrap hugs width to content.
      const width =
        frameTextWrap && wrapColWidth != null
          ? Math.round(wrapColWidth * Math.max(FRAME_SCALE_EPSILON, frameScale))
          : frameTextWrap && prev
            ? prev.width
            : natural.width
      // Hug height to content — never keep a ≤1px-taller seed (place min 22×scale); that leftover
      // is multiplied into peach under the block with top-left scale origin.
      const height = natural.height
      next = { width, height }
      if (
        prev &&
        hasDatabaseBlockHtml(promptContent) &&
        isCollapsedDatabaseFrameSize(width, height) &&
        !isCollapsedDatabaseFrameSize(prev.width, prev.height)
      ) {
        changed = false
        return prev // Keep the larger box; don't clip the table away
      }
      if (
        prev &&
        Math.abs(prev.width - width) <= 1 &&
        Math.abs(prev.height - height) <= 0.02 // Sub-px — 1px epsilon kept place-seed slack under the block
      ) {
        changed = false
        return prev
      }
      return next
    })
    if (!changed) return
    // RF node sync uses resizeDimensions; place-scaled + row/DB cards need the resized path
    if (!isUserResized && (rowCard || dbFrame || Math.abs(frameScale - 1) > FRAME_SCALE_EPSILON)) {
      setIsUserResized(true)
    }
    if (persistFrameMetaTimerRef.current) clearTimeout(persistFrameMetaTimerRef.current)
    persistFrameMetaTimerRef.current = setTimeout(() => {
      void persistFrameMeta({
        resizeDimensions: next,
        frameUnlocked: false,
        frameScale,
      })
    }, 250)
    return () => {
      if (persistFrameMetaTimerRef.current) clearTimeout(persistFrameMetaTimerRef.current)
    }
  }, [
    isBlock,
    frameUnlocked,
    isUserResized,
    pagePreviewOpen,
    dragging,
    intrinsicMeasured,
    intrinsicSize,
    frameScale,
    frameTextWrap,
    wrapColWidth,
    persistFrameMeta,
    promptContent,
    isDbFrame,
    databaseExtents,
    frameShape,
  ])

  // Auto-select panel when editor is focused or has a text range (not boardLink NodeSelection)
  const handleEditorActiveChange = useCallback((isActive: boolean) => {
    editorActiveRef.current = isActive
    if (isActive && !selected) {
      if (isEditorAutoSelectSuppressed()) return // Pane just deselected — don't snap it back
      // Editor is active (focused or has selection) but panel is not selected - auto-select it
      // First deselect all other nodes, then select this one
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? { ...node, selected: true }
            : { ...node, selected: false }
        )
      )
    }
  }, [id, selected, setNodes])

  // Pane click deselected this frame — drop editor/title focus + atom NodeSelection so the
  // auto-select effect cannot immediately re-select (boardLink title is contentEditable inside PM).
  useEffect(() => {
    if (selected) return
    const ed = promptEditorRef.current
    if (!ed || ed.isDestroyed) return
    const root = ed.view.dom as HTMLElement
    const ae = document.activeElement as HTMLElement | null
    if (ae && (ae === root || root.contains(ae))) {
      ae.blur() // Title label or PM surface
    }
    const sel = ed.state.selection
    if (sel instanceof TextSelection && sel.empty) return // Already a caret — nothing to clear
    // near() lands a caret beside atoms (TextSelection.create at a boardLink pos throws)
    try {
      const pos = Math.max(0, Math.min(sel.from, ed.state.doc.content.size))
      ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(ed.state.doc.resolve(pos))))
    } catch {
      // ignore invalid pos
    }
  }, [selected])

  // Flashcard navigation - get all flashcards in the same board/project/study set
  // For regular boards that are part of a project, also enable cross-board navigation
  // Fetch project ID from board metadata if it's a regular board
  const [boardProjectId, setBoardProjectId] = useState<string | null>(null)
  
  useEffect(() => {
    if (isProjectBoard || !conversationId || !isFlashcard) {
      setBoardProjectId(null)
      return
    }
    
    // Fetch conversation metadata to get project_id
    const fetchProjectId = async () => {
      const { data, error } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', conversationId)
        .single()
      
      if (!error && data?.metadata) {
        const metadata = data.metadata as Record<string, any>
        const projectId = metadata.project_id
        if (projectId) {
          setBoardProjectId(projectId)
        } else {
          setBoardProjectId(null)
        }
      } else {
        setBoardProjectId(null)
      }
    }
    
    fetchProjectId()
  }, [conversationId, isProjectBoard, isFlashcard, supabase])
  
  // Fetch all boards in the project (if board is part of a project)
  const { data: projectBoards = [] } = useQuery({
    queryKey: ['project-boards-for-flashcards', boardProjectId],
    queryFn: async () => {
      if (!boardProjectId) return []
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      
      const { data, error } = await supabase
        .from('conversations')
        .select('id, title, metadata')
        .eq('user_id', user.id)
        .contains('metadata', { project_id: boardProjectId })
      
      if (error) {
        console.error('Error fetching project boards:', error)
        return []
      }
      return (data || []) as Array<{ id: string; title: string; metadata: any }>
    },
    enabled: !!boardProjectId && !isProjectBoard,
  })
  
  // Fetch flashcards from all boards (project or all boards if tag selected) to check if there are flashcards in other boards
  const { data: projectFlashcards = [] } = useQuery({
    queryKey: ['project-flashcards', boardProjectId, projectBoards.map(b => b.id).join(','), selectedTag],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return []
      
      let boardIds: string[] = []
      
      // If a tag is selected, search across ALL boards (not just project)
      if (selectedTag) {
        // Fetch all user's boards
        const { data: allBoards, error: boardsError } = await supabase
          .from('conversations')
          .select('id')
          .eq('user_id', user.id)
        
        if (boardsError) {
          console.error('Error fetching all boards:', boardsError)
          return []
        }
        
        boardIds = (allBoards || []).map(b => b.id)
      } else if (boardProjectId && projectBoards.length > 0) {
        // No tag selected, use project boards
        boardIds = projectBoards.map(b => b.id)
      } else {
        return []
      }
      
      if (boardIds.length === 0) return []
      
      // Fetch all messages from relevant boards
      const { data: allMessages, error } = await supabase
        .from('messages')
        .select('id, role, content, created_at, metadata, conversation_id')
        .eq('user_id', user.id)
        .in('conversation_id', boardIds)
        .order('created_at', { ascending: true })
      
      if (error) {
        console.error('Error fetching flashcards:', error)
        return []
      }
      
      if (!allMessages || allMessages.length === 0) return []
      
      // Filter for flashcards (user messages with isFlashcard metadata)
      // If tag is selected, also filter by studySetIds in the response message
      const flashcards: Array<{ boardId: string; messageId: string }> = []
      for (let i = 0; i < allMessages.length; i++) {
        const message = allMessages[i]
        if (message.role === 'user') {
          const metadata = (message.metadata as Record<string, any>) || {}
          if (metadata.isFlashcard === true) {
            // If tag is selected, check if the response message has that tag
            if (selectedTag) {
              // Find the next assistant message (response) for this flashcard
              let hasTag = false
              for (let j = i + 1; j < allMessages.length && allMessages[j].conversation_id === message.conversation_id; j++) {
                if (allMessages[j].role === 'assistant') {
                  const responseMetadata = (allMessages[j].metadata as Record<string, any>) || {}
                  const studySetIds = (responseMetadata.studySetIds || []) as string[]
                  if (studySetIds.includes(selectedTag)) {
                    hasTag = true
                    break
                  }
                  // Only check the first response message for this flashcard
                  break
                }
              }
              if (!hasTag) {
                continue // Skip flashcards without the selected tag
              }
            }
            
            flashcards.push({
              boardId: message.conversation_id || '',
              messageId: message.id
            })
          }
        }
      }
      
      return flashcards
    },
    enabled: (!!boardProjectId && !isProjectBoard && projectBoards.length > 0) || (!!selectedTag && isFlashcard),
  })
  
  // Check if there are flashcards in other boards (project or all boards if tag selected)
  const hasFlashcardsInOtherBoards = useMemo(() => {
    if (!projectFlashcards.length) return false
    
    // If tag is selected, check all boards (not just project)
    // Otherwise, check project boards only
    if (selectedTag) {
      // With tag selected, check if there are flashcards in any other board
      const otherBoardsFlashcards = projectFlashcards.filter(f => f.boardId !== conversationId)
      return otherBoardsFlashcards.length > 0
    } else {
      // No tag selected - only check project boards
      if (!boardProjectId || !conversationId) return false
      const otherBoardsFlashcards = projectFlashcards.filter(f => f.boardId !== conversationId)
      return otherBoardsFlashcards.length > 0
    }
  }, [boardProjectId, conversationId, projectFlashcards, selectedTag])
  
  // Use state to track nodes and force recomputation when nodes change
  const [flashcardCount, setFlashcardCount] = useState(0)
  
  // Update flashcard count when nodes change (using effect to watch for node changes)
  useEffect(() => {
    if (!reactFlowInstance || !isFlashcard) {
      setFlashcardCount(0)
      return
    }
    
    // Function to compute and update flashcard count
    const updateFlashcardCount = () => {
      const allNodes = reactFlowInstance.getNodes() || []
      const count = allNodes.filter((node) => {
        const nodeData = node.data as ChatPanelNodeData
        const nodeIsFlashcard = nodeData.promptMessage?.metadata?.isFlashcard === true
        if (!nodeIsFlashcard) return false
        
        // For project boards, check projectId
        if (isProjectBoard && projectId) {
          const nodeIsProjectBoard = isProjectBoardData(node.data)
          return nodeIsProjectBoard && node.data.projectId === projectId
        }
        
        // For regular boards, check conversationId
        if (conversationId) {
          return nodeData.conversationId === conversationId
        }
        
        // For study sets, include all flashcards
        return true
      }).length
      
      setFlashcardCount(count)
    }
    
    // Check immediately
    updateFlashcardCount()
    
    // Set up interval to check for changes (since React Flow doesn't expose node change events directly)
    const interval = setInterval(updateFlashcardCount, 300) // Check every 300ms
    
    return () => clearInterval(interval)
  }, [reactFlowInstance, isFlashcard, conversationId, isProjectBoard, projectId])
  
  const flashcardNodes = useMemo(() => {
    if (!isFlashcard || !reactFlowInstance) return []
    const allNodes = reactFlowInstance.getNodes() || []
    // Filter for flashcards in the same context (board/project/study set)
    // If tag is selected, also filter by tag
    return allNodes.filter((node) => {
      const nodeData = node.data as ChatPanelNodeData
      const nodeIsFlashcard = nodeData.promptMessage?.metadata?.isFlashcard === true
      if (!nodeIsFlashcard) return false
      
      // If tag is selected, check if flashcard has that tag (check response message metadata)
      if (selectedTag) {
        const responseMessage = nodeData.responseMessage
        if (responseMessage?.metadata) {
          const metadata = responseMessage.metadata as Record<string, any>
          const studySetIds = (metadata.studySetIds || []) as string[]
          if (!studySetIds.includes(selectedTag)) {
            return false // Skip flashcards without the selected tag
          }
        } else {
          return false // No response message or metadata, can't have the tag
        }
      }
      
      // If tag is selected, include flashcards from all boards (not just current context)
      if (selectedTag) {
        return true // Include all flashcards with the selected tag, regardless of board
      }
      
      // No tag selected - use original context filtering
      // For project boards, check projectId
      if (isProjectBoard && projectId) {
        const nodeIsProjectBoard = isProjectBoardData(node.data)
        if (nodeIsProjectBoard && node.data.projectId === projectId) return true
        return false
      }
      
      // For regular boards, check conversationId
      if (conversationId) {
        if (nodeData.conversationId === conversationId) return true
        return false
      }
      
      // For study sets (no conversationId or projectId), include all flashcards
      return true
    })
  }, [isFlashcard, reactFlowInstance, conversationId, isProjectBoard, projectId, flashcardCount, selectedTag])

  const currentFlashcardIndex = useMemo(() => {
    if (!isFlashcard || flashcardNodes.length === 0) return -1
    return flashcardNodes.findIndex((node) => node.id === id)
  }, [isFlashcard, flashcardNodes, id])

  const hasMultipleFlashcards = flashcardNodes.length > 1
  
  // Check if we're at the last flashcard in the current board
  // If there's only one flashcard in the board, it's both first and last
  const isAtLastFlashcardInBoard = useMemo(() => {
    if (currentFlashcardIndex < 0 || flashcardNodes.length === 0) return false
    return currentFlashcardIndex === flashcardNodes.length - 1
  }, [currentFlashcardIndex, flashcardNodes.length])
  
  // Check if we're at the first flashcard in the current board
  // If there's only one flashcard in the board, it's both first and last
  const isAtFirstFlashcardInBoard = useMemo(() => {
    if (currentFlashcardIndex < 0) return false
    return currentFlashcardIndex === 0
  }, [currentFlashcardIndex])

  // Find the next board with flashcards (all boards if tag selected, otherwise project boards)
  const nextBoardWithFlashcards = useMemo(() => {
    if (!hasFlashcardsInOtherBoards || !conversationId) return null
    
    // If tag is selected, get all boards from projectFlashcards (which includes all boards)
    // Otherwise, use projectBoards
    let boardsToSearch: Array<{ id: string; title: string }> = []
    if (selectedTag) {
      // Get unique board IDs from projectFlashcards
      const uniqueBoardIds = [...new Set(projectFlashcards.map(f => f.boardId))]
      // Fetch board titles (we'll use IDs for now, titles aren't critical for navigation)
      boardsToSearch = uniqueBoardIds.map(id => ({ id, title: '' }))
    } else {
      boardsToSearch = projectBoards
    }
    
    if (!boardsToSearch.length) return null
    
    // Find current board index
    const currentBoardIndex = boardsToSearch.findIndex(b => b.id === conversationId)
    if (currentBoardIndex < 0) return null
    
    // Find next board that has flashcards (with selected tag if tag is selected)
    for (let i = 1; i < boardsToSearch.length; i++) {
      const nextBoardIndex = (currentBoardIndex + i) % boardsToSearch.length
      const nextBoard = boardsToSearch[nextBoardIndex]
      // Check if this board has flashcards (with selected tag if tag is selected)
      const hasFlashcards = projectFlashcards.some(f => f.boardId === nextBoard.id)
      if (hasFlashcards) {
        return nextBoard
      }
    }
    
    return null
  }, [hasFlashcardsInOtherBoards, conversationId, projectBoards, projectFlashcards, selectedTag])
  
  // Find the previous board with flashcards (all boards if tag selected, otherwise project boards)
  const previousBoardWithFlashcards = useMemo(() => {
    if (!hasFlashcardsInOtherBoards || !conversationId) return null
    
    // If tag is selected, get all boards from projectFlashcards (which includes all boards)
    // Otherwise, use projectBoards
    let boardsToSearch: Array<{ id: string; title: string }> = []
    if (selectedTag) {
      // Get unique board IDs from projectFlashcards
      const uniqueBoardIds = [...new Set(projectFlashcards.map(f => f.boardId))]
      boardsToSearch = uniqueBoardIds.map(id => ({ id, title: '' }))
    } else {
      boardsToSearch = projectBoards
    }
    
    if (!boardsToSearch.length) return null
    
    const currentBoardIndex = boardsToSearch.findIndex(b => b.id === conversationId)
    if (currentBoardIndex < 0) return null
    
    // Find previous board that has flashcards (with selected tag if tag is selected)
    for (let i = 1; i < boardsToSearch.length; i++) {
      const previousBoardIndex = currentBoardIndex === 0 
        ? boardsToSearch.length - i 
        : (currentBoardIndex - i + boardsToSearch.length) % boardsToSearch.length
      const previousBoard = boardsToSearch[previousBoardIndex]
      // Check if this board has flashcards (with selected tag if tag is selected)
      const hasFlashcards = projectFlashcards.some(f => f.boardId === previousBoard.id)
      if (hasFlashcards) {
        return previousBoard
      }
    }
    
    return null
  }, [hasFlashcardsInOtherBoards, conversationId, projectBoards, projectFlashcards, selectedTag])

  // Ref to track when navigation is in progress (prevents deselect effect from exiting nav mode)
  const isNavigatingRef = useRef(false)

  // Navigate to previous flashcard (loops to last if at first, or to previous board if available)
  const navigateToPreviousFlashcard = useCallback(() => {
    // Allow navigation even with single flashcard if there are flashcards in other boards
    // If there's only one flashcard in the board, this will just loop to itself (which is fine for the single arrow)
    if ((!hasMultipleFlashcards && !hasFlashcardsInOtherBoards) || !reactFlowInstance || !getSetNodes || currentFlashcardIndex < 0) return
    
    // Mark that we're navigating (prevents deselect effect from exiting nav mode)
    isNavigatingRef.current = true
    
    // Enable flashcard mode to blur non-flashcard content during navigation
    if (flashcardMode !== 'flashcard') {
      setFlashcardMode('flashcard')
    }
    
    // Loop: if at first flashcard, go to last; otherwise go to previous
    // If there's only one flashcard, this will loop to itself (index 0 -> index 0)
    const previousIndex = currentFlashcardIndex === 0 
      ? flashcardNodes.length - 1 
      : currentFlashcardIndex - 1
    const previousNode = flashcardNodes[previousIndex]
    if (previousNode) {
      const setNodes = getSetNodes()
      if (setNodes) {
        // Get current state of the target node
        const allNodes = reactFlowInstance.getNodes()
        const targetNode = allNodes.find(n => n.id === previousNode.id)
        const isTargetExpanded = !targetNode?.data?.isResponseCollapsed
        
        // If target is expanded, collapse it
        if (isTargetExpanded) {
          setNodes((nds: any[]) =>
            nds.map((n: any) => {
              if (n.id === previousNode.id) {
                return { ...n, data: { ...n.data, isResponseCollapsed: true } }
              }
              return n
            })
          )
        }
        
        // Deselect all nodes and select target
        setNodes((nds: any[]) =>
          nds.map((n: any) => ({ ...n, selected: n.id === previousNode.id }))
        )
        // Scroll to the previous flashcard
        reactFlowInstance.fitView({ nodes: [{ id: previousNode.id }], padding: 0.2, duration: 300 })
        
        // Reset navigation flag after a short delay (allows React to process the selection change)
        setTimeout(() => {
          isNavigatingRef.current = false
        }, 100)
      }
    }
  }, [hasMultipleFlashcards, hasFlashcardsInOtherBoards, flashcardNodes, currentFlashcardIndex, reactFlowInstance, getSetNodes, flashcardMode, setFlashcardMode])

  // Navigate to next flashcard (loops to first if at last, or to next board if available)
  const navigateToNextFlashcard = useCallback(() => {
    // Allow navigation even with single flashcard if there are flashcards in other boards
    // If there's only one flashcard in the board, this will just loop to itself (which is fine for the single arrow)
    if ((!hasMultipleFlashcards && !hasFlashcardsInOtherBoards) || !reactFlowInstance || !getSetNodes || currentFlashcardIndex < 0) return
    
    // Mark that we're navigating (prevents deselect effect from exiting nav mode)
    isNavigatingRef.current = true
    
    // Enable flashcard mode to blur non-flashcard content during navigation
    if (flashcardMode !== 'flashcard') {
      setFlashcardMode('flashcard')
    }
    
    // Loop: if at last flashcard, go to first; otherwise go to next
    // If there's only one flashcard, this will loop to itself (index 0 -> index 0)
    const nextIndex = currentFlashcardIndex === flashcardNodes.length - 1 
      ? 0 
      : currentFlashcardIndex + 1
    const nextNode = flashcardNodes[nextIndex]
    if (nextNode) {
      const setNodes = getSetNodes()
      if (setNodes) {
        // Get current state of the target node
        const allNodes = reactFlowInstance.getNodes()
        const targetNode = allNodes.find(n => n.id === nextNode.id)
        const isTargetExpanded = !targetNode?.data?.isResponseCollapsed
        
        // If target is expanded, collapse it
        if (isTargetExpanded) {
          setNodes((nds: any[]) =>
            nds.map((n) => {
              if (n.id === nextNode.id) {
                return { ...n, data: { ...n.data, isResponseCollapsed: true } }
              }
              return n
            })
          )
        }
        
        // Deselect all nodes and select target
        setNodes((nds: any[]) =>
          nds.map((n) => ({ ...n, selected: n.id === nextNode.id }))
        )
        // Scroll to the next flashcard
        reactFlowInstance.fitView({ nodes: [{ id: nextNode.id }], padding: 0.2, duration: 300 })
        
        // Reset navigation flag after a short delay (allows React to process the selection change)
        setTimeout(() => {
          isNavigatingRef.current = false
        }, 100)
      }
    }
  }, [hasMultipleFlashcards, hasFlashcardsInOtherBoards, flashcardNodes, currentFlashcardIndex, reactFlowInstance, getSetNodes, flashcardMode, setFlashcardMode])
  
  // Navigate to next board's first flashcard
  const navigateToNextBoard = useCallback(() => {
    if (!nextBoardWithFlashcards) return
    // Enable flashcard mode to blur non-flashcard content during navigation
    // Pass nav mode and selected tag via URL param to maintain it across board navigation
    if (flashcardMode !== 'flashcard') {
      setFlashcardMode('flashcard')
    }
    // Include selected tag in URL if one is selected
    const tagParam = selectedTag ? `&tag=${selectedTag}` : ''
    router.push(`/board/${nextBoardWithFlashcards.id}?nav=flashcard${tagParam}`)
  }, [nextBoardWithFlashcards, router, flashcardMode, setFlashcardMode, selectedTag])
  
  // Navigate to previous board's last flashcard
  const navigateToPreviousBoard = useCallback(() => {
    if (!previousBoardWithFlashcards) return
    // Enable flashcard mode to blur non-flashcard content during navigation
    // Pass nav mode and selected tag via URL param to maintain it across board navigation
    if (flashcardMode !== 'flashcard') {
      setFlashcardMode('flashcard')
    }
    // Include selected tag in URL if one is selected
    const tagParam = selectedTag ? `&tag=${selectedTag}` : ''
    router.push(`/board/${previousBoardWithFlashcards.id}?nav=flashcard${tagParam}`)
  }, [previousBoardWithFlashcards, router, flashcardMode, setFlashcardMode, selectedTag])

  // Track previous selected state to detect deselection
  const prevSelectedRef = useRef(selected)
  
  // Track if selection is being restored from map click (to prevent nav mode exit)
  const isRestoringSelectionRef = useRef(false)
  
  // Listen for selection restoration events from board-flow
  useEffect(() => {
    const handleRestoring = () => {
      isRestoringSelectionRef.current = true
    }
    const handleRestored = () => {
      isRestoringSelectionRef.current = false
    }
    
    window.addEventListener('restoring-selection-from-map-click', handleRestoring)
    window.addEventListener('selection-restored-from-map-click', handleRestored)
    
    return () => {
      window.removeEventListener('restoring-selection-from-map-click', handleRestoring)
      window.removeEventListener('selection-restored-from-map-click', handleRestored)
    }
  }, [])
  
  // Exit nav mode when flashcard is deselected (user clicks elsewhere, not during arrow navigation or map click restoration)
  useEffect(() => {
    // Only handle deselection for flashcards when nav mode is active
    if (isFlashcard && flashcardMode !== null) {
      // Check if flashcard was selected and is now deselected
      if (prevSelectedRef.current && !selected) {
        // Skip if we're navigating between flashcards (arrow was clicked) or restoring selection from map click
        if (!isNavigatingRef.current && !isRestoringSelectionRef.current) {
          // User clicked elsewhere to deselect - exit nav mode
          setFlashcardMode(null)
        }
      }
    }
    // Update ref for next render
    prevSelectedRef.current = selected
  }, [selected, isFlashcard, flashcardMode, setFlashcardMode])

  // Frame deselect: prune empty TipTap blocks; sole-empty untitled frames → remove the frame
  const prevSelectedEmptyFrameRef = useRef(selected)
  useEffect(() => {
    const wasSelected = prevSelectedEmptyFrameRef.current
    prevSelectedEmptyFrameRef.current = selected
    if (!wasSelected || selected) return // Only fire on selected → unselected
    if (!isBlock || isFlashcard || isProjectBoard) return
    if (isRestoringSelectionRef.current) return

    const ed = promptEditorRef.current
    // Drop blank Enter lines (and other empty textblocks) while keeping real content / atoms
    if (ed && !ed.isDestroyed) pruneEmptyTextblocks(ed)

    // Sole-empty frame deletion — skip page-body / titled / linked pages
    if (isBoardBody) return
    const meta = (promptMessage?.metadata || {}) as Record<string, unknown>
    if (meta.linkedBoardId) return
    if (typeof meta.blockTitle === 'string' && meta.blockTitle.trim()) return
    // Color, resize, shape, rotation, lock, or property type — keep the empty box
    if (
      frameHasChromeProperties(meta, {
        fillColor: data.fillColor,
        borderColor: data.borderColor,
        borderStyle: data.borderStyle,
        isUserResized,
        frameShape,
        rotation,
      })
    ) {
      return
    }

    // Must be exactly one empty textblock after prune (not captureLink / boardLink-only body)
    let soleEmpty = false
    if (ed && !ed.isDestroyed) {
      const doc = ed.state.doc
      const only = doc.childCount === 1 ? doc.firstChild : null
      soleEmpty = !!(
        only &&
        only.isTextblock &&
        (isEmptyTextblock(only) || only.textContent === '/') // `/` spawn dismissed without choosing
      )
    } else {
      soleEmpty = isBlockContentEmpty(promptContent)
    }
    if (!soleEmpty) return

    // Board-flow owns DB + RF removal (same path as Delete / context menu)
    window.dispatchEvent(
      new CustomEvent('tt-delete-empty-frame', { detail: { nodeId: id } })
    )
  }, [
    selected,
    isBlock,
    isFlashcard,
    isProjectBoard,
    isBoardBody,
    promptContent,
    promptMessage?.metadata,
    data.fillColor,
    data.borderColor,
    data.borderStyle,
    isUserResized,
    frameShape,
    rotation,
    id,
  ])

  // Frames hug the longest TipTap line until corner-resized (match `isBlock`, not isBlockMeta alone)
  const usesFitContent = isBlock // Empty user-only bodies without isBlock still hug
  const frameMinW = blockMinFrameWidth(promptContent, false) // Frame fill only — ⋮⋮ lives in select chrome, not inside the fill
  const soleImageContent = isSoleImageBlockHtml(promptContent) // Image contain-fits; must not max-content grow the frame
  const growsWithLine =
    usesFitContent &&
    !isUserResized &&
    Math.abs(frameScale - 1) <= FRAME_SCALE_EPSILON && // Place-scaled frames use explicit box + CSS scale
    !isRowCardAtomHtml(promptContent) && // Row cards live-hug — max-content blows out to icon-row width
    !isDbFrame && // DB tables live-hug from measureDatabaseBlockExtents — max-content clips the table
    !soleImageContent // Image stays inside the existing box (height may limit)
  // Empty unresized: explicit px (not max-content) — CSS % children used to inflate ~120×160 boxes
  const emptyLineHug = growsWithLine && isBlockContentEmpty(promptContent)
  const hasBlockContent = isBlock && !isBlockContentEmpty(promptContent) // Lock only when a content block exists

  // Sole image: pin an explicit box so contain-fit has a height limit (insert must not grow the frame)
  useEffect(() => {
    if (!isBlock || !soleImageContent || pagePreviewOpen) return
    if (resizeDimensions) {
      if (!isUserResized) setIsUserResized(true)
      return
    }
    // Prefer RF node / intrinsic — panel offset collapses while sole-image content is flex-filling
    const node = getNodes?.()?.find((n: { id: string }) => n.id === id) as
      | { style?: { width?: number | string; height?: number | string }; width?: number; height?: number }
      | undefined
    const styleW =
      typeof node?.style?.width === 'number'
        ? node.style.width
        : parseFloat(String(node?.style?.width ?? '')) || 0
    const styleH =
      typeof node?.style?.height === 'number'
        ? node.style.height
        : parseFloat(String(node?.style?.height ?? '')) || 0
    const w = Math.max(
      frameMinW,
      Math.round(styleW || node?.width || intrinsicSize.width || BLOCK_LOCKED_MIN_W)
    )
    const h = Math.max(
      BLOCK_MIN_FRAME_H,
      Math.round(styleH || node?.height || intrinsicSize.height || Math.round(w * 0.75))
    )
    const box = { width: w, height: h }
    setResizeDimensions(box)
    setIsUserResized(true)
    setIntrinsicMeasured(true)
    setIntrinsicSize((prev) =>
      Math.abs(prev.width - w) <= 1 && Math.abs(prev.height - h) <= 0.02 ? prev : { width: w, height: h }
    )
  }, [
    isBlock,
    soleImageContent,
    pagePreviewOpen,
    resizeDimensions,
    isUserResized,
    frameMinW,
    intrinsicSize.width,
    intrinsicSize.height,
    id,
    getNodes,
  ])

  // Constant screen size for selection chrome via live CSS `--tt-board-zoom`.
  // React still uses frameUiScale for gutters / stack lines (updates after settle).
  const frameUiScale = screenChromeScale
  const frameLineW = Math.max(0.25, frameUiScale) // Shape select stroke (square ring uses CSS var)
  const wrapActive =
    isBlock && frameTextWrap && isUserResized && !!resizeDimensions // Soft-wrap in a fixed width — stays on while board preview is open so wrap +'s still work
  const wrapUnlocked = wrapActive && frameUnlocked // Unlocked wrap: fixed width + free/clip height
  const wrapApplied =
    wrapActive &&
    wrapColWidth != null &&
    !(wrapLineDraggingRef.current && wrapColWidth >= (nowrapCapRef.current ?? Infinity) - 0.02) // Mid-drag at the off edge = light blue
  const clipUnlocked =
    isBlock &&
    frameUnlocked &&
    !frameTextWrap &&
    isUserResized &&
    !!resizeDimensions // Free nowrap contain-fit — stays on while board preview is open so resize +'s still work
  const freePreviewCenter = Boolean(
    isBlock && // Frames only — chat panels keep their flow
      frameUnlocked && // Free mode (unlocked) — locked hugs, nothing to center
      isUserResized && // User-sized box can be larger than the title + preview
      !!resizeDimensions && // Needs a saved box to center within
      pagePreviewOpen && // Only when the in-frame board preview is showing
      !wrapActive && // Wrap owns the column — do not also flex-center
      !clipUnlocked && // Resize +'s own contain-fit — do not also flex-center
      !frameShape && // Silhouettes already center via shapeCenterContent
      !soleImageContent && // Images contain-fit on their own
      !isDbFrame && // DB tables hug their columns
      !isRowCardAtomHtml(promptContent) // Row cards hug their icon row
  ) // Free + open preview without wrap/clip: park title + preview mid-frame like free text
  // Silhouettes clip to a center cross / diamond — hugged text must sit in the middle, not top-left
  const shapeCenterContent = Boolean(
    frameShape &&
      isBlock &&
      !isDbFrame &&
      !isRowCardAtomHtml(promptContent)
  ) // Center in the silhouette (inflate assumes this) — preview included
  const liveAdjust =
    isResizingRef.current && liveResizeBoxRef.current ? liveResizeBoxRef.current : null // Mid-adjust sample
  const renderFrameScale = liveAdjust?.scale ?? frameScale // Live scale so hug/spacer match the drag
  const glyphHugSize = scaledFrameSize(
    shapeFitContentBox(intrinsicSize, frameShape, !frameUnlocked || pagePreviewOpen), // Preview: inflate silhouette even if unlocked
    renderFrameScale,
    1, // Fit-to-text: hug glyphs — FRAME_RESIZE_MIN (40) left empty pad with text stuck top-left
    1
  ) // Scaled content (no phantom border)
  const lockedWrapCol = wrapActive && !frameUnlocked && wrapColWidth != null && !frameShape // Fit-to-content wrap
  const huggedSize =
    lockedWrapCol
      ? { ...glyphHugSize, width: wrapColWidth! * renderFrameScale } // Fit wrap hugs the column — the line stays where it was dropped (no snap to the widest line)
      : glyphHugSize
  // Stamp before effects: RF push reads this so blue selection matches peach (not stale tall dims)
  // Sole image: sticky resizeDimensions owns the box — never stamp text hug over it
  if (
    isBlock &&
    intrinsicMeasured &&
    !frameUnlocked &&
    !isDbFrame &&
    !isRowCardAtomHtml(promptContent) &&
    !soleImageContent &&
    !isResizingRef.current
  ) {
    liveLockedContentRef.current = { width: huggedSize.width, height: huggedSize.height } // Wrap too — height hugs the stack like nowrap
  } else {
    liveLockedContentRef.current = null
  }
  // After paint: RF node box = painted panel box (not an estimated hug). Fixes blue>peach
  // when place-seed / stale dims left the RF node taller than the fill.
  useLayoutEffect(() => {
    if (!isBlock || frameUnlocked || !panelRef.current) return
    if (!intrinsicMeasured || isDbFrame || isRowCardAtomHtml(promptContent)) return
    if (isSoleImageBlockHtml(promptContent)) return // Sticky image box — don't snap RF/panel to text hug
    if (isResizingRef.current || isRotatingRef.current || wrapLineDraggingRef.current || dragging) return // Wrap-line drag owns the box live — a lagging paint read made the line jump
    // Need an explicit RF box path (place-scale / resized / live hug)
    if (!isUserResized && Math.abs(frameScale - 1) <= FRAME_SCALE_EPSILON) return

    const panel = panelRef.current
    const boxW = Math.round(panel.offsetWidth)
    const boxH = Math.round(panel.offsetHeight)
    if (boxW < 1 || boxH < 1) return

    const prev = lastPushedBoxRef.current
    if (
      prev &&
      Math.abs(prev.w - boxW) <= 0.5 &&
      Math.abs(prev.h - boxH) <= 0.5 &&
      Math.abs(prev.rot - rotation) < 0.05
    ) {
      return
    }
    lastPushedBoxRef.current = { w: boxW, h: boxH, rot: rotation }

    // Persist content size (strip L/R select chrome) so AABB math stays on the fill
    const chromeX = showFrameChrome ? adjustChromeXRef.current * 2 : 0
    const chromeY = showFrameChrome
      ? adjustChromeYTopRef.current + adjustChromeYBottomRef.current
      : 0 // Strip T/B chrome — wrapping used to bake pad into fill height
    const contentW = Math.max(1, boxW - chromeX)
    const contentH = Math.max(1, boxH - chromeY) // Fill only — same as nowrap hug
    liveLockedContentRef.current = { width: contentW, height: contentH }
    setResizeDimensions((prevDims) => {
      if (
        prevDims &&
        Math.abs(prevDims.width - contentW) <= 0.5 &&
        Math.abs(prevDims.height - contentH) <= 0.5
      ) {
        return prevDims
      }
      return { width: contentW, height: contentH }
    })
    if (!isUserResized) setIsUserResized(true)

    const setNodesFunc = getSetNodes()
    if (!setNodesFunc) return
    setNodesFunc((nodes: any[]) => {
      let changed = false
      const next = nodes.map((node: any) => {
        if (node.id !== id) return node
        const styleW =
          typeof node.style?.width === 'number' ? node.style.width : parseFloat(node.style?.width)
        const styleH =
          typeof node.style?.height === 'number'
            ? node.style.height
            : parseFloat(node.style?.height)
        if (
          Number.isFinite(styleW) &&
          Number.isFinite(styleH) &&
          Math.abs(styleW - boxW) <= 0.5 &&
          Math.abs(styleH - boxH) <= 0.5
        ) {
          return node
        }
        changed = true
        return {
          ...node,
          width: boxW,
          height: boxH,
          style: { ...node.style, width: boxW, height: boxH },
        }
      })
      return changed ? next : nodes
    })
    updateNodeInternals(id)
  }, [
    isBlock,
    frameUnlocked,
    intrinsicMeasured,
    isDbFrame,
    promptContent,
    pagePreviewOpen,
    dragging,
    isUserResized,
    frameScale,
    huggedSize.width,
    huggedSize.height,
    showFrameChrome,
    selected,
    rotation,
    id,
    getSetNodes,
    updateNodeInternals,
  ])
  const scaledDbSize = databaseExtents
    ? scaledFrameSize(
        shapeFitContentBox(databaseExtents, frameShape, !frameUnlocked || pagePreviewOpen), // Preview: grow the silhouette
        renderFrameScale, // Live scale while adjusting
        1,
        1
      )
    : null
  const contentVisualW = scaledDbSize?.width ?? huggedSize.width // Locked wrap: widest line (column while dragging)
  const contentVisualH = scaledDbSize?.height ?? huggedSize.height
  // Fit-to-text radius scales with (box / natural); stays 0 while FRAME_CORNER_RADIUS is 0.
  const radiusFillW = Math.max(1, liveAdjust?.width ?? resizeDimensions?.width ?? contentVisualW)
  const radiusFillH = Math.max(1, liveAdjust?.height ?? resizeDimensions?.height ?? contentVisualH)
  const radiusScale =
    !frameShape && intrinsicSize.width >= 1 && intrinsicSize.height >= 1
      ? Math.max(
          FRAME_SCALE_EPSILON,
          Math.min(radiusFillW / intrinsicSize.width, radiusFillH / intrinsicSize.height)
        )
      : chromeScale // No measure yet
  const frameCornerRadius = frameShape ? 0 : FRAME_CORNER_RADIUS * radiusScale
  // Free shrink floor = FRAME_RESIZE_MIN (contain-fit shrinks the text below its hug); smaller content keeps its own hug.
  const freeContentMinW = Math.max(1, Math.min(Math.ceil(contentVisualW), FRAME_RESIZE_MIN)) // Cap floor at 40 so wide text can shrink
  const freeContentMinH = Math.max(1, Math.min(contentVisualH, FRAME_RESIZE_MIN)) // Cap floor at 40 so tall text can shrink
  freeContentMinRef.current = { width: freeContentMinW, height: freeContentMinH } // handleResize reads this
  const freeOuterMinW = Math.ceil(
    freeContentMinW + (showFrameChrome ? adjustChromeX * 2 : 0)
  ) // RF control is the outer box
  const freeOuterMinH = Math.ceil(freeContentMinH + adjustChromeYTop + adjustChromeYBottom)
  // Sole-image: fill sticky resizeDimensions directly — CSS scale + unscaled px caused overflow + RO loops
  const applyFrameScale =
    isBlock &&
    Math.abs(renderFrameScale - 1) > FRAME_SCALE_EPSILON &&
    !soleImageContent // Place + locked resize — CSS scale text/glyphs (not images)
  // Place seeds isUserResized; if only frameScale landed, still treat as resized so hug/box track scale
  const scaledAsResized = isUserResized || applyFrameScale
  const scaledLayoutW = Math.ceil(contentVisualW) // Visual content width (full table when DB)
  // Exact scaled height — Math.round left ≤0.5px that top-left scale dumped under the block
  const scaledLayoutH = contentVisualH
  const unlockedResized = wrapUnlocked || clipUnlocked // Free-resized frame (wrap or nowrap)
  // Rounded custom borders paint on the fill shell — not the square outer panel
  const paintBorderOnFillShell = Boolean(
    isBlock && !frameShape && Math.abs(rotation) <= 0.5 && !isBorderNone && resolvedBorderColor
  )
  // Selected/adjust chrome forces borderWidth 0 — do not subtract a phantom 2px or content clips
  // and the blue box looks larger than the block (⋮⋮ / text sit above the left connection mid).
  const panelBorderBox =
    showAdjustFrame ||
    showDragBorderOnly ||
    frameShape ||
    Math.abs(rotation) > 0.5 ||
    isBorderNone ||
    showEmptyFrameBorder ||
    paintBorderOnFillShell // Inset on fill shell — not part of the panel box
      ? 0
      : 2 * FRAME_BORDER_WEIGHT // Fixed stroke — ignore stored borderWeight variation
  const liveBox = liveAdjust ?? resizeDimensions // Mid-adjust sample wins over last commit
  const unlockedInnerW = liveBox ? Math.max(1, liveBox.width - panelBorderBox) : null
  const unlockedInnerH = liveBox ? Math.max(1, liveBox.height - panelBorderBox) : null
  // Fit-to-text wrap column — free wrap may tighten, never lay out wider than this
  const fitWrapCol =
    wrapActive ? Math.max(1, wrapColWidth ?? Math.round(intrinsicSize.width)) : null
  if (wrapUnlocked && unlockedInnerW != null) {
    if (
      wrapContainBoxWRef.current != null &&
      Math.abs(wrapContainBoxWRef.current - unlockedInnerW) > 2
    ) {
      wrapContainHRef.current = null // New wrap column — remasure after this paint
    }
    wrapContainBoxWRef.current = unlockedInnerW // Track the box this height belongs to
  } else if (!wrapUnlocked) {
    wrapContainHRef.current = null // Unwrap / lock — drop the wrap-contain basis
    wrapContainBoxWRef.current = null
  }
  const wrapStackH = wrapContainHRef.current ?? intrinsicSize.height // Frozen wrap height, else live
  const fitBoxW =
    unlockedInnerW != null
      ? Math.min(contentFitBox?.width ?? unlockedInnerW, unlockedInnerW) // Grey lines, clamped to the fill
      : null
  const fitBoxH =
    unlockedInnerH != null
      ? Math.min(contentFitBox?.height ?? unlockedInnerH, unlockedInnerH)
      : null
  const heldGap = wrapGapRef.current // Released wrap gap — inset lines must not grow back onto the + box
  const contentPaintForGap = Math.max(1, (fitWrapCol ?? 1) * renderFrameScale) // Column at place scale, before the wrap-line fit
  const wrapFillsBox =
    heldGap != null && fitBoxW != null
      ? heldGap.width >= fitBoxW - 1.5 // Only grow when the released lines sit on the + box
      : fitBoxW == null || fitWrapCol == null || fitWrapCol * renderFrameScale >= fitBoxW - 1.5 // Inset lines keep their baked shrink
  const rawFreeFitScale =
    wrapUnlocked && fitBoxW != null && fitBoxH != null && fitWrapCol != null
      ? wrapFillsBox
        ? freeContentFitScale(
            fitBoxW,
            fitBoxH,
            fitWrapCol * renderFrameScale, // Lines on the + box — contain this stack inside it
            Math.max(1, wrapStackH * renderFrameScale), // Wrapped visual height
            frameShape, // Contain inside the silhouette, not the rect
            true // May grow past fit-to-text while the lines sit on the + box
          )
        : Math.max(
            FRAME_SCALE_EPSILON,
            (heldGap?.width ?? contentPaintForGap) / contentPaintForGap // Inset lines — glyphs fit that gap without another forced drag
          )
      : unlockedResized && fitBoxW != null && fitBoxH != null
        ? freeContentFitScale(fitBoxW, fitBoxH, contentVisualW, contentVisualH, frameShape, contentFitBox != null)
        : 1
  // Free wrap uses the raw contain — below 0.5 and above fit-to-text. A floor here snapped the glyphs back up.
  const liveFreeFitScale = rawFreeFitScale
  // During wrap-line drag, onMove writes freeFitScaleRef (uncapped contain into the press-time box).
  // Replacing it here with a fit against the shrinking peach pinned the scale at 1.
  if (!wrapLineDraggingRef.current) freeFitScaleRef.current = liveFreeFitScale
  const freeFitScale = wrapLineDraggingRef.current ? freeFitScaleRef.current : liveFreeFitScale
  const paintScale = renderFrameScale * freeFitScale // Place/lock × free contain (phone shrink is on the outer wrapper)
  paintScaleRef.current = paintScale // Wrap-line drag reads this — fill-local X / paint = wrapColWidth
  // After wrap / zoom / scale: park bars on the painted PM, not wrapCol×paint (that drifted after zoom).
  useLayoutEffect(() => {
    if (!wrapActive && !frameUnlocked) return // Locked unapplied = fill edges; free still measures so bars stay on wrap-line space
    const measure = () => {
      if (wrapLineDraggingRef.current) return // onMove owns bar XY with frozen contain — layout effect must not fight it
      const fill = wrapLineFillRef.current
      const cf = contentFitRef.current
      if (!fill || !cf || !selected) return // Unmounted
      const fillW = fill.offsetWidth // Wrap-line space when unapplied — content can be narrower
      const held = wrapActive ? wrapGapRef.current : null // Released gap wins — the content box jumps to the word or the fill
      if (!wrapActive) wrapGapRef.current = null // Unwrap clears the hold
      if (held) {
        const w = Math.min(held.width, fillW) // Never wider than the frame
        const pad = BLOCK_FRAME_PAD_X * paintScale // Same side gap the line render uses
        const left =
          held.align === 'right'
            ? Math.max(0, fillW - pad - w)
            : held.align === 'left'
              ? pad
              : (fillW - w) / 2 // Stay centred in the fill, including after a resize
        setWrapPaintBox((prev) =>
          prev && Math.abs(prev.left - left) < 0.25 && Math.abs(prev.width - w) < 0.25 ? prev : { left, width: w }
        )
        return
      }
      const next = wrapActive
        ? wrapColumnInFill(fill, cf) // Applied: the constraint column (stays even when glyphs are shorter)
        : contentFitBox
          ? {
              left: (fillW - Math.min(contentFitBox.width, fillW)) / 2, // Unapplied at the +'s — same as frame-edge park
              width: Math.min(contentFitBox.width, fillW),
            }
          : { left: 0, width: fillW } // Unapplied, no + box: fill edges — wrap is settable between content and here
      if (!next) return
      setWrapPaintBox((prev) =>
        prev && Math.abs(prev.left - next.left) < 0.25 && Math.abs(prev.width - next.width) < 0.25
          ? prev
          : next
      )
    }
    measure() // Before paint
    const raf = requestAnimationFrame(measure) // After TipTap's useEffect flips data-single-line (reflow)
    return () => cancelAnimationFrame(raf)
  }, [
    selected,
    rfZoom,
    wrapColWidth,
    paintScale,
    frameTextWrap,
    wrapActive,
    frameUnlocked,
    unlockedInnerW,
    unlockedInnerH,
    contentFitBox,
    intrinsicSize.width,
    promptContent,
    wrapMeasureTick, // Post-drag settle
    frameAlignX, // Nowrap glyphs park on the aligned edge
    pagePreviewOpen, // Preview card changes the painted column the +'s park on
  ])
  const applyPaintScale =
    isBlock && !soleImageContent && Math.abs(paintScale - 1) > FRAME_SCALE_EPSILON // Free contain or place/lock scale
  const showClipPreview = false // Free mode contain-fits; no hover-unclip peek
  // Wrap column is the drag line — free max is the painted + box (not the frame)
  const wrapPlusMaxCol =
    wrapActive && frameUnlocked && wrapColWidth != null
      ? (() => {
          const box = contentFitBox // Stored +'s only — painted default sits on the column (capping on it reflowed the text)
          if (!box) return wrapColWidth // +'s on the fill — keep the stored column
          return Math.min(
            wrapColWidth,
            Math.max(BLOCK_THREE_CHARS_W, box.width / Math.max(FRAME_SCALE_EPSILON, paintScale)) // Unscaled col that paints to the + width
          )
        })()
      : wrapColWidth
  const wrapContentWidth =
    wrapActive && wrapPlusMaxCol != null // Locked + free: same column; free resize must not steal wrap
      ? wrapPlusMaxCol
      : null
  // Free nowrap center/right: unscaled fill so text-align can park each line on the frame
  const freeAlignCol =
    clipUnlocked && !soleImageContent && unlockedInnerW != null && frameAlignX !== 'left'
      ? Math.max(1, unlockedInnerW / Math.max(FRAME_SCALE_EPSILON, paintScale))
      : null
  const freeLeftStack =
    unlockedResized &&
    frameAlignX === 'left' &&
    !soleImageContent &&
    !isDbFrame &&
    !isRowCardAtomHtml(promptContent) // Default left: hug the widest block, then center that column
  // Stamp wrap height only while laid out at the fit column
  if (wrapUnlocked && wrapContentWidth != null && fitWrapCol != null && Math.abs(wrapContentWidth - fitWrapCol) <= 2) {
    wrapContainHRef.current = intrinsicSize.height // Fit-column wrap stack
  }
  // Frames start at plain-text hug; chat/flashcards use their fixed starting widths
  const initialWidth = isFlashcard ? 600 : (usesFitContent ? BLOCK_LOCKED_MIN_W : 768)
  const [panelWidthToUse, setPanelWidthToUse] = useState(initialWidth)
  // Ref to track current width (avoids stale closures in callbacks)
  const panelWidthRef = useRef(initialWidth)
  // Track maximum width panel has been (so it doesn't grow beyond current width)
  const [maxPanelWidth, setMaxPanelWidth] = useState(isFlashcard ? 600 : (usesFitContent ? 100000 : 768))
  // Track if panel has been manually shrunk (so zoom effect doesn't override it)
  const [isManuallyShrunk, setIsManuallyShrunk] = useState(false)
  // Track if note panel uses fit-content (to prevent zoom-based width updates)
  const noteInitializedRef = useRef(usesFitContent)

  // Width only cares whether zoom is at or below 100%, so subscribe to that *boolean*: this used to be
  // `setInterval(…, 100)` per frame, i.e. 10 setState calls per second per frame (330/s on a 33-frame
  // board). During a wheel zoom the polled value really changed, so every frame re-rendered 10×/s —
  // 642 frame renders for one 1.6s gesture. A boolean selector re-renders only when 100% is crossed.
  const zoomAtMostOne = useStore((s) => (s.transform[2] ?? 1) <= 1)

  // Recompute panel width when the 100% threshold, the prompt-box width, or the shrink flags change
  useEffect(() => {
    if (!reactFlowInstance) return

    const updateZoomAndWidth = () => {
      const targetMaxWidth = isFlashcard ? 600 : 768

      // Don't override manually shrunk width - only update if not manually shrunk
      if (isManuallyShrunk) {
        return // Keep the manually set width
      }
      
      // Note panels use fit-content and should not be affected by zoom-based width updates
      // Let the content determine their width naturally
      if (noteInitializedRef.current) {
        return // Keep note panel at fit-content width
      }

      // Use dynamic width when:
      // 1. Zoom is 100% or less (<= 1.0)
      // 2. AND panel width (from context) is >= prompt box width (so panels can shrink with prompt box)
      // This allows panels to shrink with prompt box when zoomed out or at 100%
      if (zoomAtMostOne && panelWidth > 0) {
        // Use the smaller of panelWidth (from prompt box) or targetMaxWidth
        // This ensures panels shrink when prompt box shrinks, but don't exceed targetMaxWidth
        setPanelWidthToUse(Math.min(panelWidth, targetMaxWidth))
      } else {
        setPanelWidthToUse(targetMaxWidth)
      }
    }

    updateZoomAndWidth()
  }, [reactFlowInstance, panelWidth, isManuallyShrunk, zoomAtMostOne, isFlashcard])

  // Track zoom level when nav mode started (to detect zoom out)
  const navModeStartZoomRef = useRef<number | null>(null)
  const [isZoomedOutInNavMode, setIsZoomedOutInNavMode] = useState(false)
  
  // Track zoom changes in nav mode to detect zoom out
  useEffect(() => {
    if (!reactFlowInstance) return
    
    // Reset when nav mode is exited
    if (flashcardMode === null) {
      navModeStartZoomRef.current = null
      setIsZoomedOutInNavMode(false)
      return
    }
    
    // Reset zoom reference when board changes (conversationId changes)
    // This ensures zoom detection is recalculated for the new board
    // Wait a bit for fitView to complete (if called) before starting zoom tracking
    navModeStartZoomRef.current = null
    setIsZoomedOutInNavMode(false)
    
    let intervalId: NodeJS.Timeout | null = null
    
    // Delay before starting zoom tracking to allow fitView to complete
    // fitView duration is 300ms, so wait 400ms to be safe
    const startTrackingTimeout = setTimeout(() => {
      const checkZoomChange = () => {
        const currentZoomLevel = reactFlowInstance.getViewport().zoom
        
        // Store the zoom level when nav mode first started (or when board changed)
        if (navModeStartZoomRef.current === null) {
          navModeStartZoomRef.current = currentZoomLevel
          // Check initial zoom - if less than 200%, unblur non-flashcard content
          if (currentZoomLevel < 2.0) {
            setIsZoomedOutInNavMode(true)
          } else {
            setIsZoomedOutInNavMode(false)
          }
          return
        }
        
        // After board switch, unblur if zoom is less than 200% (2.0)
        // This allows users to see all flashcards when zoomed out
        if (currentZoomLevel < 2.0) {
          // Zoom is less than 200% - show all flashcards but keep non-flashcards blurred
          setIsZoomedOutInNavMode(true)
        } else {
          // Zoom is 200% or more - return to single flashcard focus
          setIsZoomedOutInNavMode(false)
        }
      }
      
      // Check zoom changes periodically
      intervalId = setInterval(checkZoomChange, 200)
    }, 400)
    
    return () => {
      clearTimeout(startTrackingTimeout)
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [reactFlowInstance, flashcardMode, conversationId])

  // Update max width when panel width increases (so it doesn't grow beyond current width)
  useEffect(() => {
    if (panelWidthToUse > maxPanelWidth) {
      setMaxPanelWidth(panelWidthToUse)
    }
    // Keep ref in sync with state
    panelWidthRef.current = panelWidthToUse
  }, [panelWidthToUse, maxPanelWidth])

  // Keep measured width on the DOM after re-renders (chat/flashcards + user-resized blocks)
  useEffect(() => {
    if (pagePreviewOpen) return
    if (growsWithLine) {
      // Unresized: empty → one-line hug px; typed → max-content (clear stale inline sizes)
      const panel = panelRef.current
      if (panel) {
        if (isBlockContentEmpty(promptContent)) {
          const w = `${frameMinW}px`
          const h = `${BLOCK_MIN_FRAME_H}px`
          if (panel.style.width !== w) panel.style.width = w
          if (panel.style.height !== h) panel.style.height = h
        } else {
          if (panel.style.width !== 'max-content') panel.style.width = 'max-content'
          if (panel.style.height !== 'fit-content') panel.style.height = 'fit-content'
        }
      }
      return
    }
    if (isUserResized && resizeDimensions) return // Explicit box owns width
    // Row/DB cards: layoutBox live-hug owns width — never stomp with panelWidthRef.
    if (isBlock && (isRowCardAtomHtml(promptContent) || isDbFrame)) return
    if (panelRef.current && panelWidthRef.current) {
      const next = `${panelWidthRef.current}px`
      if (panelRef.current.style.width !== next) panelRef.current.style.width = next
    }
  })

  // Horizontal chrome around TipTap text: L/R content pads (+ border buffer); ⋮⋮ is outside the fill
  const blockWidthChrome = useCallback(() => {
    // Blocks: BLOCK_FRAME_PAD_X×2 + border (2) + buffer (10)
    // Non-blocks: px-3 (24) + border (2) + buffer (10) + p-1 (8)
    return usesFitContent ? BLOCK_FRAME_PAD_X * 2 + 2 + 10 : 24 + 2 + 10 + 8
  }, [usesFitContent])

  // Measure longest TipTap line as nowrap (Enter = new block, not wrap)
  const measureTextWidthFromContent = useCallback((content: string) => {
    if (!content || !panelRef.current) return null

    const panelElement = panelRef.current
    const proseElement = panelElement.querySelector('.prose') as HTMLElement
    const stylesSource = proseElement || panelElement
    const computedStyle = window.getComputedStyle(stylesSource)

    const tempDiv = document.createElement('div')
    tempDiv.style.position = 'absolute'
    tempDiv.style.visibility = 'hidden'
    tempDiv.style.whiteSpace = 'nowrap' // One visual line
    tempDiv.style.fontSize = computedStyle.fontSize || '16px'
    tempDiv.style.fontFamily = computedStyle.fontFamily || 'inherit'
    tempDiv.style.fontWeight = computedStyle.fontWeight || 'normal'
    tempDiv.style.lineHeight = computedStyle.lineHeight || 'normal'
    tempDiv.style.letterSpacing = computedStyle.letterSpacing || 'normal'
    document.body.appendChild(tempDiv)

    const tempHtml = document.createElement('div')
    tempHtml.innerHTML = content
    // Measure each block separately — concatenated text would over-widen multi-line cards
    const blocks = tempHtml.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote')
    let maxTextWidth = 0
    if (blocks.length > 0) {
      blocks.forEach((el) => {
        const line = el.textContent?.replace(/\u00a0/g, ' ') || ''
        if (!line.trim()) return
        tempDiv.textContent = line
        maxTextWidth = Math.max(maxTextWidth, tempDiv.offsetWidth)
      })
    } else {
      const plain = (tempHtml.textContent || '').replace(/\u00a0/g, ' ')
      for (const line of plain.split(/\n/)) {
        if (!line.trim()) continue
        tempDiv.textContent = line
        maxTextWidth = Math.max(maxTextWidth, tempDiv.offsetWidth)
      }
    }
    document.body.removeChild(tempDiv)

    if (maxTextWidth === 0) return null
    const totalWidth = maxTextWidth + blockWidthChrome()
    // Blocks: no wrap cap; chat/flashcards keep maxPanelWidth
    const cap = usesFitContent ? Number.POSITIVE_INFINITY : maxPanelWidth
    return Math.max(200, Math.min(totalWidth, cap))
  }, [maxPanelWidth, usesFitContent, blockWidthChrome])

  // Expand/shrink panel width from longest line — sync DOM before React paint to avoid wrap
  const expandPanelWidth = useCallback((newContent?: string) => {
    if (pagePreviewOpen) return
    // Row/DB cards live-hug from intrinsic measure — concatenated textContent here is bogus wide.
    if (
      isRowCardAtomHtml(newContent !== undefined ? newContent : promptContent) ||
      hasDatabaseBlockHtml(newContent !== undefined ? newContent : promptContent)
    ) {
      return
    }
    // Unresized blocks: empty → one-line hug px; typed → max-content (don’t force chat widths)
    if (growsWithLine) {
      if (panelRef.current) {
        const html = newContent !== undefined ? newContent : promptContent
        if (isBlockContentEmpty(html)) {
          panelRef.current.style.width = `${frameMinW}px`
          panelRef.current.style.height = `${BLOCK_MIN_FRAME_H}px`
        } else {
          panelRef.current.style.width = 'max-content'
          panelRef.current.style.height = 'fit-content'
        }
      }
      return
    }
    if (isUserResized && resizeDimensions) return // Fixed resized box

    const promptToMeasure = newContent !== undefined ? newContent : promptContent
    const promptWidth = measureTextWidthFromContent(promptToMeasure) || 0
    const responseWidth = measureTextWidthFromContent(responseContent) || 0
    const minWidth = isFlashcard ? 300 : 200
    const measuredTotalWidth = Math.max(promptWidth, responseWidth, minWidth)
    if (!measuredTotalWidth) return

    const currentWidth = panelWidthRef.current
    // Chat panels: only grow; flashcards: grow and shrink with content
    const shouldUpdate = isRegularChatPanel
      ? measuredTotalWidth > currentWidth
      : measuredTotalWidth !== currentWidth
    if (!shouldUpdate) return

    const newWidth = Math.min(measuredTotalWidth, maxPanelWidth)

    if (panelRef.current) {
      panelRef.current.style.width = `${newWidth}px` // Sync before paint
    }
    panelWidthRef.current = newWidth
    setPanelWidthToUse(newWidth)
    setIsManuallyShrunk(true)
  }, [
    measureTextWidthFromContent,
    maxPanelWidth,
    isFlashcard,
    isRegularChatPanel,
    promptContent,
    responseContent,
    isUserResized,
    resizeDimensions,
    pagePreviewOpen,
    growsWithLine,
    frameMinW,
  ])

  // Shrink block/flashcard to longest line on blur
  const handleEditorBlur = useCallback(() => {
    if (isRegularChatPanel) return // Chat stays wide
    if (isRowCardAtomHtml(promptContent) || isDbFrame) return // Row/DB cards hug via intrinsic measure
    if ((isUserResized && resizeDimensions) || pagePreviewOpen) return

    setTimeout(() => {
      const promptWidth = measureTextWidthFromContent(promptContent) || 0
      const responseWidth = measureTextWidthFromContent(responseContent) || 0
      const minWidth = isFlashcard ? 300 : 200
      const measuredWidth = Math.max(promptWidth, responseWidth, minWidth)
      const currentWidth = panelWidthRef.current
      if (measuredWidth < currentWidth) {
        if (panelRef.current) {
          panelRef.current.style.width = `${measuredWidth}px`
        }
        panelWidthRef.current = measuredWidth
        setPanelWidthToUse(measuredWidth)
        setIsManuallyShrunk(true)
      }
    }, 100)
  }, [
    measureTextWidthFromContent,
    promptContent,
    responseContent,
    isFlashcard,
    isRegularChatPanel,
    isUserResized,
    resizeDimensions,
    pagePreviewOpen,
  ])

  // Sync single text body when underlying messages change (plain-merge prompt + response)
  // Force-sync only when Turn into changes metadata.blockType — not on every keystroke.
  // (All blocks have blockType: 'text'; treating that as “always remote” wiped local typing.)
  const remoteBlockType = promptMessage?.metadata?.blockType as string | undefined
  const prevRemoteBlockTypeRef = useRef(remoteBlockType) // Detect Turn into flips only
  const prevPromptMessageIdRef = useRef(promptMessage?.id) // Reset autofocus only on new message
  useEffect(() => {
    const blockTypeChanged = remoteBlockType !== prevRemoteBlockTypeRef.current
    prevRemoteBlockTypeRef.current = remoteBlockType

    if (isProjectBoard) {
      if (data.boardTitle !== promptContent && !promptHasChanges) {
        setPromptContent(data.boardTitle)
      }
    } else {
      const responseHtml = responseMessage?.content
        ? formatResponseContent(responseMessage.content)
        : ''
      let merged = mergePanelHtml(promptMessage?.content, responseHtml)
      // Legacy: sole databaseBlock → boardLink for pages only (DB frames keep the table NodeView)
      const meta = (promptMessage?.metadata || {}) as Record<string, unknown>
      const linkedId = getLinkedBoardId(meta)
      if (linkedId && meta.notionObject !== 'database' && isSoleDatabaseBlockContent(merged)) {
        const iconMeta = meta.notionIcon as { type?: string; emoji?: string } | null
        const emoji = iconMeta?.type === 'emoji' && iconMeta.emoji ? iconMeta.emoji : null
        merged =
          migrateSoleDatabaseBlockToBoardLink(merged, {
            boardId: linkedId,
            title: typeof meta.blockTitle === 'string' ? meta.blockTitle : null,
            icon: emoji,
          }) || merged
      }
      // When this frame has a pending AI edit, always show session display
      // (proposed, or original when eye preview is on) — never clobber with raw server HTML.
      if (promptMessage?.id && isFramePending(promptMessage.id)) {
        const next = displayContentFor(promptMessage.id, merged)
        if (next !== promptContent) setPromptContent(next)
      } else if (promptMessage?.id && justRestoredByMessage[promptMessage.id] !== undefined) {
        // Sticky Save/Remove content — ignore stale cache until it catches up
        const sticky = justRestoredByMessage[promptMessage.id]
        if (sticky !== promptContent) setPromptContent(sticky)
      } else if (htmlHasNotionSync(merged) && promptMessage?.id) {
        // Orphan grey marks from a raced Keep mine — heal UI; persist at most once per dirty blob
        const cleaned = sanitizeNotionSyncHtml(merged)
        if (cleaned !== promptContent) setPromptContent(cleaned)
        const healKey = `${promptMessage.id}:${cleaned.length}:${cleaned.slice(0, 48)}`
        if (healedNotionMarksRef.current !== healKey) {
          healedNotionMarksRef.current = healKey
          const mid = promptMessage.id
          const patchContent = (old: unknown) => {
            if (!Array.isArray(old)) return old
            return old.map(
              (m: { id?: string; content?: string; metadata?: Record<string, unknown> }) =>
                m?.id === mid
                  ? {
                      ...m,
                      content: cleaned,
                      metadata: {
                        ...(m.metadata || {}),
                        notionSyncReview: false,
                        notionUpdatesPending: false,
                      },
                    }
                  : m
            )
          }
          if (conversationId) {
            queryClient.setQueriesData(
              { queryKey: ['messages-for-panels', conversationId] },
              patchContent
            )
            queryClient.setQueriesData(
              { queryKey: ['messages-for-panels', conversationId, 'full'] },
              patchContent
            )
          }
          void supabase.from('messages').update({ content: cleaned }).eq('id', mid)
          void persistFrameMetaRef.current({
            notionSyncReview: false,
            notionUpdatesPending: false,
          })
        }
      } else if (
        merged !== promptContent &&
        (!promptHasChanges || blockTypeChanged || wasAiPendingRef.current) &&
        // A just-added property cell is only in local HTML until the message row catches up
        !(
          countPropertyBlocks(promptContent) > countPropertyBlocks(merged) &&
          !blockTypeChanged &&
          !wasAiPendingRef.current
        )
      ) {
        // Accept server content when idle, after Turn into, or right after AI Remove/Save
        setPromptContent(merged)
        if (blockTypeChanged || wasAiPendingRef.current) setPromptHasChanges(false)
      }
    }

    // Autofocus once per new message — not on every content sync (that steals the caret)
    if (promptMessage?.id !== prevPromptMessageIdRef.current) {
      prevPromptMessageIdRef.current = promptMessage?.id
      hasAutoFocusedRef.current = false
    }
  }, [
    isProjectBoard,
    isProjectBoard ? data.boardTitle : promptMessage?.content,
    responseMessage?.content,
    promptContent,
    promptHasChanges,
    promptMessage?.id,
    promptMessage?.metadata?.linkedBoardId,
    promptMessage?.metadata?.notionObject,
    promptMessage?.metadata?.blockTitle,
    remoteBlockType,
    isFramePending,
    displayContentFor,
    previewOriginal,
    justRestoredByMessage,
  ])

  // Keep responseContent mirror for width-measurement helpers that still read it
  useEffect(() => {
    if (responseMessage && responseMessage.content) {
      const formattedContent = formatResponseContent(responseMessage.content)
      if (formattedContent !== responseContent && !responseHasChanges) {
        setResponseContent(formattedContent)
        setTimeout(() => {
          expandPanelWidth() // Grow for longest line (blocks + chat/flashcards)
        }, 100)
      }
    } else if (!responseMessage) {
      setResponseContent('')
    }
  }, [responseMessage?.id, responseMessage?.content, responseContent, responseHasChanges, expandPanelWidth])

  // Initial width fit on mount — blocks + flashcards measure longest line; chat stays max width
  useEffect(() => {
    if (isRegularChatPanel) {
      setIsInitialShrinkComplete(true)
      return
    }
    if ((isUserResized && resizeDimensions) || pagePreviewOpen) {
      setIsInitialShrinkComplete(true)
      return
    }
    // Blocks hug via max-content — the 300ms opacity:0 made load shells and frames miss each other
    if (isBlock) {
      hasInitialShrunkRef.current = promptMessage?.id || id
      setIsInitialShrinkComplete(true)
      return
    }
    // Map I-bar / grip-created frames must stay visible — the 300ms opacity:0 hid typed text
    if (promptMessage?.metadata?.fadeIn === true) {
      hasInitialShrunkRef.current = promptMessage?.id || id
      setIsInitialShrinkComplete(true)
      return
    }

    const panelId = promptMessage?.id || id
    if (hasInitialShrunkRef.current === panelId) {
      setIsInitialShrinkComplete(true)
      return
    }

    const timeoutId = setTimeout(() => {
      if (!panelRef.current) {
        setIsInitialShrinkComplete(true)
        return
      }
      const promptWidth = measureTextWidthFromContent(promptContent) || 0
      const responseWidth = measureTextWidthFromContent(responseContent) || 0
      const minWidth = isFlashcard ? 300 : 200
      const measuredWidth = Math.max(promptWidth, responseWidth, minWidth)
      const targetWidth = (!promptContent && !responseContent) ? minWidth : measuredWidth
      if (panelRef.current) {
        panelRef.current.style.width = `${targetWidth}px`
      }
      panelWidthRef.current = targetWidth
      setPanelWidthToUse(targetWidth)
      setIsManuallyShrunk(true)
      hasInitialShrunkRef.current = panelId
      setIsInitialShrinkComplete(true)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [
    promptContent,
    responseContent,
    measureTextWidthFromContent,
    isFlashcard,
    isRegularChatPanel,
    promptMessage?.id,
    promptMessage?.metadata?.fadeIn,
    id,
    isUserResized,
    resizeDimensions,
    pagePreviewOpen,
  ])

  // Debounced width adjust when content changes (blocks grow/shrink with longest line)
  useEffect(() => {
    if ((isUserResized && resizeDimensions) || pagePreviewOpen) return
    if (isRowCardAtomHtml(promptContent) || isDbFrame) return // Intrinsic hug owns width
    if (!promptContent && !responseContent) return
    if (isRegularChatPanel && !promptContent && !responseContent) return

    const timeoutId = setTimeout(() => {
      expandPanelWidth()
    }, 150)

    return () => clearTimeout(timeoutId)
  }, [
    promptContent,
    responseContent,
    expandPanelWidth,
    isRegularChatPanel,
    isUserResized,
    resizeDimensions,
    pagePreviewOpen,
  ])

  const handlePromptChange = async (newContent: string) => {
    // Never persist an empty / atom-stripped editor over real frame content (drag remount races)
    const serverHtml = promptMessage?.content || '' // Node copy lags until the message query refreshes
    const localHtml = promptContentRef.current || promptContent || '' // Ref wins — a same-tick add already wrote it
    const prev =
      countPropertyBlocks(localHtml) >= countPropertyBlocks(serverHtml)
        ? localHtml || serverHtml
        : serverHtml || localHtml // Keep whichever copy still has the property cells
    const nextEmpty =
      isBlockContentEmpty(newContent) ||
      !newContent ||
      newContent.trim() === '' ||
      newContent.trim() === '<p></p>'
    const prevHasAtoms = hasFrameAtomHtml(prev) // boardLink / DB / property atoms only — not plain typed text
    const lostPropertyCells =
      countPropertyBlocks(prev) > 0 && countPropertyBlocks(newContent) < countPropertyBlocks(prev)
    const lostAtoms = hasFrameAtomHtml(prev) && !hasFrameAtomHtml(newContent)
    if ((nextEmpty && prevHasAtoms) || lostPropertyCells || lostAtoms) {
      console.warn('Ignored save that would wipe frame atoms', {
        nextEmpty,
        lostPropertyCells,
        lostAtoms,
      })
      setPromptContent(prev)
      setAiForceSyncKey((k) => k + 1)
      return
    }

    // Expand panel width FIRST (before content update) to prevent wrapping
    expandPanelWidth(newContent)

    setPromptContent(newContent)
    promptContentRef.current = newContent // Same-tick saves must see the cells before the next render
    // Message HTML is still the pre-add copy — block the sync effect from putting it back
    if (
      promptMessage &&
      countPropertyBlocks(newContent) > countPropertyBlocks(promptMessage.content || '')
    ) {
      setPromptHasChanges(true) // Hold local HTML until this node copy includes the new cells
      const messageId = promptMessage.id // Messages-cache row for a later panel rebuild
      const meta = (promptMessage.metadata || {}) as Record<string, unknown> // propertyType still counts
      const stackHidden = isStackCollapsedMeta(meta) // Stack collapse is separate from the filter
      const filterHidden = isHiddenByLiveBoardFilter(meta, newContent) // Match using the HTML we just saved
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id || !n.data?.promptMessage) return n // Other frames keep their HTML
          const pm = n.data.promptMessage as {
            content?: string
            metadata?: Record<string, unknown>
          }
          return {
            ...n,
            hidden: stackHidden || filterHidden, // Show this frame under “contains property” immediately
            data: {
              ...n.data,
              promptMessage: { ...pm, content: newContent }, // Filter reads this, not the editor
            },
          }
        })
      )
      if (conversationId && messageId) {
        const patchList = (old: unknown) => {
          if (!Array.isArray(old)) return old // Leave non-list caches alone
          return old.map((m: { id?: string }) =>
            m?.id === messageId ? { ...m, content: newContent } : m // Rebuild must not drop the cell
          )
        }
        queryClient.setQueriesData({ queryKey: ['messages-for-panels', conversationId] }, patchList)
        queryClient.setQueriesData(
          { queryKey: ['messages-for-panels', conversationId, 'full'] },
          patchList
        )
        queryClient.setQueriesData(
          { queryKey: ['messages-for-panels', conversationId, 'embed'] },
          patchList
        )
      }
    }

    if (isProjectBoard) {
      // For project boards, update board title
      const { error } = await supabase
        .from('conversations')
        .update({ title: newContent })
        .eq('id', data.boardId)

      if (error) {
        console.error('Error updating board title:', error)
      } else {
        // Invalidate project boards query to refresh
        queryClient.invalidateQueries({ queryKey: ['project-boards', projectId] })
      }
    } else {
      // For regular panels, update message in database
      if (promptMessage) {
        // While an AI / Notion proposal is pending, keep DB at the original
        if (isFramePending(promptMessage.id)) {
          return
        }
        // Keep mine / Accept sticky restore — TipTap may still hold marked proposal HTML;
        // never let that overwrite the restored baseline (stale undone/accepted content).
        if (justRestoredByMessage[promptMessage.id] !== undefined) {
          return
        }
        // Orphan review marks after a raced discard — strip before persist
        let toSave = newContent
        if (htmlHasNotionSync(toSave)) {
          toSave = sanitizeNotionSyncHtml(toSave)
        }
        // Visitor sandbox: keep the clone in sync; never write the showcase master
        if (isEphemeralMessageId(promptMessage.id)) {
          patchEphemeralMessage(promptMessage.id, { content: toSave })
          return
        }
        const { error } = await supabase
          .from('messages')
          .update({ content: toSave })
          .eq('id', promptMessage.id)

        if (error) {
          console.error('Error updating prompt:', error)
        } else {
          scheduleNotionPagePush(toSave)
        }
      }
    }
  }

  // Frame menu → Add property. Inserts an empty block in the frame (same as dragging an icon in).
  useEffect(() => {
    const onAdd = (ev: Event) => {
      const detail = (
        ev as CustomEvent<{ nodeIds?: string[]; messageIds?: string[]; propertyType?: string }>
      ).detail
      if (!detail?.propertyType || !isPropertyTypeId(detail.propertyType)) return // Not a known type
      const forNode = !!detail.nodeIds?.includes(id) // RF node that opened the menu
      const forMsg = !!promptMessage?.id && !!detail.messageIds?.includes(promptMessage.id)
      if (!forNode && !forMsg) return // Another frame
      const type = detail.propertyType
      const meta = (promptMessage?.metadata || {}) as Record<string, unknown>
      const seeded = readFramePropertyType(meta) // Virtual icon from Turn into, before any real cell
      const ed = promptEditorRef.current
      setPromptHasChanges(true) // Hold local HTML until the message row includes these cells
      if (ed && !ed.isDestroyed) {
        if (!htmlHasPropertyBlocks(ed.getHTML()) && seeded) {
          insertFrameProperty(ed, seeded) // Old metadata-only type becomes a block so it is not dropped
        }
        insertFrameProperty(ed, type) // Empty cell at the end of the frame
        void handlePromptChange(ed.getHTML()) // Save even if onUpdate is suspended mid-drag
        return
      }
      let html = promptContentRef.current || promptMessage?.content || '<p></p>'
      if (!htmlHasPropertyBlocks(html) && seeded) html = htmlAppendHeaderProperty(html, seeded)
      html = htmlAppendHeaderProperty(html, type) // Same order as the live insert
      void handlePromptChange(html)
    }
    window.addEventListener('tt-add-frame-property', onAdd)
    return () => window.removeEventListener('tt-add-frame-property', onAdd)
  }, [id, promptMessage, handlePromptChange])

  // Frame deselect: flush TipTap → promptContent/DB before sync can wipe a just-pasted captureLink.
  const prevSelectedFlushRef = useRef(selected)
  useLayoutEffect(() => {
    const wasSelected = prevSelectedFlushRef.current
    prevSelectedFlushRef.current = selected
    if (!wasSelected || selected) return
    if (!isBlock || isFlashcard || isProjectBoard) return
    const ed = promptEditorRef.current
    if (!ed || ed.isDestroyed) return
    let liveHtml: string
    try {
      liveHtml = ed.getHTML()
    } catch {
      return // Doc mid-mutation (e.g. atom serialize) — skip flush this tick
    }
    if (!liveHtml || liveHtml === promptContentRef.current) return
    void handlePromptChange(liveHtml)
  }, [selected, isBlock, isFlashcard, isProjectBoard])

  const handlePromptRevert = async () => {
    // Revert to original content
    if (isProjectBoard) {
      setPromptContent(data.boardTitle)
      setPromptHasChanges(false)

      const { error } = await supabase
        .from('conversations')
        .update({ title: data.boardTitle })
        .eq('id', data.boardId)

      if (error) {
        console.error('Error reverting board title:', error)
      } else {
        queryClient.invalidateQueries({ queryKey: ['project-boards', projectId] })
      }
    } else {
      if (promptMessage) {
        setPromptContent(promptMessage.content)
        setPromptHasChanges(false)

        const { error } = await supabase
          .from('messages')
          .update({ content: promptMessage.content })
          .eq('id', promptMessage.id)

        if (error) {
          console.error('Error reverting prompt:', error)
        }
      }
    }
  }

  const handleResponseChange = async (newContent: string) => {
    if (isProjectBoard || !responseMessage) return // Project boards: read-only

    // Expand panel width FIRST (before content update) to prevent wrapping
    // Wrapping should not happen if panel is not at max width
    expandPanelWidth(newContent)
    
    setResponseContent(newContent)
    // Update message in database
    const { error } = await supabase
      .from('messages')
      .update({ content: newContent })
      .eq('id', responseMessage.id)

    if (error) {
      console.error('Error updating response:', error)
    }
  }

  const handleResponseRevert = async () => {
    if (isProjectBoard || !responseMessage) return // Project boards: read-only

    // Revert to original content
    setResponseContent(responseMessage.content)
    setResponseHasChanges(false)

    // Update in database
    const { error } = await supabase
      .from('messages')
      .update({ content: responseMessage.content })
      .eq('id', responseMessage.id)

    if (error) {
      console.error('Error reverting response:', error)
    }
  }

  const handleDeletePanel = async () => {
    if (isDeleting) return

    setIsDeleting(true)
    try {
      if (isProjectBoard) {
        // For project boards, remove board from project (set project_id to null)
        const { data: conversation } = await supabase
          .from('conversations')
          .select('metadata')
          .eq('id', data.boardId)
          .single()

        if (conversation?.metadata) {
          const { project_id: _, ...updatedMetadata } = conversation.metadata as Record<string, any>
          const finalMetadata = Object.keys(updatedMetadata).length > 0 ? updatedMetadata : {}

          const { error } = await supabase
            .from('conversations')
            .update({ metadata: finalMetadata })
            .eq('id', data.boardId)

          if (error) {
            throw new Error(error.message || 'Failed to remove board from project')
          }

          // Invalidate project boards query
          await queryClient.invalidateQueries({ queryKey: ['project-boards', projectId] })
        }
      } else {
        // For regular panels, delete messages — and linked page if this item was titled
        if (!promptMessage) return

        const messageIds = [promptMessage.id]
        if (responseMessage) {
          messageIds.push(responseMessage.id)
        }

        // Keep Pages menu in sync: deleting a titled item removes its page map
        try {
          await deleteLinkedBoardForBlock(supabase, promptMessage.metadata as Record<string, unknown>)
          await queryClient.invalidateQueries({ queryKey: ['conversations'] })
        } catch (linkErr) {
          console.error('Failed to delete linked page for item:', linkErr)
        }

        const { error } = await supabase
          .from('messages')
          .delete()
          .in('id', messageIds)

        if (error) {
          throw new Error(error.message || 'Failed to delete panel')
        }

        // Invalidate queries to refresh the board
        await queryClient.invalidateQueries({ queryKey: ['messages-for-panels', conversationId] })

        // Trigger refetch
        setTimeout(() => {
          queryClient.refetchQueries({ queryKey: ['messages-for-panels', conversationId] })
        }, 200)
      }
    } catch (error: any) {
      console.error('Failed to delete panel:', error)
      alert(error.message || 'Failed to delete panel. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  // Determine if this is a component panel (empty prompt content OR a note) - check once at top level
  // Component panels should only show white editable area, no grey area, no loading spinner
  // UNLESS it's a flashcard - flashcards show grey area even if empty content
  // Notes are always component panels (simple note nodes)
  const promptContentValue = promptMessage?.content || ''
  const isComponentPanel = isBlock || promptContentValue.trim().length === 0
  // const isFlashcard = promptMessage?.metadata?.isFlashcard === true // Already defined at top
  // Show grey area if: has content OR is a flashcard (even if empty) OR has response message (to show nested on response load, even if content is empty during streaming)
  // Notes never show grey area (they're simple note nodes)
  const shouldShowGreyArea = !isBlock && (promptContentValue.trim().length > 0 || isFlashcard || !!responseMessage)
  // Calculate loading state: response is loading when responseMessage doesn't exist or has no content yet
  // Notes never show loading state (they don't have responses)
  const isLoading = !isBlock && (!responseMessage || (responseMessage && !responseMessage.content))
  
  // Measure panel's content aspect ratio for note panels (needed for proper height calculation during resize)
  // This captures the natural aspect ratio of the panel content (text + padding) when first rendered
  useEffect(() => {
    if (isBlock && panelRef.current && isInitialShrinkComplete && !resizeDimensions) {
      // Wait a bit for the panel to fully render and settle
      const timeoutId = setTimeout(() => {
        const panelElement = panelRef.current
        if (!panelElement) return
        
        // Measure the panel's current dimensions (this represents the natural aspect ratio of the content)
        const panelWidth = panelElement.offsetWidth
        const panelHeight = panelElement.offsetHeight
        
        if (panelWidth > 0 && panelHeight > 0 && initialTextAspectRatioRef.current === null) {
          // Calculate panel's natural aspect ratio (width/height)
          // This includes the text content plus all padding
          initialTextAspectRatioRef.current = panelWidth / panelHeight
        }
      }, 100) // Small delay to ensure panel is fully rendered
      
      return () => clearTimeout(timeoutId)
    }
  }, [isBlock, isInitialShrinkComplete, promptContent, resizeDimensions])

  // Auto-focus note editor when first created (empty component panel or inline note with fadeIn flag)
  // Map I-bar typing seeds arrive via tt-ibar-typed-seed so keystrokes aren't dropped while the frame spawns
  const slashMenuOpenedRef = useRef(false)
  // Armed for a rolling window around every I-bar seed so prop content can't clobber live typing.
  // Rolling (not latched) so it self-heals: phone capture keeps seeding, desktop stops at handoff.
  const iBarSeedSuspendRef = useRef(false)
  const iBarSeedReleaseRef = useRef<number | null>(null)
  // In-session I-bar / grip creates: keep Yjs OFF for this mount. Remounting with Collaboration
  // after create merges a ghost first-keystroke paragraph into the seeded doc
  // (`<p>t</p><p>testt</p>`). Reload binds cleanly from postgres HTML.
  const allowCollabJoin = !isIbarLiveCreate(promptMessage?.id)
  useEffect(() => {
    if (!isComponentPanel || isFlashcard) return
    slashMenuOpenedRef.current = false

    // TipTap iOS focus() omits preventScroll; pin page + overflow ancestors so edge creates don’t jump
    const focusFrameEditor = (ed: NonNullable<typeof promptEditorRef.current>) => {
      if (id) setFrameTextEditActive(id) // I-bar / fadeIn handoff — Backspace edits text
      const sx = window.scrollX // Document scroll (rare on board, but cheap to pin)
      const sy = window.scrollY
      // Board shell uses overflow-auto main — Safari pans that when the caret is near the edge
      const scrollParents: { el: HTMLElement; left: number; top: number }[] = []
      let node: HTMLElement | null = ed.view.dom as HTMLElement
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node)
        const canScroll =
          /(auto|scroll|overlay)/.test(style.overflowY) ||
          /(auto|scroll|overlay)/.test(style.overflowX)
        if (canScroll && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) {
          scrollParents.push({ el: node, left: node.scrollLeft, top: node.scrollTop })
        }
        node = node.parentElement
      }
      // Force ≥16px before focus — Safari zooms any focused editor under 16px (inline beats CSS)
      const pm = ed.view.dom as HTMLElement
      const prevFont = pm.style.fontSize
      if (typeof window !== 'undefined' && (window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches)) {
        pm.style.fontSize = '16px'
      }
      ed.commands.focus('end', { scrollIntoView: false }) // Don’t scroll caret into view (edge frames)
      const pin = () => {
        window.scrollTo(sx, sy)
        for (const p of scrollParents) {
          p.el.scrollLeft = p.left
          p.el.scrollTop = p.top
        }
      }
      pin()
      requestAnimationFrame(pin)
      window.setTimeout(pin, 50) // Keyboard / visualViewport settle
      window.setTimeout(pin, 150)
      // Restore prior inline fontScale after focus if we overrode it (blocks use CSS frameScale)
      if (prevFont && prevFont !== '16px') {
        window.setTimeout(() => {
          if (!ed.isDestroyed) pm.style.fontSize = prevFont
        }, 200)
      }
    }

    // Phone I-bar: keep keyboard on the centered 16px capture field — don’t steal focus into an edge TipTap
    const captureOwnsKeyboard = () => {
      const el = document.activeElement as HTMLElement | null
      return !!el?.classList?.contains('tt-ibar-capture')
    }

    // iOS Safari zooms if we autofocus a sub-16px editor near the edge. Desktop must take the caret
    // after spawn or the I-bar never appears (capture stays focused and ProseMirror hides its caret).
    const keepCaptureForPhone = () => {
      if (!captureOwnsKeyboard()) return false
      if (typeof window === 'undefined') return false
      return (
        window.matchMedia('(hover: none)').matches ||
        window.matchMedia('(pointer: coarse)').matches
      )
    }

    const applySeed = (html: string, text: string) => {
      const ed = promptEditorRef.current
      if (!ed || ed.isDestroyed) return false

      const meta = (promptMessage?.metadata || {}) as Record<string, unknown>
      const slashPending = meta.slashMenuPending === true

      // I-bar `/` spawn: empty frame first, then insert `/` once so the slash menu opens without deselecting
      if (slashPending && !slashMenuOpenedRef.current) {
        slashMenuOpenedRef.current = true
        ed.commands.setContent('<p></p>')
        ed.chain().focus('end').insertContent('/').run()
        setPromptContent('<p>/</p>')
        setPromptHasChanges(true)
        hasAutoFocusedRef.current = true
        if (!keepCaptureForPhone() && ed.isFocused && promptMessage?.id) {
          window.dispatchEvent(
            new CustomEvent('tt-ibar-seed-applied', { detail: { messageId: promptMessage.id } })
          )
        }
        return true
      }

      const current = ed.getText()
      const captureOwns = captureOwnsKeyboard() // Capture field still has the I-bar keyboard
      // Capture is source of truth until TipTap focuses — apply Backspace (shorter) as well as new chars.
      // After handoff, only accept equal-or-longer seeds so a stale buffer cannot rewind typed text.
      const seedChanged = text !== current
      const seedAhead = text.length >= current.length
      // Caret already handed over (TipTap focused, capture no longer holds the keyboard): the
      // buffer can only trail live typing now, and replacing the doc under an in-flight keystroke
      // is what dropped/doubled characters and split the tail into its own block. Release instead.
      const editorOwnsCaret = ed.isFocused && !captureOwns
      if (seedChanged && !editorOwnsCaret && (captureOwns || seedAhead)) {
        ed.commands.setContent(html || '<p></p>') // Paint the capture buffer, including deletions
        if (!keepCaptureForPhone()) focusFrameEditor(ed) // Desktop: show I-bar even while capture still focused
        setPromptContent(html || '<p></p>')
        setPromptHasChanges(true) // Persist the buffered typing; block remote wipe
        hasAutoFocusedRef.current = true
        return true
      }
      if (!ed.isFocused && !keepCaptureForPhone()) focusFrameEditor(ed)
      hasAutoFocusedRef.current = true
      setPromptHasChanges(true)
      return true
    }

    const onSeed = (event: Event) => {
      const detail = (event as CustomEvent<{ messageId?: string; text?: string; html?: string }>).detail
      if (!detail?.messageId || detail.messageId !== promptMessage?.id) return
      // Seeds are still arriving — the caret owns the doc until they stop (one keystroke past the
      // last seed), so keep prop-content sync off for this frame until the window expires.
      iBarSeedSuspendRef.current = true
      if (iBarSeedReleaseRef.current) window.clearTimeout(iBarSeedReleaseRef.current)
      iBarSeedReleaseRef.current = window.setTimeout(() => {
        iBarSeedSuspendRef.current = false
      }, 600)
      const ok = applySeed(detail.html || '<p></p>', detail.text || '')
      const ed = promptEditorRef.current
      // Phone: capture still owns the keyboard — don’t release it (would drop the soft keyboard)
      if (keepCaptureForPhone()) return
      // Only release map capture once TipTap actually has focus (otherwise more keys would drop)
      if (ok && ed && !ed.isDestroyed && ed.isFocused) {
        window.dispatchEvent(
          new CustomEvent('tt-ibar-seed-applied', { detail: { messageId: detail.messageId } })
        )
      }
    }

    window.addEventListener('tt-ibar-typed-seed', onSeed)

    // Normal fadeIn autofocus (grip-click empty frame, or seed already in message content)
    if (promptEditorRef.current && !hasAutoFocusedRef.current) {
      const isEmpty =
        !promptContent ||
        promptContent === '' ||
        promptContent === '<p></p>' ||
        promptContent === '<p><br></p>'
      const isNewInlineNote = promptMessage?.metadata?.fadeIn === true
      if (isEmpty || isNewInlineNote) {
        const t = window.setTimeout(() => {
          if (!promptEditorRef.current || promptEditorRef.current.isDestroyed) return
          const ed = promptEditorRef.current
          const meta = (promptMessage?.metadata || {}) as Record<string, unknown>
          if (meta.slashMenuPending === true && !slashMenuOpenedRef.current) {
            slashMenuOpenedRef.current = true
            ed.commands.setContent('<p></p>')
            ed.chain().focus('end').insertContent('/').run()
            setPromptContent('<p>/</p>')
            setPromptHasChanges(true)
            if (!keepCaptureForPhone() && ed.isFocused && promptMessage?.id) {
              window.dispatchEvent(
                new CustomEvent('tt-ibar-seed-applied', { detail: { messageId: promptMessage.id } })
              )
            }
          } else if (!keepCaptureForPhone()) {
            focusFrameEditor(ed)
          }
          hasAutoFocusedRef.current = true
          // If a seed is still in flight, ask board-flow to re-push it (not for `/` slash spawn — empty seed would wipe `/`)
          const metaAfter = (promptMessage?.metadata || {}) as Record<string, unknown>
          if (promptMessage?.id && metaAfter.slashMenuPending !== true) {
            window.dispatchEvent(
              new CustomEvent('tt-ibar-request-seed', { detail: { messageId: promptMessage.id } })
            )
          }
        }, 0) // Immediate — was 100ms and felt like a typing gap
        return () => {
          window.clearTimeout(t)
          window.removeEventListener('tt-ibar-typed-seed', onSeed)
        }
      }
    }

    return () => window.removeEventListener('tt-ibar-typed-seed', onSeed)
  }, [
    isComponentPanel,
    isFlashcard,
    promptContent,
    promptMessage?.id,
    promptMessage?.metadata?.fadeIn,
    promptMessage?.metadata,
  ])

  // Debug logging for flashcard conversion
  if (isComponentPanel && promptMessage?.id) {
    console.log('🔍 Component panel check:', {
      panelId: id,
      messageId: promptMessage.id,
      hasContent: promptContentValue.trim().length > 0,
      isFlashcard,
      metadata: promptMessage.metadata,
      shouldShowGreyArea
    })
  }

  // Determine if this panel should be blurred based on nav mode state
  // - Normal nav mode: only the focused/selected flashcard visible, everything else blurred
  // - Zoomed out nav mode: selected flashcard visible, other flashcards blurred, non-flashcards unblurred
  const shouldBlur = flashcardMode !== null && (
    isZoomedOutInNavMode 
      ? (isFlashcard && !selected)  // Zoomed out: blur non-selected flashcards, unblur everything else including selected flashcard
      : !(isFlashcard && selected)  // Normal: only unblur selected flashcard
  )

  // Comments should blur the same as non-flashcard map content:
  // - Blur during nav mode when not zoomed out
  // - Don't blur when zoomed out in nav mode
  // - Even focused flashcard comments should blur
  const shouldBlurComments = flashcardMode !== null && !isZoomedOutInNavMode

  // Corner resize dots — size from live CSS --tt-frame-handle; keep fill / z only here
  const itemCornerResizeStyle = {
    background: resolvedTheme === 'dark' ? '#1a1a1a' : '#ffffff', // Contrast against board
    borderRadius: '50%', // Circular corner handles
    boxSizing: 'border-box' as const, // Include border in box size
    zIndex: 60, // Above title chip / connection dots so drag hits resize, not node drag
  }

  // AI pending edits: show proposed (or original when eye preview is on); restore on Remove/Save
  useEffect(() => {
    if (isProjectBoard || !promptMessage?.id) {
      wasAiPendingRef.current = false
      return
    }
    const mid = promptMessage.id
    const pending = isFramePending(mid)
    if (pending) {
      const next = displayContentFor(mid, promptMessage.content || '')
      setPromptContent(next)
      setPromptHasChanges(false)
      wasAiPendingRef.current = true
      setAiForceSyncKey((k) => k + 1) // Sync TipTap even if caret is in the frame
      return
    }
    // Prefer session original/final from Remove/Save — query cache may still be stale
    const restored = justRestoredByMessage[mid]
    if (restored !== undefined) {
      if (promptContent !== restored) {
        setPromptContent(restored)
        setPromptHasChanges(false)
        setAiForceSyncKey((k) => k + 1)
      }
      wasAiPendingRef.current = false
      // Hold sticky until optimistic/refetch content matches (prevents Save → revert race)
      if ((promptMessage.content || '') === restored) {
        consumeRestoredContent(mid)
      }
      return
    }
    // Pending just cleared without restore map — fall back to message content
    if (wasAiPendingRef.current) {
      const responseHtml = responseMessage?.content
        ? formatResponseContent(responseMessage.content)
        : ''
      const merged = mergePanelHtml(promptMessage.content, responseHtml)
      setPromptContent(merged)
      setPromptHasChanges(false)
      wasAiPendingRef.current = false
      setAiForceSyncKey((k) => k + 1)
    }
  }, [
    isProjectBoard,
    promptMessage?.id,
    promptMessage?.content,
    responseMessage?.content,
    previewOriginal,
    isFramePending,
    displayContentFor,
    justRestoredByMessage,
    consumeRestoredContent,
  ])

  // Map-card frame is a container (like a Notion page) — ⋮⋮ lives on TipTap content blocks inside
  // Logical (unrotated) content box — never use outer AABB measure when rotated
  const rowCardLockedHug =
    isBlock && isRowCardAtomHtml(promptContent) && intrinsicMeasured && !frameUnlocked
  const dbLockedHug = isDbFrame && intrinsicMeasured && !frameUnlocked
  // Fit-to-text (nowrap + wrap): live-hug from measure (stale resizeDimensions left a big peach box)
  // Sole image uses sticky resizeDimensions + contain-fit — text hug would freeze the visual box
  const textLockedHug =
    isBlock &&
    intrinsicMeasured &&
    !frameUnlocked &&
    !isDbFrame &&
    !isRowCardAtomHtml(promptContent) &&
    !soleImageContent // Locked wrap hugs height like nowrap; width stays the wrap column via measure
  const previewMinW = pagePreviewOpen
    ? 280 + PREVIEW_INSET_PX * 2 // Preview card + peach gap each side
    : 0
  const previewFitSize = pagePreviewOpen
    ? scaledFrameSize(
        shapeFitContentBox(
          {
            width: Math.max(intrinsicSize.width, previewMinW),
            height: Math.max(intrinsicSize.height, PREVIEW_BLOCK_MIN_H),
          },
          frameShape,
          true // Silhouette must cover the preview card
        ),
        renderFrameScale,
        1,
        1
      )
    : null
  const lockedDbSize = scaledDbSize ?? huggedSize
  const contentBoxWRaw = Math.max(
    (liveAdjust?.width ??
      (rowCardLockedHug
        ? huggedSize.width
        : dbLockedHug
          ? lockedDbSize.width
          : textLockedHug
            ? huggedSize.width
            : isUserResized && resizeDimensions?.width)) ||
    (Math.abs(rotation) > 0.5
      ? Math.max(intrinsicSize.width + 8, BLOCK_MIN_FRAME_W) // +pad; outer RO is AABB — don't use it
      : itemBoxSize.width) ||
    FRAME_SHAPE_DEFAULT_SIZE.width,
    previewFitSize?.width ?? 0
  )
  const contentBoxHRaw = Math.max(
    (liveAdjust?.height ??
      (rowCardLockedHug
        ? huggedSize.height
        : dbLockedHug
          ? lockedDbSize.height
          : textLockedHug
            ? huggedSize.height
            : isUserResized && resizeDimensions?.height)) ||
    (Math.abs(rotation) > 0.5
      ? Math.max(intrinsicSize.height + 8, BLOCK_MIN_FRAME_H)
      : itemBoxSize.height) ||
    FRAME_SHAPE_DEFAULT_SIZE.height,
    previewFitSize?.height ?? 0 // Shape height follows title + preview, not the stale silhouette box
  )
  const contentBoxW = contentBoxWRaw
  const contentBoxH = contentBoxHRaw
  // Phone Safari gives layer-promoted elements a texture at *layout* size — big frames must never promote
  const phoneBigFrame =
    isPhoneLikeBoard() && (contentBoxWRaw > PHONE_FRAME_PAINT_MAX_PX || contentBoxHRaw > PHONE_FRAME_PAINT_MAX_PX)
  const isContentRotated = isBlock && Math.abs(rotation) > 0.5
  // Upright blue adjust frame = tight AABB of the *visible* silhouette (ellipse/polygon), not just the content rect.
  // When selected, inflate the *unrotated* width by L/R chrome first — ⋮⋮ hangs past the fill on the left,
  // and after rotate that overhang must stay inside the blue box (otherwise grips clip at ~90°).
  const displayBox = isContentRotated
    ? rotatedFrameAabbSize(
        contentBoxW + (showFrameChrome ? adjustChromeX * 2 : 0),
        contentBoxH,
        rotation,
        frameShape
      )
    : { width: contentBoxW, height: contentBoxH }
  // Row cards only: never rely on fit-content — NodeView remount on first select+drag collapses
  // the box. Locked cards always live-hug from intrinsic measure (not stale resizeDimensions).
  const rowCardLiveBox =
    !liveAdjust &&
    isBlock &&
    isRowCardAtomHtml(promptContent) &&
    intrinsicMeasured &&
    !layoutBoxFreeze &&
    !frameUnlocked
      ? {
          width: huggedSize.width + adjustChromeX * 2,
          height: huggedSize.height + adjustChromeYTop + adjustChromeYBottom,
        }
      : null
  const dbLiveBox =
    !liveAdjust &&
    isBlock &&
    isDbFrame &&
    intrinsicMeasured &&
    !frameUnlocked
      ? {
          width: lockedDbSize.width + adjustChromeX * 2,
          height: lockedDbSize.height + adjustChromeYTop + adjustChromeYBottom,
        }
      : null
  const textLockedLiveBox =
    !liveAdjust && textLockedHug && !layoutBoxFreeze
      ? {
          width: huggedSize.width + adjustChromeX * 2,
          height: huggedSize.height + adjustChromeYTop + adjustChromeYBottom,
        }
      : null
  const atomExplicitBox =
    isBlock &&
    isRowCardAtomHtml(promptContent) &&
    intrinsicMeasured &&
    !(isUserResized && resizeDimensions)
      ? {
          width: huggedSize.width + adjustChromeX * 2,
          height: huggedSize.height + adjustChromeYTop + adjustChromeYBottom,
        }
      : null
  const layoutBox =
    layoutBoxFreeze ||
    rowCardLiveBox ||
    dbLiveBox ||
    textLockedLiveBox ||
    atomExplicitBox ||
    (contentDeferred && !intrinsicMeasured && deferredLayoutBox ? deferredLayoutBox : null)
  const shapeBoxW = contentBoxW
  const shapeBoxH = contentBoxH
  const shapeClip = frameShape ? frameShapeClipCss(frameShape) : undefined
  // Silhouette outline: theme gray by default; Color → Default border sets borderStyle none to hide
  const shapeBorderHidden = data.borderStyle === 'none'
  const shapeStroke = shapeBorderHidden
    ? 'transparent'
    : resolvedBorderColor && resolvedBorderColor !== ''
      ? resolvedBorderColor
      : resolvedTheme === 'dark'
        ? '#9ca3af'
        : '#6b7280'
  const shapeFill = isFillTransparent ? 'transparent' : (resolveFrameFillColor(data.fillColor, resolvedTheme) ?? data.fillColor!)
  const shapeStrokeW = shapeBorderHidden ? 0 : FRAME_BORDER_WEIGHT
  // Silhouette paints on the content box — not the blue L/R gutters when selected
  const shapeAreaStyle: React.CSSProperties = {
    left: adjustPadCss || 0,
    top: adjustChromeYTop || 0,
    right: adjustPadCss || 0,
    bottom: adjustChromeYBottom || 0,
  }
  // Fill width (no chrome). Rotated: content box only — displayBox already baked L/R chrome into the AABB.
  const fillWidthRaw = liveAdjust
    ? liveAdjust.width // Mid-adjust fill — don't wait for hug / stale dims
    : layoutBox
    ? layoutBox.width - (showFrameChrome ? adjustChromeX * 2 : 0)
    : isContentRotated
        ? contentBoxW
        : isUserResized && resizeDimensions
          ? resizeDimensions.width
          : applyFrameScale
            ? scaledLayoutW // Place scale without dims yet — visual box = scaled content
          : emptyLineHug
            ? frameMinW
            : (isRowCardAtomHtml(promptContent) || isDbFrame) && !intrinsicMeasured
              ? frameMinW
              : growsWithLine
                ? null
                : panelWidthToUse
  const fillWidthPx =
    fillWidthRaw != null && previewMinW > 0
      ? Math.max(fillWidthRaw, previewMinW) // Preview block is min 280px + inset
      : fillWidthRaw
  const outerWidthCss =
    fillWidthPx == null
      ? 'max-content'
      : isContentRotated
        ? `${displayBox.width}px` // AABB already includes select chrome when rotated
      : showFrameChrome
        ? `${fillWidthPx + adjustChromeX * 2}px` // Live pad; glueFrameChromePad holds fill XY
        : `${fillWidthPx}px`
  const shapeSelectChrome = Boolean(
    frameShape && (showAdjustFrame || showDragBorderOnly) && !pagePreviewOpen && !isContentRotated
  )
  // Same radius as idle (0 = square) — preview must not change the fill (adjust ring stays square)
  const paintedFrameRadius = frameShape ? 0 : frameCornerRadius
  const fillShellBorderShadow = (() => {
    if (frameShape || isContentRotated) return undefined
    // Blue adjust / drag ring already outlines the frame — skip empty grey so it doesn’t read as an inner border
    if (showAdjustFrame || showDragBorderOnly) {
      if (!paintBorderOnFillShell) return undefined
      return `inset 0 0 0 ${FRAME_BORDER_WEIGHT}px ${resolvedBorderColor}` // Keep user-set stroke on the fill shell
    }
    if (showEmptyFrameBorder) return `inset 0 0 0 1px ${emptyFrameBorderColor}`
    if (paintBorderOnFillShell) {
      return `inset 0 0 0 ${FRAME_BORDER_WEIGHT}px ${resolvedBorderColor}`
    }
    return undefined
  })()

  return (
    <div
        ref={panelRef}
        data-panel-container="true" // Data attribute to help find panel container for comment popup
        data-block-node={isBlock ? 'true' : undefined} // Marks blocks for selected connection-dot styling
        data-tt-frame-scale={showFrameChrome ? String(chromeScale) : undefined} // Grip/chrome scale context
        data-tt-chrome-pad-x={showFrameChrome ? String(adjustChromeX) : undefined} // Live L/R pad for rAF CSS var / connection points
        data-tt-chrome-pad-y-top={adjustChromeYTop ? String(adjustChromeYTop) : undefined} // Selected property band
        data-tt-chrome-pad-y-bottom={
          adjustChromeYBottom ? String(adjustChromeYBottom) : undefined
        } // Selected connections band — L/R simulated dots center on the adjust box
        data-tt-comment-side={
          newCommentData || (showComments && comments.length > 0) ? commentSide : undefined
        } // Reactions card side — frame menu parks opposite when the lane is free
        data-on-thread={isOnThreadFrame ? 'true' : undefined}
        data-block-resized={wrapActive ? 'wrap' : undefined} // Wrap (locked/unlocked): soft-wrap in fixed width; else nowrap / clip
        data-clip-preview={showClipPreview ? 'true' : undefined} // Unlocked hover: full-content peek
        data-frame-shape={frameShape || undefined} // Silhouette id when frames act as shapes
        data-ai-pending-frame={
          !isProjectBoard &&
          promptMessage?.id &&
          isFramePending(promptMessage.id) &&
          pendingForMessage(promptMessage.id)?.source !== 'notion'
            ? 'true'
            : undefined
        }
        data-notion-sync-frame={
          !isProjectBoard &&
          promptMessage?.id &&
          pendingForMessage(promptMessage.id)?.source === 'notion'
            ? 'true'
            : undefined
        }
        className={cn(
          'group nopan border relative cursor-grab active:cursor-grabbing overflow-visible transition-[opacity,box-shadow,background-color,border-color] duration-300', // overflow-visible: ⋮⋮ in left chrome; nopan: right-click opens frame menu
          isMobileMode && isBlock && !selected && 'nodrag', // Phone: RF drag only after hold (manual controller)
          // Frames are square — no outer rounded-2xl; rotated fill lives on the inner shell only
          !isFillTransparent && !frameShape && !isContentRotated && !isBlock && !phoneBigFrame && 'backdrop-blur-sm', // Safari gives backdrop-filter its own layer at *layout* size — 7k frame = ~1.4GB
          // Selection uses the connected resize rectangle — panel border must be 0 so handles
          // sit on the outer edge (a 1px empty/custom border inset the padding box and floated chrome).
          selected && isBlock
            ? 'border-transparent'
            : selected
              ? 'border-blue-500 dark:border-blue-400'
              : (data.borderColor || frameShape ? '' : 'border-transparent'), // Empty chrome → inset on fill; styled/shape → style
          isBookmarked
            ? 'shadow-[0_0_8px_rgba(250,204,21,0.6)] dark:shadow-[0_0_8px_rgba(250,204,21,0.4)]'
            : isBorderNone || frameShape || isContentRotated || showEmptyFrameBorder
              ? 'shadow-none' // Transparent / empty chrome / silhouette / rotated — no card shadow on outer
              : showClipPreview
                ? 'shadow-md' // Soft lift while full clipped content is revealed
                : 'shadow-sm',
          // Blur non-flashcard panels when flashcard study mode is active
          shouldBlur && 'blur-sm opacity-40 pointer-events-none',
          !isProjectBoard &&
            promptMessage?.id &&
            isFramePending(promptMessage.id) &&
            (pendingForMessage(promptMessage.id)?.source === 'notion'
              ? 'tt-notion-sync-frame'
              : 'tt-ai-pending-frame')
        )}
      style={{
        // L/R gutters: select-frozen pad (live zoom must not shove the fill / threads)
        width: layoutBox && !showFrameChrome
          ? `${layoutBox.width}px`
          : outerWidthCss,
        height: liveAdjust
          ? `${liveAdjust.height + adjustChromeYTop + adjustChromeYBottom}px` // Live adjust box
          : pagePreviewOpen
          ? `${contentBoxH + adjustChromeYTop + adjustChromeYBottom}px` // Shape/panel grow with preview
          : textLockedHug
          ? `${huggedSize.height + adjustChromeYTop + adjustChromeYBottom}px` // Hug includes in-block preview
          : layoutBox
          ? `${layoutBox.height}px`
          : isContentRotated
            ? `${displayBox.height + adjustChromeYTop + adjustChromeYBottom}px`
            : isUserResized && resizeDimensions
              ? `${resizeDimensions.height + adjustChromeYTop + adjustChromeYBottom}px`
              : applyFrameScale
                ? `${scaledLayoutH + adjustChromeYTop + adjustChromeYBottom}px` // Place-scaled text box
              : emptyLineHug
                ? `${BLOCK_MIN_FRAME_H + adjustChromeYTop + adjustChromeYBottom}px`
                : growsWithLine
                  ? 'fit-content' // In-flow preview grows the panel
                  : undefined,
        minWidth: layoutBox && !showFrameChrome
          ? `${layoutBox.width}px`
          : fillWidthPx != null
            // Explicit fill (incl. tiny free-resize) — don't re-floor to frameMinW after deselect
            ? showFrameChrome
              ? outerWidthCss
              : `${fillWidthPx}px`
            : usesFitContent
              ? `${frameMinW}px`
              : isFlashcard
                ? '300px'
                : '200px',
        minHeight: liveAdjust
          ? `${liveAdjust.height + adjustChromeYTop + adjustChromeYBottom}px` // Live adjust box
          : pagePreviewOpen
          ? `${contentBoxH + adjustChromeYTop + adjustChromeYBottom}px` // Don’t keep the pre-preview silhouette height
          : textLockedHug
          ? `${huggedSize.height + adjustChromeYTop + adjustChromeYBottom}px` // Lock to scaled hug + connections band
          : layoutBox
          ? `${layoutBox.height}px`
          : '0px',
        maxWidth: layoutBox && !showFrameChrome
          ? `${layoutBox.width}px`
          : isContentRotated && fillWidthPx != null
          ? outerWidthCss
          : unlockedResized && fillWidthPx != null
          ? outerWidthCss // Cap the free box — unscaled blocks must not widen it
          : undefined,
        maxHeight: liveAdjust
          ? `${liveAdjust.height + adjustChromeYTop + adjustChromeYBottom}px`
          : pagePreviewOpen
          ? `${contentBoxH + adjustChromeYTop + adjustChromeYBottom}px` // Match the grown silhouette
          : textLockedHug
          ? `${huggedSize.height + adjustChromeYTop + adjustChromeYBottom}px`
          : layoutBox
          ? `${layoutBox.height}px`
          : isContentRotated
          ? `${displayBox.height + adjustChromeYTop + adjustChromeYBottom}px`
          : unlockedResized && resizeDimensions
          ? `${resizeDimensions.height + adjustChromeYTop + adjustChromeYBottom}px` // Cap the free box
          : undefined,
        // L/R gutters + T/B property/connections bands when selected.
        // Height already includes the bands so border-box padding does not eat the fill.
        paddingTop: isContentRotated ? undefined : adjustChromeYTop || undefined,
        paddingRight: isContentRotated ? undefined : adjustPadCss,
        paddingBottom: isContentRotated ? undefined : adjustChromeYBottom || undefined,
        paddingLeft: isContentRotated ? undefined : adjustPadCss,
        // Same paint as the pad: margin box stays the fill, border box grows both ways.
        marginTop:
          showFrameChrome && !isContentRotated && adjustChromeYTop
            ? -adjustChromeYTop
            : undefined,
        marginRight: showFrameChrome && !isContentRotated ? -adjustChromeX : undefined,
        marginLeft: showFrameChrome && !isContentRotated ? -adjustChromeX : undefined,
        boxSizing: 'border-box',
        // `isInitialShrinkComplete` starts false and is only flipped by an effect, so *every* mount
        // paints one frame at 0 and then transitions to 1 over 300ms (the class above transitions
        // opacity). RF unmounts culled nodes, so panning a frame off-screen and back replayed that
        // fade — measured 0.002 opacity while fully on screen mid-pan, i.e. "it doesn't show until I
        // stop, then it flashes". The effect already exempts blocks from the shrink outright; this
        // makes that exemption apply to the first paint too, where it matters.
        opacity: isInitialShrinkComplete || isBlock ? 1 : 0,
        willChange: dragging && isBlock && !phoneBigFrame ? 'transform' : undefined, // Promoting a big frame on phone = layout-size texture
        // Fill always paints on the inner frame shell (shape-capable surface) — not here
        backgroundColor:
          frameShape || isContentRotated || isBlock ? 'transparent' : panelBackgroundColor,
        borderColor:
          // Blue adjust / drag rect owns the outline — custom borders paint on the fill shell
          showAdjustFrame ||
          showDragBorderOnly ||
          frameShape ||
          isContentRotated ||
          showEmptyFrameBorder ||
          paintBorderOnFillShell
            ? 'transparent'
            : resolvedBorderColor
              ? resolvedBorderColor // Custom border when idle (non-block panels)
              : 'transparent',
        borderStyle:
          showAdjustFrame ||
          showDragBorderOnly ||
          frameShape ||
          isContentRotated ||
          isBorderNone ||
          showEmptyFrameBorder ||
          paintBorderOnFillShell
            ? 'none'
            : ((data.borderStyle as React.CSSProperties['borderStyle']) || 'solid'), // Custom color → solid
        borderWidth:
          showAdjustFrame ||
          showDragBorderOnly ||
          frameShape ||
          isContentRotated ||
          isBorderNone ||
          showEmptyFrameBorder ||
          paintBorderOnFillShell
            ? 0
            : FRAME_BORDER_WEIGHT,
        ['--tt-frame-radius' as string]: `${paintedFrameRadius}px`, // Fill radius only (0 = square); adjust ring is always square
        ['--tt-adjust-pad-y-top' as string]: `${adjustChromeYTop || 0}px`, // Property band
        ['--tt-adjust-pad-y-bottom' as string]: `${adjustChromeYBottom || 0}px`, // Connections band — L/R simulated dots center on the adjust box
        // Handle / line / ui-scale sizes come from live `--tt-board-zoom` CSS (not React)
      }}
      onPointerEnter={() => {
        if (isBlock && !isFlashcard) warmFrameContentMount(id) // Mount TipTap before the frame fully enters view
      }}
      onPointerDownCapture={(e) => {
        // Touch taps and fast direct clicks never fire pointerenter, so hover-warming alone would
        // leave the frame cold under the press. Promote here too — same idempotent warm set.
        if (isBlock && !isFlashcard) warmFrameContentMount(id)
        const t = e.target as HTMLElement | null
        // Text / ⋮⋮ / resize / rotate / connection simulators / property·connection marks —
        // those own the gesture. Body press only hides connection indicators (`pressing`).
        const onFrameChrome = !!t?.closest?.(
          '.react-flow__resize-control, [data-frame-chrome], [data-tt-block-handle], [data-tt-insert-line], .block-actions-menu, [data-tt-connection-indicator], [data-tt-property-header] span, [data-tt-connections-header] button, .ProseMirror'
        )
        if (!onFrameChrome) {
          // Body mid-press: hide connection simulators until release (adjust chrome stays)
          setPressing(true)
          const clearPress = () => setPressing(false)
          window.addEventListener('pointerup', clearPress, { once: true })
          window.addEventListener('pointercancel', clearPress, { once: true })
        }
        // RF snapshots dragItems before onNodeDragStart — a selected wrapper rides along with this frame.
        const store = rfStoreApi.getState() as {
          unselectNodesAndEdges?: (p: { nodes: unknown[]; edges: unknown[] }) => void
          nodeInternals?: Map<string, { type?: string; selected?: boolean; draggable?: boolean }>
        }
        const groups = getNodes().filter((n) => n.type === 'blockGroup')
        if (groups.length > 0) store.unselectNodesAndEdges?.({ nodes: groups, edges: [] })
        store.nodeInternals?.forEach((internal) => {
          if (internal.type !== 'blockGroup') return
          internal.selected = false
          internal.draggable = false
        })
        if (groups.some((g) => g.selected || g.draggable !== false)) {
          setNodes((nds) =>
            nds.map((n) =>
              n.type === 'blockGroup' ? { ...n, selected: false, draggable: false } : n
            )
          )
        }
      }}
      onMouseEnter={() => setIsFrameHovering(true)} // Page-open menu + keep chrome hover bridge
      onMouseLeave={(e) => {
        const related = e.relatedTarget as HTMLElement | null
        if (related?.closest?.('[data-frame-chrome]')) return // Moving onto overflow caret / selected chrome
        setIsFrameHovering(false)
      }}
      onClick={(e) => {
        // Click Notion sync highlight → toggle red selection; AI pending → focus review
        const notionSpan = (e.target as HTMLElement | null)?.closest?.(
          '[data-notion-sync="true"]'
        )
        if (notionSpan && promptMessage?.id) {
          const edit = pendingForMessage(promptMessage.id)
          if (edit?.source === 'notion') {
            e.stopPropagation()
            const ed = promptEditorRef.current
            if (ed && !ed.isDestroyed) {
              toggleNotionSyncMarkSelected(ed, notionSpan)
              const html = ed.getHTML()
              setPromptContent(html)
              patchPendingProposedContent(promptMessage.id, html)
              refreshNotionSyncSelection()
            }
            setFocusedEditId(edit.id)
            return
          }
        }
        const pendingSpan = (e.target as HTMLElement | null)?.closest?.(
          '[data-ai-pending="true"]'
        )
        if (pendingSpan && promptMessage?.id) {
          const edit = pendingForMessage(promptMessage.id)
          if (edit) setFocusedEditId(edit.id)
        }
      }}
      onDoubleClick={(e) => {
        // Double-click anywhere on panel focuses the single text editor
        const target = e.target as HTMLElement
        if (target.closest('button, a, [contenteditable="true"], input, textarea, select')) {
          return
        }
        e.stopPropagation()
        const editorToFocus = promptEditorRef.current
        if (editorToFocus && !editorToFocus.isDestroyed) {
          setTimeout(() => {
            editorToFocus.commands.focus()
            const docSize = editorToFocus.state.doc.content.size
            if (docSize > 1) {
              editorToFocus.commands.setTextSelection(docSize - 1)
            }
          }, 0)
        }
      }}
    >
      {isBlock && selected && (
        <LiveFrameChromeZoom selected={selected} panelRef={panelRef} />
      )}
      {/* Thread end over the fill: blue connection box (dots stay for the adjust-box band) */}
      {showConnectionBox && !frameShape && (
        <div
          aria-hidden
          data-tt-connection-box
          className="pointer-events-none absolute z-[20]"
          style={{
            inset: 0, // Frame area — the box the thread can attach to
            borderRadius: 0,
            boxShadow: 'inset 0 0 0 var(--tt-frame-line-w, 1.4px) #3b82f6', // Same screen-constant stroke as the adjust ring
          }}
        />
      )}
      {/* Drag move: blue box on default frames; silhouettes use SVG stroke on the fill shell */}
      {showDragBorderOnly && !frameShape && (
        <div
          aria-hidden
          data-tt-adjust-ring
          className="pointer-events-none absolute z-[20]"
          style={{
            // Full panel (incl. ⋮⋮ gutters) — same box the corner handles sit on
            inset: 0,
            borderRadius: 0, // Adjust ring is square — fill shell keeps the corner radius
            boxShadow: 'inset 0 0 0 var(--tt-frame-line-w, 1.4px) #3b82f6', // Live CSS stroke — constant on screen
            clipPath: !isContentRotated ? shapeClip : undefined,
          }}
        />
      )}

      {/* Selected default frames: square blue ring on the outer panel (RF lines stay hit-only) */}
      {showAdjustFrame && !frameShape && (
        <div
          aria-hidden
          data-tt-adjust-ring
          className="pointer-events-none absolute z-[19]"
          style={{
            // Full panel — not fill-inset (that floated corner handles outside the ring)
            inset: 0,
            borderRadius: 0, // Square ring — fill shell owns --tt-frame-radius
            boxShadow: 'inset 0 0 0 var(--tt-frame-line-w, 1.4px) #3b82f6', // Live CSS stroke — constant on screen
            clipPath: !isContentRotated ? shapeClip : undefined,
          }}
        />
      )}

      {/* Side lines stay mounted while moving (touch events stick to the touchstart target —
          unmounting it mid-drag strands RF's touchmove and the frame stops following) */}
      {showFrameChrome &&
        (['top', 'right', 'bottom', 'left'] as const).map((position) => (
            <div
              key={`line-${position}`} // Side line that joins the four corners
              // Plain div, not NodeResizeControl: lines move the frame; only corner dots resize.
              // RF line classes keep geometry + adjust-box click detection; no `nodrag` → RF frame drag
              className={cn(
                'react-flow__resize-control line tt-frame-resize-line', // RF line box + our stroke/hit CSS
                position, // top/right/bottom/left placement from RF CSS
                !frameShape && 'tt-frame-resize-line-hit' // Hit only — square ring paints the stroke
              )}
              style={{
                cursor: 'inherit', // Drop RF's ew/ns-resize cursor — this is a move target
                visibility: showAdjustFrame ? undefined : 'hidden', // Hide mid-move; touch target stays in DOM
              }}
            />
          ))}

      {/* Selected frames: circular corner handles (hidden while moving / thread drag / group select) */}
      {showAdjustFrame && !groupMulti && (
        <>
          {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((position) => (
            <NodeResizeControl
              key={position} // One control per corner
              position={position} // RF places the handle on that corner
              className="nodrag nopan" // Resize only — never start RF frame drag / pan
              style={itemCornerResizeStyle} // White circular handle styling
              minWidth={frameUnlocked ? (soleImageContent ? FRAME_RESIZE_MIN : freeOuterMinW) : 1} // Free: live content hug
              minHeight={frameUnlocked ? (soleImageContent ? FRAME_RESIZE_MIN : freeOuterMinH) : 1}
              keepAspectRatio={!frameUnlocked && hasBlockContent} // Locked + content: proportional only
              onResizeStart={handleResizeStart} // Arm user-resize mode (line-grow off)
              onResize={handleResize} // Apply explicit width/height while dragging
              onResizeEnd={handleResizeEnd} // Persist resizeDimensions
            />
          ))}
        </>
      )}

      {/* Stacked mates: line on each adjust-box side gap (independent trees per side) */}
      {!dragging &&
        stackGapSides.map(({ side, groupId }) => (
          <FrameStackRevealLine
            key={`stack-line-${side}-${groupId}`}
            nodeId={id}
            stackGroupId={groupId}
            stackSide={side}
            frameUiScale={frameUiScale}
          />
        ))}

      {/* Connection indicators — DOM only (not RF Handles); arm the edge connection point.
          Chat-linked sides keep the blue simulator and add the brand line beside it —
          only while indicators normally show and the chat↔board thread stroke is not drawn. */}
      {showIndicators && (
        <>
          {(['left', 'right', 'top', 'bottom'] as const).map((side) => {
            if (isThreadConnecting && (nearThreadSides & THREAD_SIDE_BIT[side]) === 0) return null // Thread over the frame or its adjust box shows every side
            if (chatThreadVisibleSides.has(side)) return null // Thread stroke owns this end — no simulator
            if (chatLinkLogoSides.has(side) && promptMessage?.id) {
              return (
                <ChatLinkConnectionCue
                  key={`chat-link-cue-${side}`}
                  side={side}
                  frameMessageId={promptMessage.id} // Reverse-lookup linked chat turn
                  isThreadConnecting={isThreadConnecting}
                />
              )
            }
            return (
              <ConnectionIndicator
                key={`indicator-${side}`}
                side={side}
                className={cn(
                  // No Tailwind border/size — those are flow-px and grow with board zoom
                  'nodrag nopan absolute z-[30] rounded-full bg-blue-500',
                  isThreadConnecting
                    ? 'pointer-events-none' // Visual snap target only — don't steal hit from edge Handles
                    : 'cursor-crosshair hover:bg-blue-600'
                )}
                // Size + white ring + outset from live `--tt-frame-ui-scale` CSS (no React zoom re-render)
              />
            )
          })}
        </>
      )}

      {/* Frame chrome — rotate · fit · wrap · reactions (selected + idle only; hidden while dragging).
          Stay under the adjust box while board preview is open — preview grows the fill, not this row.
          Scale + margin-left from live `--tt-frame-ui-scale` CSS; marginTop keeps clear of indicators. */}
      {isBlock && !isThreadConnecting && selected && !dragging && !groupMulti && (
          <div
            data-frame-chrome
            className="nodrag nopan absolute z-[25] flex items-center gap-0.5" // Below connection indicators (z-30)
            style={{
              left: 0,
              top: '100%',
              // 2× indicator outset: equal air above/below the bottom connection point
              marginTop: `calc(${2 * INDICATOR_OUTSET}px * var(--tt-frame-ui-scale, 1.4))`,
            }}
            onMouseEnter={() => setIsFrameHovering(true)} // Keep hover while on chrome
            onMouseLeave={(e) => {
              const related = e.relatedTarget as HTMLElement | null
              if (related?.closest?.('[data-panel-container="true"]') === panelRef.current) return
              setIsFrameHovering(false)
            }}
            onMouseDown={(e) => e.stopPropagation()} // Don't start node drag
          >
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
              style={{ cursor: 'grab' }}
              title="Drag to rotate · click to reset"
              aria-label="Rotate — drag to turn, click to reset"
              onPointerDown={handleRotatePointerDown}
              onPointerMove={handleRotatePointerMove}
              onPointerUp={handleRotatePointerUp}
              onPointerCancel={handleRotatePointerUp}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Local 10px → ~14px on screen after ui-scale (matches Free-nav pan Hand) */}
              <RotateCw className="h-2.5 w-2.5 pointer-events-none" />
            </button>
            {hasBlockContent && (
              <button
                type="button"
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800',
                  !frameUnlocked && 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50' // Active when fitted to text
                )}
                title={frameUnlocked ? 'Fit to text' : 'Free resize (keep size)'}
                aria-label={frameUnlocked ? 'Fit to text' : 'Free resize'}
                aria-pressed={!frameUnlocked}
                onClick={handleToggleFrameLock}
              >
                <ScanText className="h-2.5 w-2.5 pointer-events-none" />
              </button>
            )}
            <button
              type="button"
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800', // Same chrome as rotate / fit / wrap — no fill
                showComments && 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50' // Active wash only while open
              )}
              title={showComments ? 'Hide reactions' : 'Reactions'}
              aria-label={showComments ? 'Hide reactions' : 'Reactions'}
              aria-pressed={showComments}
              onClick={(e) => {
                e.stopPropagation() // Don't start frame drag / deselect
                e.preventDefault()
                const next = !showComments
                setShowComments(next) // Show / hide the reactions panel
                if (!next) {
                  setSelectedCommentId(null) // Drop highlight when hiding
                  setNewCommentData(null) // Close composer with the panel
                  setNewCommentText('')
                  return
                }
                if (comments.length > 0 || newCommentData) return // Saved cards / open composer already paint
                const editor = promptEditorRef.current
                const sel = editor && !editor.isDestroyed ? editor.state.selection : null
                const from = sel && !sel.empty ? sel.from : 1 // Selection, else empty caret
                const to = sel && !sel.empty ? sel.to : 1
                const selectedText =
                  sel && !sel.empty && editor
                    ? editor.state.doc.textBetween(from, to, ' ')
                    : ''
                setNewCommentData({ selectedText, from, to, section: 'prompt' }) // Empty panel = composer
                setNewCommentText('')
              }}
            >
              <ReactionsChatIcon className="h-2.5 w-2.5 pointer-events-none" /> {/* Two centered lines in the bubble */}
            </button>
          </div>
      )}

      {/* Page titles/links now render inline as boardLink blocks inside the editor (no edge chip). */}
      
      {/* Left handle with flashcard navigation */}
      {isFlashcard && (hasMultipleFlashcards || hasFlashcardsInOtherBoards) && previousBoardWithFlashcards && isAtFirstFlashcardInBoard && selected ? (
        // Expanded pill with two buttons when cross-board navigation is available and flashcard is selected
        <div
          className={cn(
            'absolute left-0 top-1/2 z-20 flex items-center justify-center -translate-x-1/2 -translate-y-1/2'
          )}
          style={{ 
            width: '24px', 
            height: '48px',
            transition: 'height 300ms ease-in-out'
          }}
        >
          <div className="bg-white dark:bg-[#1f1f1f] rounded-full shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-0.5 flex flex-col gap-0.5 h-12 w-6 items-center justify-center transition-all duration-300 ease-in-out">
            {/* Single arrow button - cycles through current board */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigateToPreviousFlashcard()
              }}
              className="h-6 w-6 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-all duration-300"
              title="Previous flashcard in this board"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
            </button>
            {/* Double arrow button - navigates to previous board (only when selected) */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigateToPreviousBoard()
              }}
              className="h-6 w-6 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center animate-fade-in"
              title="Previous board"
            >
              <ChevronsLeft className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
            </button>
          </div>
        </div>
      ) : isFlashcard && (hasMultipleFlashcards || hasFlashcardsInOtherBoards) ? (
        <div
          className={cn(
            'absolute left-0 top-1/2 z-20 flex items-center justify-center -translate-x-1/2 -translate-y-1/2 cursor-pointer'
          )}
          style={{ 
            width: '24px', 
            height: '24px',
            transition: 'height 300ms ease-in-out'
          }}
          onClick={(e) => {
            e.stopPropagation()
            navigateToPreviousFlashcard()
          }}
        >
          <Handle
            type="target"
            position={Position.Left}
            id="left"
            isConnectable={true}
            className={cn(
              'handle-dot',
              selected ? 'handle-dot-selected' : 'handle-dot-default',
              'handle-dot-flashcard-large'
            )}
            style={{
              backgroundColor: isFillTransparent ? 'transparent' : handleColor,
              border: isBorderNone ? 'none' : `1px solid ${handleBorderColor}`,
              '--handle-color': isFillTransparent ? 'transparent' : handleColor,
              '--handle-hover-color': isFillTransparent ? 'transparent' : handleHoverColor,
            } as React.CSSProperties}
          />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-30">
            <ChevronLeft className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
          </div>
        </div>
      ) : !isFlashcard ? (
        <>
          {/* Connection points — always mounted on frames (even unselected/minimal) so settled
              threads have Handle geometry to attach to; visibility is CSS-only. */}
          {(['left', 'right', 'top', 'bottom'] as const).map((side) => {
            const position =
              side === 'left'
                ? Position.Left
                : side === 'right'
                  ? Position.Right
                  : side === 'top'
                    ? Position.Top
                    : Position.Bottom
            return (
              <Fragment key={`cp-${side}`}>
                <Handle
                  type="target"
                  position={position}
                  id={side}
                  isConnectable
                  isConnectableStart={false}
                  isConnectableEnd
                  className="handle-dot tt-connection-point"
                  style={connectionPointStyle()}
                />
                <Handle
                  type="source"
                  position={position}
                  id={side}
                  isConnectable
                  isConnectableStart={false} // Drag starts from ConnectionIndicator (DOM), not this Handle
                  isConnectableEnd
                  className="handle-dot tt-connection-point"
                  style={connectionPointStyle()}
                />
              </Fragment>
            )
          })}
        </>
      ) : null}

      {/* Top and bottom handles for flashcards - regular handles (not arrow handles) */}
      {/* These are always shown for flashcards, regardless of navigation arrows */}
      {isFlashcard && !shouldHideHandles && (
        <>
          {/* Top handle for flashcards - target (can receive connections) */}
          <Handle
            type="target"
            position={Position.Top}
            id="top"
            isConnectable={true}
            className={cn(
              'handle-dot',
              selected ? 'handle-dot-selected' : 'handle-dot-default'
            )}
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: isFillTransparent ? 'transparent' : handleColor,
              border: isBorderNone ? 'none' : `1px solid ${handleBorderColor}`,
              '--handle-color': isFillTransparent ? 'transparent' : handleColor,
              '--handle-hover-color': isFillTransparent ? 'transparent' : handleHoverColor,
            } as React.CSSProperties}
          />
          {/* Top handle for flashcards - source (can send connections) */}
          <Handle
            type="source"
            position={Position.Top}
            id="top"
            isConnectable={true}
            className={cn(
              'handle-dot',
              selected ? 'handle-dot-selected' : 'handle-dot-default'
            )}
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: isFillTransparent ? 'transparent' : handleColor,
              border: isBorderNone ? 'none' : `1px solid ${handleBorderColor}`,
              '--handle-color': isFillTransparent ? 'transparent' : handleColor,
              '--handle-hover-color': isFillTransparent ? 'transparent' : handleHoverColor,
            } as React.CSSProperties}
          />
          {/* Bottom handle for flashcards - target (can receive connections) */}
          <Handle
            type="target"
            position={Position.Bottom}
            id="bottom"
            isConnectable={true}
            className={cn(
              'handle-dot',
              selected ? 'handle-dot-selected' : 'handle-dot-default'
            )}
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: isFillTransparent ? 'transparent' : handleColor,
              border: isBorderNone ? 'none' : `1px solid ${handleBorderColor}`,
              '--handle-color': isFillTransparent ? 'transparent' : handleColor,
              '--handle-hover-color': isFillTransparent ? 'transparent' : handleHoverColor,
            } as React.CSSProperties}
          />
          {/* Bottom handle for flashcards - source (can send connections) */}
          <Handle
            type="source"
            position={Position.Bottom}
            id="bottom"
            isConnectable={true}
            className={cn(
              'handle-dot',
              selected ? 'handle-dot-selected' : 'handle-dot-default'
            )}
            style={{
              width: '10px',
              height: '10px',
              backgroundColor: isFillTransparent ? 'transparent' : handleColor,
              border: isBorderNone ? 'none' : `1px solid ${handleBorderColor}`,
              '--handle-color': isFillTransparent ? 'transparent' : handleColor,
              '--handle-hover-color': isFillTransparent ? 'transparent' : handleHoverColor,
            } as React.CSSProperties}
          />
        </>
      )}

      {/* Connections — below the fill. The top gap matches this row so the frame stays centered. */}
      {hasConnBand && (
        <div
          ref={connHeaderHostRef}
          data-tt-frame-chrome-bottom
          className="nodrag nopan absolute z-[2] flex items-center"
          style={{
            bottom: showFrameChrome ? connCenterOffset : -(connBandPaintH + dbFooterH), // Centered in the gap when selected; hang the painted row when not
            left: (showFrameChrome ? adjustChromeX : 0) + chromePadX,
            right: (showFrameChrome ? adjustChromeX : 0) + chromePadX,
            height: connBandPaintH, // Grows when connection icons wrap past one row
          }}
        >
          <div
            style={{
              transform: chromeScale !== 1 ? `scale(${chromeScale})` : undefined,
              transformOrigin: 'left center',
            }}
          >
            <FrameConnectionsGroup
              notionSync={notionSync}
              onNotionConnection={handleNotionConnection}
            />
          </div>
        </div>
      )}
      {isDbFrame && dbNotionId && dbFooterH > 0 && (
        <div
          data-tt-db-rows-reveal
          className="nodrag nopan absolute z-[2] flex items-center"
          style={{
            bottom: showFrameChrome ? connZone : -dbFooterH, // Above the connection zone; balance air stays toward the blue edge
            left: (showFrameChrome ? adjustChromeX : 0) + chromePadX,
            right: (showFrameChrome ? adjustChromeX : 0) + chromePadX,
            height: dbFooterH,
          }}
        >
          <div
            style={{
              transform: chromeScale !== 1 ? `scale(${chromeScale})` : undefined,
              transformOrigin: 'left center',
            }}
          >
            <DbFrameRevealChrome
              notionDatabaseId={dbNotionId}
              rowCap={dbVisibleRowCap}
              onShowMore={onDbShowMore}
              onShowLess={onDbShowLess}
            />
          </div>
        </div>
      )}

      {/* Single text body — when rotated, one centered shell holds fill + shape + blocks (no double card).
          This shell IS the shape-capable frame surface: same fill + radius selected or not. */}
      <div
        ref={wrapLineFillRef} // Wrap-line drag converts clientX against this fill box
        data-tt-frame-fill="true" // ⋮⋮ X parks on this edge — not the wrap column (right/center align)
        data-tt-shape-fill={frameShape || undefined} // ⋮⋮ portal here — inner layer clips to the silhouette
        className={cn(
          'relative z-[1] w-full', // Above shape backdrop; fills the padded content box
          // Always fill the panel for blocks — h-auto on-thread left peach shorter than the blue ring
          isBlock || !(isOnThreadFrame && !layoutBox) ? 'h-full' : 'h-auto flex items-center',
          shapeCenterContent && 'flex items-center justify-center',
          !isFillTransparent && !frameShape && !phoneBigFrame && 'backdrop-blur-sm', // Same Safari layer-size bomb as the outer wrapper
          !isBlock && 'p-1',
          // Clip content inside the fill; ⋮⋮ portal onto this fill in the panel’s left chrome.
          // Sole image: clip via ProseMirror/CSS only — this shell must stay visible when selected
          // so negative-left ⋮⋮ can reach the blue gutter (same as text frames).
          // Shaped: overflow visible here — the inner layer clips to the silhouette.
          unlockedResized && !selected && !isContentRotated && !frameShape
            ? 'overflow-hidden' // Unselected free: keep the box — unscaled content must not grow the RF node
            // Wrap bars stay overflow-visible so corner radius does not clip their ends
            : soleImageContent && !selected
            ? 'overflow-hidden'
            : 'overflow-visible',
          promptMessage?.metadata?.fadeIn === true &&
            isBlockContentEmpty(promptContent) &&
            'animate-note-fade-in',
          isContentRotated && 'absolute'
        )}
        style={{
          // Shaped frames: SVG silhouette paints fill + stroke; shell stays transparent
          backgroundColor: frameShape ? 'transparent' : responseAreaBackgroundColor || panelBackgroundColor,
          // Live radius: always explicit so 0 stays square (|| undefined would drop the rule)
          borderRadius: paintedFrameRadius, // 0 = square fill — same while board preview is open
          // Empty / selected custom borders paint here — panel border is off while adjust chrome is on
          boxShadow: fillShellBorderShadow,
          // Polygon clips work in CSS; cylinder/ellipse use SVG fill instead (path clip is unreliable).
          // Skip while selected: ⋮⋮ + add lines live in the L chrome (negative left) and must not be
          // cut by the silhouette — grips only mount when selected anyway.
          // Silhouette clip is on the inner content layer (⋮⋮ portaled to this fill)
          ...(isContentRotated
            ? {
                width: contentBoxW,
                height: contentBoxH,
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                transformOrigin: 'center center',
              }
            : {}),
        }}
      >
        {isBlock && frameShape && (
          <FrameShapeBackdrop
            type={frameShape}
            width={shapeBoxW}
            height={shapeBoxH}
            fill={shapeFill}
            fillOpacity={1}
            stroke={shapeSelectChrome ? '#3b82f6' : shapeStroke}
            strokeWidth={shapeSelectChrome ? frameLineW : shapeStrokeW}
          />
        )}
        {/* Hover full-content preview: fill behind spilled blocks (frame box stays the saved size) */}
        {showClipPreview && resizeDimensions && (
          <div
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 -z-[1]"
            style={{
              borderRadius: paintedFrameRadius, // Same as fill so hover-unclip corners stay square
              width: Math.max(resizeDimensions.width, contentVisualW),
              height: Math.max(resizeDimensions.height, contentVisualH),
              backgroundColor: responseAreaBackgroundColor || panelBackgroundColor,
              boxShadow:
                resolvedTheme === 'dark'
                  ? '0 10px 28px rgba(0,0,0,0.45)'
                  : '0 10px 28px rgba(0,0,0,0.12)',
            }}
          />
        )}
        {/* Page frame with regular blocks (no boardLink) — pin open menu to the visible frame edge
            (inside the overflow clip), not to the wider content box. */}
        {showFrameBoardOpenMenu && linkedBoardId && (
          <BoardLinkProvider value={boardLinkActions}>
            <BoardOpenMenu
              boardId={linkedBoardId}
              notionUrl={notionUrl}
              forceVisible
              className="!right-1 !top-2 !translate-y-0"
            />
          </BoardLinkProvider>
        )}
        {/* Blocks stay mounted — preview is an extra in-flow block, not a replacement */}
          <div
            className={cn(
              shapeCenterContent && 'flex items-center justify-center',
              !shapeCenterContent && isBlock && 'flex', // Frame alignment — park the wrap column
              frameShape && 'relative z-[1]' // TipTap above stroke-only shape SVG in the fill shell
            )}
            style={
              shapeCenterContent
                ? {
                    width: '100%',
                    height: '100%',
                    minHeight: 0,
                    overflow: 'hidden', // Keep title + preview + blocks inside the silhouette
                    clipPath: shapeClip, // Circle / stadium / polygon — not just AABB
                  }
                : frameShape
                ? {
                    width: '100%',
                    height: '100%',
                    overflow: 'hidden',
                    clipPath: shapeClip, // DB / uncentered shaped frames still clip to the border
                    ...(isBlock
                      ? {
                          display: 'flex',
                          justifyContent: 'center', // Free extra space — wrap column stays mid-frame
                          alignItems: 'center', // Same for height; Alignment is text-align only
                        }
                      : {}),
                  }
                : freePreviewCenter
                ? {
                    width: '100%', // Fill the free box so flex has room to center
                    height: '100%', // Frame height is explicit while the preview is open
                    minHeight: 0, // Let the fill own the height, not the content
                    overflow: 'hidden', // Keep title + preview inside the free box
                    justifyContent: 'center', // Same mid-frame column as free text
                    alignItems: 'center', // Extra height: title + preview sit mid-frame
                  }
                : applyPaintScale || unlockedResized
                ? {
                    // Free: spacer IS the dragged box (hidden overflow so RF cannot grow to unscaled content).
                    // Locked scale: hug spacer. paintScale contain-fits the blocks inside.
                    width: unlockedResized && unlockedInnerW != null ? unlockedInnerW : scaledLayoutW,
                    height: unlockedResized && unlockedInnerH != null ? unlockedInnerH : scaledLayoutH,
                    minWidth: unlockedResized && unlockedInnerW != null ? unlockedInnerW : scaledLayoutW, // React owns the min — handleResize writes one imperatively and relock left the free-box min (text shoved off the peach)
                    minHeight: unlockedResized && unlockedInnerH != null ? unlockedInnerH : scaledLayoutH,
                    overflow: unlockedResized ? 'hidden' : 'visible', // Hidden = box stays where resized
                    // Phone: overflow:hidden spacer sits under wrap / + chrome but still wins the touch
                    // (Safari hit-tests the clip layer). Pass through; contentFit + bars take hits.
                    pointerEvents: unlockedResized && selected ? 'none' : undefined,
                    display: 'flex',
                    justifyContent:
                      unlockedResized
                        ? 'center' // Free: widest-block column (left) or wrap column mid-frame
                        : lockedWrapCol && frameAlignX === 'right'
                          ? 'flex-end' // Fit wrap: peach hugs the widest line — park the wider column’s right edge on it
                          : lockedWrapCol && frameAlignX === 'center'
                            ? 'center'
                            : 'flex-start',
                    alignItems: unlockedResized ? 'center' : 'flex-start', // Extra height: keep the block mid-frame
                  } // CSS scale doesn’t affect layout — spacer holds the free / hug box
                : isBlock
                ? {
                    display: 'flex',
                    ...(lockedWrapCol
                      ? { width: scaledLayoutW } // Pin to the text hug — auto width grew to the column and flex-end had nothing to park against
                      : {}),
                    minWidth: lockedWrapCol ? scaledLayoutW : 0, // React owns this — handleResize’s free-box min survived relock
                    minHeight: 0, // Same: clear the free-resize min-height
                    justifyContent:
                      lockedWrapCol && frameAlignX === 'right'
                        ? 'flex-end' // Fit wrap at scale 1 — same edge park as the scaled spacer
                        : lockedWrapCol && frameAlignX === 'center'
                          ? 'center'
                          : 'flex-start', // Locked hug — origin top-left, no leftover
                    alignItems: 'flex-start',
                  }
                : undefined
            }
          >
          <div
            ref={contentFitRef} // Unscaled content box (offsetWidth ignores CSS scale)
            data-tt-content-fit="true" // ImageBlockView contain-fit measures this box
            data-tt-sole-image={soleImageContent ? 'true' : undefined} // Absolute-fill image to sticky frame
            data-tt-shape-center={shapeCenterContent ? 'true' : undefined}
            data-tt-align-box={freeAlignCol != null || wrapContentWidth != null ? 'true' : undefined} // Wrap column + free nowrap: text-align uses the box
            data-tt-free-left={freeLeftStack ? 'true' : undefined} // Default left: hug widest block, center that stack
            data-tt-frame-align={isBlock ? frameAlignX : undefined} // Nowrap short lines park via margin on this edge
            // Sync during render (not TipTap useEffect) so image freezes before free-layout remeasure
            data-frame-free-resize={undefined} // Free mode contain-fits the full blocks — no inner clip/scroll
            className={cn(
              'relative shrink-0', // Shaped frames: don’t stretch to the inflated hug box
              // Locked+resized: natural width so hug measures real text (not the stretched box).
              // Free nowrap: natural width then contain-fit. Wrap uses wrapContentWidth. Unresized: w-max.
              // Sole image: fill the sticky frame box so height can limit contain-fit.
              soleImageContent
                ? 'h-full min-h-0 w-full'
                : wrapContentWidth != null || freeAlignCol != null
                ? undefined
                : shapeCenterContent
                  ? 'w-max max-w-full'
                  : !frameUnlocked && scaledAsResized
                    ? 'w-max'
                    : isRowCardAtomHtml(promptContent) || (isDbFrame && !frameUnlocked)
                      ? 'w-max' // Never stretch the measure box to a stale wide panel / clipped DB table
                      : unlockedResized
                        ? 'w-max' // Free nowrap — natural box, then paintScale contain-fits
                        : isUserResized || !growsWithLine || emptyLineHug
                        ? 'w-full' // Fill explicit empty hug / resized box for full-row clicks
                        : 'w-max',
              // Blocks: tight equal pad so the peach edge sits close to glyphs
              isBlock ? undefined : 'px-3 py-3'
            )}
            style={{
              ...(unlockedResized && selected
                ? { pointerEvents: 'auto' } // Spacer is none — keep text / I-bar hittable
                : {}),
              ...(isBlock
                ? shapeCenterContent
                  ? {
                      padding: BLOCK_FRAME_PAD_Y,
                    }
                  : {
                      paddingTop: BLOCK_FRAME_PAD_Y,
                      paddingBottom: BLOCK_FRAME_PAD_Y,
                      paddingLeft: BLOCK_FRAME_PAD_X,
                      paddingRight: BLOCK_FRAME_PAD_X,
                    }
                : {}),
              ...(soleImageContent
                ? { width: '100%', height: '100%', minHeight: 0, boxSizing: 'border-box' }
                : {}),
              // Contain-fit viewport for imageBlock — Resize 100% = full bitmap inside (height may limit)
              ...(resizeDimensions &&
              (soleImageContent || /data-type=["']imageBlock["']/i.test(promptContent || ''))
                ? ({
                    ['--tt-image-frame-w' as string]: `${Math.max(
                      1,
                      resizeDimensions.width - BLOCK_FRAME_PAD_X * 2
                    )}px`,
                    ['--tt-image-frame-h' as string]: `${Math.max(
                      1,
                      resizeDimensions.height - BLOCK_FRAME_PAD_Y * 2
                    )}px`,
                  } as React.CSSProperties)
                : {}),
              lineHeight: isBlock ? '1.25' : '1.7', // Blocks hug glyphs; chat panels keep looser rhythm
              textAlign: isBlock ? frameAlignX : undefined, // Glyph align inside the wrap / hug box (PM inherits)
              ...(wrapContentWidth != null && !soleImageContent
                ? { width: wrapContentWidth, maxWidth: wrapContentWidth }
                : freeAlignCol != null
                  ? { width: freeAlignCol, maxWidth: freeAlignCol } // Frame-wide align box; still nowrap
                : {}), // Soft-wrap inside frame
              ...(applyPaintScale
                ? {
                    transform: `scale(${paintScale})`, // Place/lock scale × free contain (capped at natural)
                    transformOrigin:
                      unlockedResized || shapeCenterContent || freePreviewCenter
                        ? 'center center' // Free: pairs with the centered spacer — fill-wide center/right box scales back onto the fill
                        : lockedWrapCol && frameAlignX === 'right'
                          ? 'top right' // Pairs with flex-end — scale keeps the column’s right on the peach
                          : lockedWrapCol && frameAlignX === 'center'
                            ? 'top center'
                            : 'top left', // Lock / free center-right — scale from the fill origin
                  }
                : {}),
            }}
            onClick={(e) => {
              // Clicks in frame padding (right of short/empty lines) still place the I-bar
              if (!isBlock || !selected) return
              const t = e.target as HTMLElement
              if (t.closest?.('.ProseMirror, [data-tt-block-handle], [data-tt-insert-line], .block-actions-menu, [data-tt-connections-header], [data-tt-property-header]')) {
                return // Editor / grip / nest / property chrome already handle these
              }
              const ed = promptEditorRef.current
              if (!ed || ed.isDestroyed) return
              // Drag-select mouseup→click can land on TipTap padding (not .ProseMirror) —
              // placing a caret here wiped the range after TipTapContent preserved it.
              if (!ed.state.selection.empty) return
              e.stopPropagation()
              const block = findEditorBlockAtClientPoint(ed, e.clientX, e.clientY)
              if (!block) return
              const caret = Math.max(block.from + 1, block.to - 1) // End of that block’s content
              ed.chain().focus().setTextSelection(caret).run()
            }}
          >
            <BoardLinkProvider value={boardLinkActions}>
            <TipTapContent
              content={promptContent || ''}
              className="text-gray-900 dark:text-gray-100"
              originalContent={
                isProjectBoard
                  ? (data.boardTitle || '')
                  : mergePanelHtml(
                      promptMessage?.content,
                      responseMessage?.content ? formatResponseContent(responseMessage.content) : ''
                    )
              }
              onContentChange={handlePromptChange}
              onHasChangesChange={setPromptHasChanges}
              onComment={(selectedText, from, to) => handleComment(selectedText, from, to, 'prompt')}
              comments={comments.filter(c => c.section === 'prompt')}
              editorRef={promptEditorRef}
              fontScale={isBlock ? 1 : fontScale} // Blocks use frameScale CSS; chat/flashcards keep fontScale
              onCommentHover={(commentId) => {
                if (commentId) {
                  if (showComments) {
                    setSelectedCommentId(commentId)
                  } else {
                    setSelectedCommentId(null)
                  }
                }
              }}
              onCommentClick={(commentId) => {
                if (commentId) {
                  setShowComments(true)
                  setSelectedCommentId(commentId)
                }
              }}
              onAddReaction={handleAddReaction}
              section="prompt"
              placeholder=""
              isFlashcard={isFlashcard}
              isPanelSelected={!!selected} // Keep editable on tap — !dragging was flipping off mid-gesture (I-bar needed 2 taps)
              fitToText={!frameUnlocked} // Locked hug — selected body drag until a caret
              suspendContentSync={!!dragging || dragAtomGuard} // Freeze TipTap before RF sets dragging (first-drag race)
              frameDragging={!!dragging || dragAtomGuard}
              frameFreeResize={false} // Full table/blocks layout; parent contain-fits the box
              frameClipHeight={null}
              frameClipPreview={false}
              dbAlwaysExpanded={dbAlwaysExpanded}
              dbVisibleRowCap={dbVisibleRowCap}
              dragSuspendRef={frameDragSuspendRef} // Sync arm on pointerdown — state lags one frame
              seedSuspendRef={iBarSeedSuspendRef} // Armed per I-bar seed — prop content lags typing
              forceContentSyncKey={aiForceSyncKey} // AI eye / remove / save swaps content even while focused
              isLoading={false}
              onBlur={handleEditorBlur}
              onEditorActiveChange={handleEditorActiveChange}
              enableBlockHandles={isBlock && !isFlashcard} // TipTap blocks; ⋮⋮ gutter only while selected
              showBlockHandles={!!selected && !isFlashcard} // Keep grips mounted while selected — dragging used to unmount them mid-gesture
              singleLineUntilEnter={isBlock && !isFlashcard && !wrapActive} // nowrap until Enter; wrap mode (locked/unlocked) soft-wraps
              alignInFrame={freeAlignCol != null || (wrapContentWidth != null && !freeLeftStack)} // Fill wrap / free box so center-right can park
              hugCenterStack={freeLeftStack} // Free left: PM hugs the widest block so the spacer can center it
              frameAlignX={isBlock ? frameAlignX : 'left'} // Fit-to-content wrap leftovers park on the aligned edge
              hostNodeId={id}
              conversationId={conversationId}
              hostMessageId={promptMessage?.id}
              notionConnected={notionConnected}
              notionSync={notionSync}
              onNotionConnection={handleNotionConnection}
              propertyType={framePropertyType}
              onPropertyTurnInto={handlePropertyTurnInto}
              onPropertyHeadersChange={onPropertyHeadersChange}
              loadCrossfade={promptMessage?.metadata?.fadeIn !== true} // Load: dissolve the shell; new frames use note-fade-in
              mountImmediately={promptMessage?.metadata?.fadeIn === true} // I-bar / grip creates mount TipTap immediately
              coldReady={coldReady} // Snapshot exists → proximity alone must not mount a live editor
              deferredBox={deferredBox}
              contentPadLeft={isBlock ? BLOCK_FRAME_PAD_X : 0}
              frameScale={isBlock && applyPaintScale ? paintScale : frameScale} // ⋮⋮ size/pad track the painted text scale — free contain-fit is not frameScale
              handleGutterFlow={handleGutterFlow}
              centerInShape={shapeCenterContent}
              enableCollab={
                // Notion page bodies stay on HTML/LWW + Notion sync — not Yjs text CRDT
                allowCollabJoin &&
                !(
                  isBoardBodyMeta(promptMessage?.metadata as Record<string, unknown>) &&
                  typeof (promptMessage?.metadata as { notionPageId?: string } | undefined)
                    ?.notionPageId === 'string'
                )
              }
              boardInTargets={(() => {
                const convs =
                  (queryClient.getQueryData(['conversations']) as
                    | Array<{ id: string; title?: string | null }>
                    | undefined) || []
                return [
                  { id: conversationId || '', title: 'Current board' },
                  ...convs
                    .filter((c) => c.id !== conversationId)
                    .slice(0, 40)
                    .map((c) => ({ id: c.id, title: boardTitleOrDefault(c.title) })),
                ]
              })()}
              onPageTurnInto={async (blockType, boardInParentId) => {
                if (!promptMessage?.id || !conversationId) return
                try {
                  const {
                    data: { user },
                  } = await supabase.auth.getUser()
                  if (!user) return
                  await applyTurnInto(supabase, {
                    messageId: promptMessage.id,
                    conversationId,
                    userId: user.id,
                    blockType,
                    boardInParentId: boardInParentId || null,
                  })
                  await queryClient.invalidateQueries({ queryKey: ['messages-for-panels', conversationId] })
                  await queryClient.invalidateQueries({ queryKey: ['conversations'] })
                } catch (err) {
                  console.error('Failed Page turn into from content block:', err)
                }
              }}
            />
            </BoardLinkProvider>
          </div>
          </div>

        {/* Legacy titled frames (no boardLink NodeView) — boardLink owns the preview in-block */}
        {pagePreviewMounted &&
          activePreviewBoardId &&
          !hasBoardLinkForFrame &&
          !hasDatabaseBlockForFrame &&
          !(
            promptContent.includes(`data-board-id="${activePreviewBoardId}"`) ||
            promptContent.includes(`data-board-id='${activePreviewBoardId}'`) ||
            promptContent.includes(`data-page-id="${activePreviewBoardId}"`) ||
            promptContent.includes(`data-page-id='${activePreviewBoardId}'`)
          ) && (
          <div
            className={cn(
              pagePreviewOpen ? 'shrink-0 min-w-0 flex flex-col box-border' : 'hidden' // Own block — does not replace TipTap
            )}
            style={
              pagePreviewOpen
                ? { padding: PREVIEW_INSET_PX * chromeScale } // Local px × place-scale so the gap tracks the fill
                : undefined
            }
          >
            <NestedBoardPreview
              key={activePreviewBoardId} // Remount when switching between different child pages
              conversationId={activePreviewBoardId}
              title={blockTitleLabel}
              visible={pagePreviewOpen}
              fill={false} // Fixed preview height — sit as a block under the other content
              hostNodeId={id} // Chrome drag moves this host item
              cornerRadius={frameCornerRadius} // Match fill (0 = square)
              onClose={() => setPagePreviewOpen(false)}
            />
          </div>
        )}
        {selected && !groupMulti && hasBlockContent && !soleImageContent && !isDbFrame && !frameResizing && (() => { // Wrap lines + resize +'s: property frames too — the cell wraps on the same column as text
          const lineScale = wrapDragPaintRef.current ?? paintScale // Live paint while dragging — a press-only scale left the glyphs stale
          const padX = BLOCK_FRAME_PAD_X * lineScale // Same side gap as the block to the fill
          const padY = BLOCK_FRAME_PAD_Y * lineScale // Same T/B gap as the block
          const wrapZ = rfZoom || 1
          const wrapBarChrome = blockGripChromeScale(1, renderFrameScale) // √ curve on frame scale only — zoom-free so shape never changes
          const barW = 2 * wrapBarChrome * renderFrameScale // Flow thickness — scales with zoom like board content (no screen floor)
          const hitPad = Math.max(4 * wrapBarChrome * renderFrameScale, screenPadFlow(wrapZ, isMobileMode ? 22 : 4)) // Phone finger ~22px; desktop 4px slop
          const fillW = Math.max(1, unlockedInnerW ?? contentVisualW) // Frame fill — never paint past this
          const fillH = Math.max(1, unlockedInnerH ?? contentVisualH) // Fill height for T/B clamp
          const barH = Math.max(2, fillH - padY * 2) // Line length inside T/B pad
          const dashN = 12 // Fixed count — short and tall frames show the same dashes
          const gapPerDash = 14 / 12 // Keep the 12:14 dash:gap ratio at every height
          const dash = barH / (dashN + (dashN - 1) * gapPerDash) // Fit exactly so both ends are a full dash
          const gap = dash * gapPerDash // Scale the gap with the dash
          const dashLen = dash // Drawn length matches the slot
          const dashStart = 0 // Exact fit — no leftover to center
          // Painted content box (zoom-safe) — also while dragging so bars ride the live wrap, not a frozen formula
          const dragBox = wrapLineDraggingRef.current ? wrapDragBoxRef.current : null // Pointer gap — not the word box
          const paintedWrap = dragBox ?? (wrapActive || frameUnlocked ? wrapPaintBox : null) // Free unapplied: wrap-line space (fill / +), not glyphs
          const visualW = paintedWrap
            ? paintedWrap.width
            : !frameUnlocked
              ? Math.max(1, fillW - padX * 2)
              : fillW // Free unapplied fallback: fill edges so wrap stays settable past short content
          const colLeft = paintedWrap
            ? paintedWrap.left
            : frameUnlocked
              ? (fillW - visualW) / 2 // Free — column mid-frame
              : frameAlignX === 'right'
                ? fillW - padX - visualW // Fit-to-content right — line + column on the right
                : frameAlignX === 'center'
                  ? (fillW - visualW) / 2
                  : padX // Fit-to-content left — line on the right of a left-parked column
          const colRight = colLeft + visualW
          const fitToContent = !frameUnlocked // Locked hug — only the free wrap edge
          const showLeft = !fitToContent || frameAlignX === 'right' || frameAlignX === 'center'
          const showRight = !fitToContent || frameAlignX === 'left' || frameAlignX === 'center'
          const vBar = (side: 'left' | 'right', x: number) => (
            <div
              key={`wrap-${side}`}
              data-tt-wrap-line="true"
              className="nodrag nopan absolute z-[40] cursor-ew-resize pointer-events-auto"
              style={{
                // Center the dash on the column edge (same X as the fit-plus) — outer-edge park sat the stroke barW/2 inward of the +
                left: side === 'left' ? x - barW / 2 : x - barW / 2 - hitPad,
                top: padY,
                height: barH,
                width: hitPad + barW,
                touchAction: 'none', // Phone: Safari must not steal the drag as pan/pinch
              }}
              onPointerDown={handleWrapLinePointerDown(side)}
            >
              {Array.from({ length: dashN }, (_, i) => (
                <div
                  key={i}
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    left: side === 'left' ? 0 : hitPad, // Dash on the column X; hit pad stays inward
                    top: dashStart + i * (dash + gap) + (dash - dashLen) / 2,
                    width: barW,
                    height: dashLen,
                    backgroundColor: wrapApplied ? 'var(--nod-blue)' : '#93c5fd',
                  }}
                />
              ))}
            </div>
          )
          // +'s = contain-fit box (fill max, or stored contentFitBox) — never ride wrapColWidth
          // (that moved the +'s with wrap-line drag; wrap is reflow, fit is scale).
          const plusW = Math.min(contentFitBox?.width ?? fillW, fillW)
          const plusH = Math.min(contentFitBox?.height ?? fillH, fillH)
          const plusLeft = (fillW - plusW) / 2
          const plusTop = (fillH - plusH) / 2
          // Frame-relative glyph — tracks renderFrameScale like wrap bars; never wrap `dash` (height)
          const plusArm = 10 * wrapBarChrome * renderFrameScale // Same flow px at every corner / frame height
          const plusThick = Math.max(barW, 1.5 * wrapBarChrome * renderFrameScale) // Near wrap-bar weight — reads as a + without a heavy cross
          const plusHit = Math.max(plusArm + hitPad, hitPad * 2, screenPadFlow(wrapZ, isMobileMode ? 28 : 16)) // Grab stays finger/mouse-friendly
          const plusCursor = (c: 'nw' | 'ne' | 'sw' | 'se') =>
            c === 'nw' || c === 'se' ? 'nwse-resize' : 'nesw-resize'
          const plus = (c: 'nw' | 'ne' | 'sw' | 'se', x: number, y: number) => (
            <div
              key={`fit-${c}`}
              data-tt-fit-plus={c}
              className="nodrag nopan absolute z-[50] pointer-events-auto"
              style={{
                left: x - plusHit / 2,
                top: y - plusHit / 2,
                width: plusHit,
                height: plusHit,
                cursor: plusCursor(c),
                touchAction: 'none', // Phone: Safari must not steal the + drag as pan/pinch
              }}
              onPointerDown={handleFitCornerPointerDown}
            >
              <div
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: (plusHit - plusArm) / 2,
                  top: (plusHit - plusThick) / 2,
                  width: plusArm,
                  height: plusThick,
                  backgroundColor: '#9ca3af', // Grey + — paints over the wrap dash at this corner
                }}
              />
              <div
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: (plusHit - plusThick) / 2,
                  top: (plusHit - plusArm) / 2,
                  width: plusThick,
                  height: plusArm,
                  backgroundColor: '#9ca3af',
                }}
              />
            </div>
          )
          return (
            <>
              {frameUnlocked && (
                <>
                  {plus('nw', plusLeft, plusTop)}
                  {plus('ne', plusLeft + plusW, plusTop)}
                  {plus('sw', plusLeft, plusTop + plusH)}
                  {plus('se', plusLeft + plusW, plusTop + plusH)}
                </>
              )}
              {showLeft && vBar('left', colLeft)}
              {showRight && vBar('right', colRight)}
            </>
          )
        })()}
      </div>

      {/* Right handle with flashcard navigation */}
      {/* Hide handle when comment popup is visible */}
      {isFlashcard && (hasMultipleFlashcards || hasFlashcardsInOtherBoards) && nextBoardWithFlashcards && isAtLastFlashcardInBoard && selected ? (
        // Expanded pill with two buttons when cross-board navigation is available and flashcard is selected
        <div
          className={cn(
            'absolute right-0 top-1/2 z-20 flex items-center justify-center translate-x-1/2 -translate-y-1/2'
          )}
          style={{ 
            width: '24px', 
            height: '48px',
            transition: 'height 300ms ease-in-out'
          }}
        >
          <div className="bg-white dark:bg-[#1f1f1f] rounded-full shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-0.5 flex flex-col gap-0.5 h-12 w-6 items-center justify-center transition-all duration-300 ease-in-out">
            {/* Single arrow button - cycles through current board */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigateToNextFlashcard()
              }}
              className="h-6 w-6 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-all duration-300"
              title="Next flashcard in this board"
            >
              <ChevronRight className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
            </button>
            {/* Double arrow button - navigates to next board (only when selected) */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigateToNextBoard()
              }}
              className="h-6 w-6 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center animate-fade-in"
              title="Next board"
            >
              <ChevronsRight className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
            </button>
          </div>
        </div>
      ) : isFlashcard && (hasMultipleFlashcards || hasFlashcardsInOtherBoards) ? (
        <div
          className={cn(
            'absolute right-0 top-1/2 z-20 flex items-center justify-center translate-x-1/2 -translate-y-1/2 cursor-pointer'
          )}
          style={{ 
            width: '24px', 
            height: '24px',
            transition: 'height 300ms ease-in-out'
          }}
          onClick={(e) => {
            e.stopPropagation()
            navigateToNextFlashcard()
          }}
        >
          <Handle
            type="source"
            position={Position.Right}
            id="right"
            className={cn(
              'handle-dot',
              selected ? 'handle-dot-selected' : 'handle-dot-default',
              'handle-dot-flashcard-large'
            )}
            style={{
              backgroundColor: isFillTransparent ? 'transparent' : handleColor,
              border: isBorderNone ? 'none' : `1px solid ${handleBorderColor}`,
              '--handle-color': isFillTransparent ? 'transparent' : handleColor,
              '--handle-hover-color': isFillTransparent ? 'transparent' : handleHoverColor,
            } as React.CSSProperties}
          />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-30">
            <ChevronRight className="h-3.5 w-3.5 text-gray-700 dark:text-gray-300" />
          </div>
        </div>
      ) : null}
      {/* Non-flashcard right Handle removed — edge connection points cover all sides above */}


      {/* New comment box — left or right of the frame, whichever has room */}
      {newCommentData && (
        <div
          data-tt-comment-box=""
          className="tt-menu-surface absolute z-30 w-64 rounded-lg border border-gray-200 text-gray-900 dark:border-[#2f2f2f] dark:text-gray-100"
          style={{
            top: 'var(--tt-adjust-pad-y-top, 0px)', // Fill top — select must not pin to the property band
            ...(commentSide === 'right'
              ? { left: '100%', marginLeft: commentBoxGapCss() } // Off the fill, not past the disc
              : { right: '100%', marginRight: commentBoxGapCss() }),
          }}
        >
          <div className="p-3 flex items-center justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => {
                setNewCommentData(null)
                if (comments.length === 0) setShowComments(false) // Empty panel: X = toggle off
              }}
            >
              <X className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </Button>
          </div>
          <div className="p-3 pt-0">
            <Textarea
              ref={newCommentTextareaRef}
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder="Add a comment..."
              data-comment-input="true"
              className="text-sm resize-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400"
              style={{
                borderRadius: '26px', // Always pill shape - fully rounded sides
                minHeight: '52px', // Minimum height (2x corner radius) - ensures fully rounded sides at default
                paddingLeft: '16px',
                paddingRight: '16px',
                paddingTop: '0px', // No top padding to maintain pill shape (will be adjusted by useEffect)
                paddingBottom: '0px', // No bottom padding to maintain pill shape (will be adjusted by useEffect)
                boxSizing: 'border-box',
                // Height and padding will be adjusted by useEffect to maintain pill shape
              }}
              autoFocus
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setNewCommentData(null)
                  if (comments.length === 0) setShowComments(false) // Empty panel: Cancel = toggle off
                }}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveComment}
                disabled={!newCommentText.trim()}
                className="text-xs rounded-full"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Emoji reaction pills - appear to the right, vertically aligned with selected text */}
      {emojiReactions.length > 0 && (
        <div>
          {emojiReactions.map((reaction) => {
            // Calculate vertical position based on text position in editor
            const editor = reaction.section === 'prompt' ? promptEditorRef.current : responseEditorRef.current
            let topPosition = 0

            if (editor && panelRef.current) {
              try {
                const coords = editor.view.coordsAtPos(reaction.from)
                const panelRect = panelRef.current.getBoundingClientRect()
                if (panelRect && coords) {
                  // Calculate position relative to panel top - align with top of selection
                  topPosition = coords.top - panelRect.top
                }
              } catch (error) {
                console.error('Error calculating emoji reaction position:', error)
              }
            }

            return (
              <EmojiReactionPill
                key={reaction.id}
                reaction={reaction}
                topPosition={topPosition}
                onAddReaction={() => {
                  // When clicking the pill, increment the count
                  setEmojiReactions(prev =>
                    prev.map(r =>
                      r.id === reaction.id
                        ? { ...r, count: r.count + 1 }
                        : r
                    )
                  )
                }}
              />
            )
          })}
        </div>
      )}

      {/* Comment panels — left or right of the frame, aligned with highlighted text */}
      {showComments && comments.length > 0 && (
        <div 
          ref={commentPanelsRef}
          className={cn(
            // Comments blur the same as non-flashcard map content during nav mode
            shouldBlurComments && 'blur-sm opacity-40 pointer-events-none'
          )}
        >
          {comments.map((comment) => {
            // Calculate vertical position based on text position in editor
            const editor = comment.section === 'prompt' ? promptEditorRef.current : responseEditorRef.current
            let topPosition = 0

            if (editor && panelRef.current) {
              try {
                const coords = editor.view.coordsAtPos(comment.from)
                const panelRect = panelRef.current.getBoundingClientRect()
                if (panelRect && coords) {
                  // Calculate position relative to panel top
                  topPosition = coords.top - panelRect.top + (coords.bottom - coords.top) / 2 // Center of selection
                }
              } catch (error) {
                console.error('Error calculating comment position:', error)
              }
            }

            const isSelected = selectedCommentId === comment.id

            return (
              <CommentPanel
                key={comment.id}
                comment={comment}
                isSelected={isSelected}
                side={commentSide}
                topPosition={topPosition}
                onSelect={() => {
                  const newSelectedId = isSelected ? null : comment.id
                  setSelectedCommentId(newSelectedId)
                  // Clear reply text when deselecting
                  if (!newSelectedId && replyTexts[comment.id]) {
                    setReplyTexts(prev => {
                      const updated = { ...prev }
                      delete updated[comment.id]
                      return updated
                    })
                  }
                }}
                onDelete={() => {
                  setComments(prev => prev.filter(c => c.id !== comment.id))
                  if (selectedCommentId === comment.id) {
                    setSelectedCommentId(null)
                  }
                }}
                replyText={replyTexts[comment.id] || ''}
                onReplyChange={(text) => setReplyTexts(prev => ({ ...prev, [comment.id]: text }))}
                replyTextareaRef={(el) => {
                  if (el) {
                    replyTextareaRefs.current[comment.id] = el
                  } else {
                    delete replyTextareaRefs.current[comment.id]
                  }
                }}
              />
            )
          })}
        </div>
      )}
      
      {/* Flashcard tags only — copy / collapse / more under-item menu removed */}
      {selected && isFlashcard && responseMessage?.id && tagsLoaded && (
        <div 
          className="absolute left-0 flex items-start gap-1 bg-white dark:bg-[#1f1f1f] rounded-lg shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-1 z-50 pointer-events-auto"
          style={{
            top: '100%', // Position below the panel
            marginTop: '8px', // Gap between panel and toolbar (matches note resize toolbar gap)
          }}
          onClick={(e) => e.stopPropagation()} // Prevent clicks from propagating to panel
        >
          <TagButton responseMessageId={responseMessage.id} />
          <TagBoxes responseMessageId={responseMessage.id} initialTagIds={tagIds} />
        </div>
      )}
      
    </div>
  )
}

// Separate component for emoji reaction pill
function EmojiReactionPill({
  reaction,
  topPosition,
  onAddReaction,
}: {
  reaction: EmojiReaction
  topPosition: number
  onAddReaction: () => void
}) {
  return (
    <div
      className="absolute pointer-events-auto z-[100]"
      style={{
        top: `${topPosition}px`,
        right: '-48px', // Position to the right of panel, similar to comment button popup
      }}
    >
      <button
        onClick={onAddReaction}
        className="bg-white dark:bg-[#1f1f1f] rounded-full shadow-md border border-gray-200 dark:border-[#2f2f2f] px-2 py-1 flex items-center gap-1.5 hover:shadow-lg transition-shadow"
        title="Click to add reaction"
      >
        <span className="text-base">{reaction.emoji}</span>
        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">{reaction.count}</span>
      </button>
    </div>
  )
}

// Separate component for comment panel to manage hover state
function CommentPanel({
  comment,
  isSelected,
  side = 'right',
  topPosition,
  onSelect,
  onDelete,
  replyText,
  onReplyChange,
  replyTextareaRef
}: {
  comment: Comment
  isSelected: boolean
  side?: 'left' | 'right' // Park on the side with room
  topPosition: number
  onSelect: () => void
  onDelete: () => void
  replyText: string
  onReplyChange: (text: string) => void
  replyTextareaRef: (el: HTMLTextAreaElement | null) => void
}) {
  const [isHovering, setIsHovering] = useState(false)

  return (
    <div
      data-tt-comment-box=""
      className="tt-menu-surface absolute z-30 w-64 cursor-pointer rounded-lg border border-gray-200 text-gray-900 dark:border-[#2f2f2f] dark:text-gray-100"
      style={{
        top: `${topPosition}px`,
        transform: 'translateY(-50%)', // Center vertically with highlighted text
        ...(side === 'right'
          ? { left: '100%', marginLeft: commentBoxGapCss() } // Off the fill, not past the disc
          : { right: '100%', marginRight: commentBoxGapCss() }),
      }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onClick={(e) => {
        // Stop propagation to prevent click-away from firing when clicking on the panel
        e.stopPropagation()
        // Only handle clicks on the panel itself, not on child elements
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest('.p-3')) {
          onSelect()
        }
      }}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 text-sm text-gray-700 dark:text-gray-300 break-words min-w-0">
            {comment.comment}
          </div>
          {/* More menu button - only show on hover when not selected (condensed version), always show when selected */}
          {((!isSelected && isHovering) || isSelected) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4 text-gray-600 dark:text-gray-300" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete()
                  }}
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Reply input box - only shown when comment is selected */}
        {isSelected && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-[#2f2f2f]">
            <Textarea
              ref={replyTextareaRef}
              value={replyText}
              onChange={(e) => onReplyChange(e.target.value)}
              placeholder="Reply or add others with @"
              data-comment-input="true"
              className="w-full text-sm resize-none focus-visible:ring-1 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400"
              style={{
                borderRadius: '26px', // Always pill shape - fully rounded sides
                minHeight: '52px', // Minimum height (2x corner radius) - ensures fully rounded sides at default
                paddingLeft: '16px',
                paddingRight: '16px',
                paddingTop: '0px', // No top padding to maintain pill shape (will be adjusted by useEffect)
                paddingBottom: '0px', // No bottom padding to maintain pill shape (will be adjusted by useEffect)
                boxSizing: 'border-box',
                // Height and padding will be adjusted by useEffect to maintain pill shape
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// The comparator only guards props. Context is the other way in, and it accounted for every pan-time
// re-render this frame used to do — see PhoneFrameDragProvider.
export const ChatPanelNode = memo(
  ChatPanelNodeInner,
  (prev, next) =>
    prev.id === next.id &&
    prev.selected === next.selected &&
    prev.dragging === next.dragging &&
    prev.data === next.data &&
    prev.type === next.type
)

