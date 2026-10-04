'use client'

// React NodeView for propertyBlock: cell box with the type icon inside + Empty placeholder.
// Every property is a block in the frame (including older empty cells that used to sit above it).

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NodeViewWrapper, type Editor, type NodeViewProps } from '@tiptap/react'
import { cn } from '@/lib/utils'
import {
  isPropertyTypeId,
  propertyTypeLabel,
  type PropertyTypeId,
} from '@/lib/blocks/property'
import { PropertyIconWithTooltip } from '@/components/property-icon-with-tooltip' // Type glyph + name popup
import { PropertyValuePopup, type PropertyEditorAnchor } from '@/components/property-value-popup' // Calendar / checkbox / text
import { PropertyMenu, type PropertyMenuAction } from '@/components/property-menu' // Icon click → property menu
import {
  bindPropertyIconDrag,
  type PropertyDropLine,
} from '@/lib/tiptap/property-block-drag' // Reorder among property cells
import { PropertyDropLinePortal } from '@/components/property-drop-line-portal' // Blue dashed insert line
import {
  isPropertyBlockInline,
  updatePropertyBlockAttrs,
  insertPropertyBlockBeside,
  duplicatePropertyBlock,
  deletePropertyBlock,
} from '@/lib/tiptap/property-block'
import { setFrameTextEditActive } from '@/lib/frame-text-edit' // Value caret — Delete edits text, not the frame

// Caret room past the last glyph — the frame hug reads the width we set here, so any slack
// has to live in this one number or the cell ends up wider than the frame and clips.
const VALUE_CARET_PAD = 2

/**
 * Glyph run of `text` in the cell's own font. Probe lives on `document.body` (outside the RF
 * transform), so the result is already local px — and it never reads the cell's own layout,
 * which would make the width depend on the width we are about to set.
 */
function measureValueWidth(el: HTMLElement, text: string): number {
  const probe = document.createElement('span')
  const cs = getComputedStyle(el)
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.whiteSpace = 'pre'
  probe.style.font = cs.font
  probe.style.letterSpacing = cs.letterSpacing
  probe.textContent = text
  document.body.appendChild(probe)
  const w = probe.getBoundingClientRect().width
  probe.remove()
  return Math.ceil(w) + VALUE_CARET_PAD
}

/** Position of this property cell in the current doc. `getPos` stays stale after a content replace. */
function propertyPosFromDom(
  editor: Editor, // Host editor — its doc is the source of truth
  dom: HTMLElement | null, // Textarea inside the node view
  getPos: (() => number | undefined) | undefined, // Fallback when the DOM is not mapped yet
  node: NodeViewProps['node'] // Same cell — match it if the saved position is past the fragment
): number | null {
  if (!editor || editor.isDestroyed) return null // View is gone
  const doc = editor.state.doc // Current fragment — not the one getPos was captured against
  const size = doc.content.size // Valid positions are 0..size
  const accept = (pos: number | null | undefined): number | null => {
    if (typeof pos !== 'number' || !Number.isFinite(pos)) return null // Unmapped
    if (pos < 0 || pos > size) return null // The reported crash: position past the fragment
    const direct = pos < size ? doc.nodeAt(pos) : null // Atom starts at this pos
    if (direct?.type.name === 'propertyBlock') return pos // Exact node
    const $pos = doc.resolve(Math.min(Math.max(0, pos), size)) // posAtDOM can land beside the atom
    for (let d = $pos.depth; d > 0; d--) {
      if ($pos.node(d).type.name !== 'propertyBlock') continue // Keep walking up
      return $pos.before(d) // Start of the cell, safe for setNodeMarkup
    }
    return null // Not a property cell
  }
  if (dom) {
    try {
      const fromDom = accept(editor.view.posAtDOM(dom, 0)) // Map the live textarea, not the saved pos
      if (fromDom != null) return fromDom // DOM wins when the node view position is stale
    } catch {
      // Detached DOM — try getPos below
    }
  }
  const mapped = accept(getPos?.()) // Bounds-checked saved position
  if (mapped != null) return mapped
  let only: number | null = null // One matching cell in this frame
  let hits = 0 // More than one means we cannot guess
  doc.descendants((child, pos) => {
    if (child.type.name !== 'propertyBlock') return false // Skip text blocks
    const same =
      child === node ||
      (child.attrs.propertyType === node.attrs.propertyType &&
        child.attrs.propertyName === node.attrs.propertyName &&
        child.attrs.value === node.attrs.value) // Attrs survive a content replace that drops the old node object
    if (!same) return false
    hits += 1
    only = pos
    return false // Atom — no children
  })
  return hits === 1 ? only : null // Unique cell still gets the typed value
}

/**
 * Caret index under a click on the value. The textarea’s screen rect already includes board
 * zoom, so this does not use ProseMirror positions (those snap out of the cell).
 */
export function caretIndexInTextarea(
  input: HTMLTextAreaElement, // Property value — not the frame editor
  clientX: number, // Click, viewport px
  clientY: number // Click, viewport px
): number {
  const text = input.value // Placeholder "Empty" is not an offset in the value
  if (!text) return 0 // Empty cell — the I-bar sits at the start
  const style = getComputedStyle(input) // Font the glyphs paint at
  const ctx = document.createElement('canvas').getContext('2d') // Widths without reflowing the cell
  if (!ctx) return text.length // No canvas — the end is closer than a jump to the start
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`.trim() // Same face as the value
  const rect = input.getBoundingClientRect() // Screen box — board zoom is already in it
  const padL = parseFloat(style.paddingLeft) || 0 // Click x starts after the padding
  const padT = parseFloat(style.paddingTop) || 0 // Click y starts after the padding
  const x = clientX - rect.left - padL + (input.scrollLeft || 0) // Local x in the text
  const y = clientY - rect.top - padT + (input.scrollTop || 0) // Local y in the text
  const lh = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 14) * 1.7 // One line box
  const targetLine = Math.max(0, Math.floor(y / lh)) // Wrapped line under the pointer
  const padR = parseFloat(style.paddingRight) || 0 // Right inset is not a glyph
  const innerW = Math.max(1, input.clientWidth - padL - padR) // Where pre-wrap breaks
  const wraps = style.whiteSpace !== 'pre' && style.whiteSpace !== 'nowrap' // Fit-to-text stays one line
  const indexOnLine = (start: number, end: number): number => {
    let lo = start // Left of the search
    let hi = end // Exclusive end of this visual line
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1 // Bias high so the glyph under the click wins
      if (ctx.measureText(text.slice(start, mid)).width <= x) lo = mid // Click is still to the right
      else hi = mid - 1 // Click is left of this midpoint
    }
    return lo // Index to place the I-bar
  }
  if (!wraps) return indexOnLine(0, text.length) // Nowrap — the whole value is one line
  let line = 0 // Visual line being measured
  let lineStart = 0 // Value index where this line begins
  let i = 0 // Scan cursor
  while (i < text.length) {
    if (text[i] === '\n') {
      if (line === targetLine) return indexOnLine(lineStart, i) // Hard break ends the clicked line
      line += 1 // Next visual line
      i += 1 // Skip the break itself
      lineStart = i // Next line starts after the break
      continue
    }
    const w = ctx.measureText(text.slice(lineStart, i + 1)).width // Width if this char stays on the line
    if (i > lineStart && w > innerW) {
      if (line === targetLine) return indexOnLine(lineStart, i) // Wrap before this char
      line += 1 // This char starts the next line
      lineStart = i // Don't consume it yet
      continue
    }
    i += 1 // Char fits on this line
  }
  if (line === targetLine) return indexOnLine(lineStart, text.length) // Click on the last line
  return text.length // Click below the value — I-bar at the end
}

function propertyTypeNeedsPopup(type: PropertyTypeId): boolean {
  return (
    type === 'date' ||
    type === 'createdTime' ||
    type === 'lastEditedTime' ||
    type === 'checkbox' ||
    type === 'select' ||
    type === 'status' ||
    type === 'multiSelect'
  )
}

export function PropertyBlockView({ node, selected, editor, getPos }: NodeViewProps) {
  const rawType = node.attrs.propertyType as string
  const propertyType: PropertyTypeId = isPropertyTypeId(rawType) ? rawType : 'text'
  const stored = typeof node.attrs.value === 'string' ? node.attrs.value : ''
  const propertyName = typeof node.attrs.propertyName === 'string' ? node.attrs.propertyName : ''
  const inline = isPropertyBlockInline(node.attrs as Record<string, unknown>)
  const [draft, setDraft] = useState(stored)
  const label = propertyTypeLabel(propertyType)
  const iconRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [editorOpen, setEditorOpen] = useState<PropertyEditorAnchor | null>(null)
  const [menuOpen, setMenuOpen] = useState<PropertyEditorAnchor | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number; type: PropertyTypeId } | null>(null)
  const [dropLine, setDropLine] = useState<PropertyDropLine | null>(null)
  const [canEditCell, setCanEditCell] = useState(() => !!editor?.isEditable)
  // Frame is in "fit to text" (nowrap) mode — same flag the text blocks key off. The host
  // toggles both attributes via setOptions/DOM (no transaction), so watch, never read once.
  const [nowrap, setNowrap] = useState(false)

  useEffect(() => {
    const dom = editor?.view?.dom as HTMLElement | undefined
    if (!dom) return
    const sync = () => {
      setCanEditCell(!!editor?.isEditable)
      setNowrap(dom.getAttribute('data-single-line') === 'true')
    }
    sync()
    const mo = new MutationObserver(sync)
    mo.observe(dom, { attributes: true, attributeFilter: ['contenteditable', 'data-single-line'] })
    return () => mo.disconnect()
  }, [editor])

  useEffect(() => {
    setDraft(stored)
  }, [stored])

  const writeValue = useCallback((value: string) => {
    if (!editor || editor.isDestroyed) return // Editor gone mid-blur
    const from = propertyPosFromDom(editor, inputRef.current, getPos, node) // Live pos — updateAttributes used a stale 49
    if (from == null) return // Doc shrank under this node view; skip rather than throw
    updatePropertyBlockAttrs(editor, from, { value }) // setNodeMarkup only when the cell is in range
  }, [editor, getPos, node])

  const commit = useCallback(() => {
    const next = draft.trim()
    if (next === stored) return
    writeValue(next) // Blur / Enter — same path as the empty toggle
  }, [draft, stored, writeValue])

  const openAtIcon = useCallback((set: (a: PropertyEditorAnchor) => void) => {
    const el = iconRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    set({ left: r.left, top: r.top, width: r.width, height: r.height })
  }, [])

  const openValuePopup = useCallback(() => {
    openAtIcon(setEditorOpen) // Value editors still park on the icon box
  }, [openAtIcon])

  const openPropertyMenu = useCallback(() => {
    openAtIcon(setMenuOpen) // Icon click opens the property menu, not the value editor
  }, [openAtIcon])

  const onMenuAction = useCallback(
    (action: PropertyMenuAction, payload?: { type?: PropertyTypeId; name?: string }) => {
      if (!editor || editor.isDestroyed) return
      const from = getPos?.()
      if (from == null || from < 0) return
      if (action === 'editType' && payload?.type) updatePropertyBlockAttrs(editor, from, { propertyType: payload.type })
      else if (action === 'editName' && payload?.name != null) updatePropertyBlockAttrs(editor, from, { propertyName: payload.name })
      else if (action === 'displayIcon') updatePropertyBlockAttrs(editor, from, { inline: false }) // Back to the top strip
      else if (action === 'displayInline') updatePropertyBlockAttrs(editor, from, { inline: true }) // Empty cell in the body
      else if (action === 'insertLeft') insertPropertyBlockBeside(editor, from, 'left')
      else if (action === 'insertRight') insertPropertyBlockBeside(editor, from, 'right')
      else if (action === 'duplicate') duplicatePropertyBlock(editor, from)
      else if (action === 'delete') deletePropertyBlock(editor, from)
    },
    [editor, getPos]
  )

  const focusInput = useCallback((clientX: number, clientY: number) => {
    const input = inputRef.current // Value field — the I-bar lives here, not in the frame editor
    if (!input) return // Unmounted mid-press
    input.focus() // Show the caret even when the press hit cell padding
    const idx = caretIndexInTextarea(input, clientX, clientY) // Where the pointer landed
    input.setSelectionRange(idx, idx) // Keep that spot — the end would jump the I-bar
  }, [])

  // A textarea has no intrinsic size: `cols` drives width and `rows` drives height.
  // Fit-to-text (nowrap) gets an explicit glyph width so the cell hugs one line, same as a
  // text block, and the frame hug reads that width. Wrap (and free wrap) clears it so the
  // value reflows in the column and the cell grows taller with the lines.
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const keepCaret = (mutate: () => void) => {
      const focused = document.activeElement === el // Hug must not kick the I-bar out of the value
      const start = focused ? el.selectionStart : null // Caret before this size write
      const end = focused ? el.selectionEnd : null // Selection end, same moment
      mutate() // Width/height changes are sync and can move the caret
      if (start == null || end == null) return // Wasn't editing this cell
      if (document.activeElement !== el) return // Focus left — don't pull it back
      el.setSelectionRange(start, end) // Chrome drops the caret when the textarea is resized
    }
    const fitHeight = () => {
      keepCaret(() => {
        el.style.height = 'auto' // scrollHeight is the content, not the previous fit
        el.style.height = `${el.scrollHeight}px` // Hug the lines — a textarea has no intrinsic height
      })
    }
    if (nowrap) {
      keepCaret(() => {
        el.style.width = `${measureValueWidth(el, draft || 'Empty')}px` // Glyph width — cols would ignore the value
        el.style.height = 'auto' // Same hug as wrap, inside the same caret restore
        el.style.height = `${el.scrollHeight}px` // One line tall once the width is the text
      })
      return
    }
    el.style.width = ''
    fitHeight()
    let lastW = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastW) return // Height-only change — must not re-enter
      lastW = el.clientWidth
      fitHeight()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [draft, nowrap, canEditCell])

  const onIconPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!canEditCell || !editor || editor.isDestroyed) return
      const from = getPos?.()
      if (from == null || from < 0) return
      bindPropertyIconDrag(e, {
        getEditor: () => editor,
        from,
        el: e.currentTarget,
        iconType: propertyType,
        onClick: () => openPropertyMenu(),
        callbacks: { setGhost, setDropLine },
      })
    },
    [canEditCell, editor, getPos, propertyType, openPropertyMenu]
  )

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        'tt-property-block nokey',
        canEditCell && 'nodrag',
        selected && canEditCell && 'tt-property-block-selected'
      )}
      data-type="propertyBlock"
      data-inline={inline ? 'true' : undefined}
      data-tt-property-popup={propertyTypeNeedsPopup(propertyType) ? 'true' : undefined} // Date/checkbox — no text I-bar
    >
      <div className="tt-property-block-row">
        <div
          className="tt-property-block-cell"
          onPointerDown={(e) => {
            if (!canEditCell) return
            if ((e.target as HTMLElement).closest('.tt-property-block-input')) return
            if ((e.target as HTMLElement).closest('[data-tt-property-icon]')) return
            e.stopPropagation()
            e.preventDefault()
            if (propertyTypeNeedsPopup(propertyType)) openValuePopup()
            else {
              const host = (editor?.storage as { frameHost?: { hostNodeId?: string | null } } | undefined)
                ?.frameHost?.hostNodeId // This frame — text-edit is per host
              if (host) setFrameTextEditActive(host) // Keep the I-bar if mousedown is canceled
              focusInput(e.clientX, e.clientY) // I-bar at the click, not the end of the value
            }
          }}
        >
          <span ref={iconRef} className="inline-flex">
            <PropertyIconWithTooltip
              type={propertyType}
              name={propertyName}
              className={cn('tt-property-block-icon', canEditCell && 'cursor-grab active:cursor-grabbing')}
              iconClassName="h-3.5 w-3.5" // 14px — match frame text, not the default 16px glyph
              onPointerDown={onIconPointerDown}
            />
          </span>
          {/* Textarea, not input: a long value **wraps** inside the fixed column instead of
              ellipsizing, so the frame grows in height and never cuts text off. Enter still
              blurs (below), so the value stays single-line data. */}
          <span className="tt-property-block-value">
            <textarea
              ref={inputRef}
              rows={1}
              className={cn('tt-property-block-input', !canEditCell && 'pointer-events-none')}
              value={draft}
              placeholder="Empty"
              aria-label={`${propertyName.trim() || label} value`}
              readOnly={!canEditCell}
              tabIndex={canEditCell ? 0 : -1}
              onPointerDown={(e) => {
                if (!canEditCell) return
                e.stopPropagation()
              }}
              onMouseDown={(e) => {
                if (!canEditCell) {
                  e.preventDefault()
                  return
                }
              }}
              onClick={(e) => {
                if (!canEditCell) return
                e.stopPropagation()
              }}
              onChange={(e) => {
                const v = e.target.value
                setDraft(v)
                const wasEmpty = !stored.trim()
                const nowEmpty = !v.trim()
                if (wasEmpty !== nowEmpty) {
                  writeValue(nowEmpty ? '' : v.trim()) // Crossing empty used the same stale position
                }
              }}
              onBlur={commit}
              onKeyDown={(e) => {
                if (!canEditCell) return
                e.stopPropagation()
                if (e.key === 'Enter') {
                  e.preventDefault()
                  e.currentTarget.blur()
                }
              }}
            />
          </span>
        </div>
      </div>
      <PropertyValuePopup
        open={!!editorOpen}
        anchor={editorOpen}
        type={propertyType}
        name={propertyName}
        value={stored}
        onCommit={(next) => {
          setDraft(next)
          writeValue(next) // Calendar / checkbox — same live position as the textarea
        }}
        onClose={() => setEditorOpen(null)}
      />
      <PropertyMenu
        open={!!menuOpen}
        anchor={menuOpen}
        type={propertyType}
        name={propertyName}
        inline={inline}
        onAction={onMenuAction}
        onClose={() => setMenuOpen(null)}
      />
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
    </NodeViewWrapper>
  )
}
