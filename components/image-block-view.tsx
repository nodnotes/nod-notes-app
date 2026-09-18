'use client'

// React NodeView for imageBlock: empty → Upload / Embed placeholder; src set → selectable <img> + menu.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useStore } from 'reactflow' // Remeasure upload-menu anchor when board zoom changes
import { navigationZoom } from '@/lib/board-navigating' // Freeze mid-pinch — avoid remounting every tick
import { frameScreenChromeScale } from '@/components/threads/constants' // Screen-constant chrome (1/zoom)
import { Check, Image as ImageIcon, Link2, Upload, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  ImageBlockHoverToolbar,
  ImageBlockMenu,
  type ImageBlockMenuAction,
  type ImageResizePreset,
} from '@/components/image-block-menu'
import {
  cropToClipPath,
  parseImageCrop,
  removeImageBackground,
  serializeImageCrop,
  type ImageCrop,
} from '@/lib/tiptap/image-block-crop'

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 // Keep data: URLs from exploding message HTML
const UPLOAD_MENU_W = 220 // Screen px — same ballpark as BlockActionsMenu / frame menus

/** Match `lib/tiptap/image-block` — keep local to avoid circular import with the NodeView. */
function clampImageScale(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(1, Math.max(0.05, n))
}

type CropDrag =
  | { kind: 'move'; startX: number; startY: number; start: ImageCrop }
  | { kind: 'se'; startX: number; startY: number; start: ImageCrop }

/** Side-edge width drag — Notion-style; aspect locked via shared scale on W+H. */
type SideResizeDrag = {
  side: 'left' | 'right'
  startX: number
  startScale: number
  fullW: number // Width at scale=1 (contain-fit 100%)
  pointerId: number
}

export function ImageBlockView({
  node,
  updateAttributes,
  editor,
  getPos,
}: NodeViewProps) {
  const src = (node.attrs.src as string | null) || null
  const alt = (node.attrs.alt as string) || ''
  // Schema attr is `scale` (0–1 of contain-fit). Legacy widthPct UI maps 25→0.25 … 100→1.
  const imageScale = clampImageScale(
    node.attrs.scale != null
      ? Number(node.attrs.scale)
      : node.attrs.widthPct != null
        ? Number(node.attrs.widthPct) / 100
        : 1
  )
  const widthPct = Math.round(imageScale * 100) // Menu highlight / data attr (25|50|75|100)
  const hazed = !!node.attrs.hazed
  const cropAttr = (node.attrs.crop as string | null) || null // Stable dep — parseImageCrop() returns a new object each call
  const crop = parseImageCrop(cropAttr)
  const fileRef = useRef<HTMLInputElement>(null)
  const mediaRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const uploadAnchorRef = useRef<HTMLDivElement>(null) // In-flow stub — portaled menu pins to its screen box
  const [embedOpen, setEmbedOpen] = useState(false)
  const [embedValue, setEmbedValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState(false) // Temporary unblur (like Hide text)
  const [cropMode, setCropMode] = useState(false)
  const [draftCrop, setDraftCrop] = useState<ImageCrop>(crop)
  const [menuAnchor, setMenuAnchor] = useState<{
    left: number
    top: number
    width: number
    height: number
  } | null>(null)
  const [uploadAnchor, setUploadAnchor] = useState<{ left: number; top: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const cropDragRef = useRef<CropDrag | null>(null)
  const sideDragRef = useRef<SideResizeDrag | null>(null)
  const [sideResizing, setSideResizing] = useState(false) // Keep hover chrome while dragging a side pill
  const [armed, setArmed] = useState(false) // Node selected (click) — blue ring on media
  const [hovered, setHovered] = useState(false) // Pointer over image / hover toolbar
  const [moreOpen, setMoreOpen] = useState(false) // Second menu from ⋯
  const armingRef = useRef(false) // Skip selectionUpdate disarm during the arm gesture
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toolbarRef = useRef<HTMLDivElement>(null) // In-flow hover pill — More menu anchors here
  const [chromeScale, setChromeScale] = useState(1) // Screen-constant counter-scale (hover pill + side handles)
  const [natural, setNatural] = useState({ w: 0, h: 0 }) // Bitmap intrinsic px — for contain-fit
  const [frameBox, setFrameBox] = useState({ w: 0, h: 0 }) // Content area the image must fit inside
  const [freeResize, setFreeResize] = useState(false) // Unlocked frame — keep bitmap size; clip like text
  const freeResizeRef = useRef(false) // Sync free flag for measure without stale closures
  // Last fit-to painted size — free mode uses this so unlock cannot re-contain / grow / shrink
  const lockedDisplayRef = useRef<{ w: number; h: number } | null>(null)
  const lockedFrameBoxRef = useRef<{ w: number; h: number } | null>(null) // Frame box at last locked measure
  const [frozenDisplay, setFrozenDisplay] = useState<{ w: number; h: number } | null>(null)
  const zoom = useStore((s) =>
    navigationZoom(Math.round((s.transform[2] || 1) * 8) / 8)
  ) // Remeasure portaled Upload menu when zoom settles / steps
  // Live zoom for screen-constant chrome — must track mid-pinch (navigationZoom freezes)
  const liveZoom = useStore((s) => Math.round((s.transform[2] || 1) * 64) / 64)

  useEffect(() => {
    if (!hazed) setRevealed(false)
  }, [hazed])

  // Contain viewport = sticky frame content box (CSS vars from chat-panel) or contentFit/panel layout size.
  // Free frame: freeze painted size + ignore live frameBox so unlock/clip only windows the bitmap.
  // Never observe the media/img — that fed back into hug/RO loops.
  useLayoutEffect(() => {
    if (!src) {
      setFrameBox({ w: 0, h: 0 })
      setFreeResize(false)
      freeResizeRef.current = false
      setFrozenDisplay(null)
      lockedDisplayRef.current = null
      lockedFrameBoxRef.current = null
      return
    }
    const el = mediaRef.current
    if (!el) return

    const readCssFrame = (host: HTMLElement) => {
      const cs = getComputedStyle(host)
      const w = parseFloat(cs.getPropertyValue('--tt-image-frame-w')) || 0
      const h = parseFloat(cs.getPropertyValue('--tt-image-frame-h')) || 0
      if (w >= 1 && h >= 1) return { w: Math.round(w), h: Math.round(h) }
      return null
    }

    // contentFit sets the flag in render; ProseMirror sets it in useEffect (lags on free→fit).
    // Only trust contentFit so lock remasures contain-fit against the live sticky box.
    const isFreeResize = () => {
      const fit = el.closest('[data-tt-content-fit="true"]') as HTMLElement | null
      if (fit) return fit.getAttribute('data-frame-free-resize') === 'true'
      return !!el.closest('[data-frame-free-resize="true"]')
    }

    const captureFrozen = () => {
      // Prefer last locked computed size; fall back to painted media box
      const fromLocked = lockedDisplayRef.current
      if (fromLocked && fromLocked.w >= 1 && fromLocked.h >= 1) return fromLocked
      const w = Math.round(el.offsetWidth)
      const h = Math.round(el.offsetHeight)
      if (w >= 1 && h >= 1) return { w, h }
      return null
    }

    const measureLiveFrameBox = () => {
      const fit = el.closest('[data-tt-content-fit="true"]') as HTMLElement | null
      const panel = el.closest('[data-panel-container="true"]') as HTMLElement | null
      const fromCss = (fit && readCssFrame(fit)) || (panel && readCssFrame(panel))
      if (fromCss) {
        lockedFrameBoxRef.current = fromCss
        setFrameBox((prev) =>
          prev.w === fromCss.w && prev.h === fromCss.h ? prev : fromCss
        )
        return
      }
      const host = fit || panel
      if (!host) return
      const cs = getComputedStyle(host)
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
      // client* = layout px (stable under board CSS transform); minus pad = peach content area
      const w = Math.max(1, Math.round(host.clientWidth - padX))
      const h = Math.max(1, Math.round(host.clientHeight - padY))
      const next = { w, h }
      lockedFrameBoxRef.current = next
      setFrameBox((prev) => (prev.w === w && prev.h === h ? prev : next))
    }

    const measure = () => {
      const free = isFreeResize()
      const wasFree = freeResizeRef.current
      freeResizeRef.current = free
      setFreeResize((prev) => (prev === free ? prev : free))
      if (free) {
        // Freeze once on enter — snapshot current contain viewport; ignore later CSS var changes
        if (!wasFree) measureLiveFrameBox()
        setFrozenDisplay((prev) => prev ?? captureFrozen())
        // Fight races that write live (post-free) vars before the free flag lands
        const locked = lockedFrameBoxRef.current
        if (locked && locked.w >= 1 && locked.h >= 1) {
          setFrameBox((prev) =>
            prev.w === locked.w && prev.h === locked.h ? prev : locked
          )
        }
        return
      }
      // free→fit: drop freeze and remasure live sticky box (may differ after free resize)
      if (wasFree) setFrozenDisplay(null)
      else setFrozenDisplay((prev) => (prev == null ? prev : null))
      measureLiveFrameBox()
    }

    measure()
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    const fit = el.closest('[data-tt-content-fit="true"]') as HTMLElement | null
    const panel = el.closest('[data-panel-container="true"]') as HTMLElement | null
    const pm = el.closest('.ProseMirror') as HTMLElement | null
    if (fit) ro.observe(fit)
    if (panel && panel !== fit) ro.observe(panel)
    const mo =
      fit != null || pm != null
        ? new MutationObserver(() => requestAnimationFrame(measure))
        : null
    if (fit && mo) {
      mo.observe(fit, {
        attributes: true,
        attributeFilter: ['style', 'data-frame-free-resize'],
      })
    }
    if (pm && mo) mo.observe(pm, { attributes: true, attributeFilter: ['data-frame-free-resize'] })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [src, zoom, imageScale])

  // Reset natural size when src changes; onLoad may fire from cache before effect runs
  useEffect(() => {
    setNatural({ w: 0, h: 0 })
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight })
    }
  }, [src])

  // Pin Upload / Embed to the stub’s screen position (menu itself is fixed px — ignores board zoom)
  useLayoutEffect(() => {
    if (src) {
      setUploadAnchor(null)
      return
    }
    const el = uploadAnchorRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width < 0.5 && r.height < 0.5) return
      setUploadAnchor((prev) => {
        if (prev && Math.abs(prev.left - r.left) < 0.5 && Math.abs(prev.top - r.top) < 0.5) {
          return prev
        }
        return { left: r.left, top: r.top }
      })
    }
    measure()
    const raf = requestAnimationFrame(measure)
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    ro.observe(el)
    const panel = el.closest('[data-panel-container="true"]') as HTMLElement | null
    if (panel) ro.observe(panel)
    const vp = el.closest('.react-flow__viewport')
    const mo = vp ? new MutationObserver(() => requestAnimationFrame(measure)) : null
    if (vp && mo) mo.observe(vp, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      mo?.disconnect()
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [src, zoom, embedOpen])

  useEffect(() => {
    if (!cropMode) setDraftCrop(parseImageCrop(cropAttr))
  }, [cropAttr, cropMode])

  // Drop arm when the editor selection leaves this image block
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const sync = () => {
      if (armingRef.current) return
      const pos = getPos?.()
      if (pos == null || pos < 0) return
      const { selection } = editor.state
      const onThis =
        (selection as { node?: { type: { name: string } } }).node?.type.name === 'imageBlock' &&
        selection.from === pos
      if (!onThis && armed) {
        setArmed(false)
        setMoreOpen(false)
      }
    }
    editor.on('selectionUpdate', sync)
    return () => {
      editor.off('selectionUpdate', sync)
    }
  }, [editor, getPos, armed])

  // Outside click dismisses More menu + arm (hover toolbar stays pointer-driven)
  useEffect(() => {
    if (!armed && !moreOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (
        t.closest?.(
          '[data-tt-image-menu], [data-tt-image-upload-menu], [data-tt-image-side-handle], .tt-image-block-media, .tt-image-block-crop-box, .tt-image-block-crop-toolbar'
        )
      ) {
        return
      }
      setArmed(false)
      setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [armed, moreOpen])

  // Screen-constant chrome — pure 1/zoom like resize dots / gutters (not √ text comfort).
  // Hover pill + side handles stay the same visual size at every board zoom.
  useLayoutEffect(() => {
    if (!src || (!hovered && !moreOpen && !armed && !sideResizing)) return
    const factor = frameScreenChromeScale(liveZoom)
    setChromeScale((p) => (Math.abs(p - factor) < 0.01 ? p : factor))
  }, [src, hovered, moreOpen, armed, sideResizing, liveZoom])

  // More menu only — re-anchor the portaled dropdown while open (hover pill is in-flow).
  useLayoutEffect(() => {
    if (!moreOpen || !src || cropMode) {
      setMenuAnchor((prev) => (prev == null ? prev : null))
      return
    }
    const measure = () => {
      const el = toolbarRef.current || imgRef.current || mediaRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) return
      setMenuAnchor((prev) => {
        if (
          prev &&
          Math.abs(prev.left - r.left) < 0.5 &&
          Math.abs(prev.top - r.top) < 0.5 &&
          Math.abs(prev.width - r.width) < 0.5 &&
          Math.abs(prev.height - r.height) < 0.5
        ) {
          return prev
        }
        return { left: r.left, top: r.top, width: r.width, height: r.height }
      })
    }
    measure()
    const host = mediaRef.current
    const panel = host?.closest('[data-panel-container="true"]') as HTMLElement | null
    const ro = panel ? new ResizeObserver(() => requestAnimationFrame(measure)) : null
    if (panel && ro) ro.observe(panel)
    const vp = host?.closest('.react-flow__viewport') as HTMLElement | null
    const mo = vp ? new MutationObserver(() => requestAnimationFrame(measure)) : null
    if (vp && mo) mo.observe(vp, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      ro?.disconnect()
      mo?.disconnect()
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [moreOpen, src, cropMode, imageScale, cropAttr])

  const clearHoverLeave = useCallback(() => {
    if (hoverLeaveTimer.current) {
      clearTimeout(hoverLeaveTimer.current)
      hoverLeaveTimer.current = null
    }
  }, [])

  const onImageEnter = useCallback(() => {
    if (!editor?.isEditable) return
    clearHoverLeave()
    setHovered(true)
  }, [clearHoverLeave, editor?.isEditable])

  const onImageLeave = useCallback(() => {
    clearHoverLeave()
    // Brief grace so pointer can reach the portaled More menu / side handle
    hoverLeaveTimer.current = setTimeout(() => {
      if (moreOpen || sideDragRef.current) return // Keep chrome while More open or mid-drag
      setHovered(false)
      hoverLeaveTimer.current = null
    }, 160)
  }, [clearHoverLeave, moreOpen])

  useEffect(() => {
    return () => clearHoverLeave()
  }, [clearHoverLeave])

  const selectNode = useCallback(() => {
    if (!editor || editor.isDestroyed) return
    const pos = getPos?.()
    if (pos == null || pos < 0) return
    editor.chain().focus().setNodeSelection(pos).run()
  }, [editor, getPos])

  const armImage = useCallback(() => {
    armingRef.current = true
    setArmed(true)
    setHovered(true)
    selectNode()
    requestAnimationFrame(() => {
      armingRef.current = false
    })
  }, [selectNode])

  const downloadImage = useCallback(() => {
    if (!src) return
    const a = document.createElement('a')
    a.href = src
    a.download = alt || 'image'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [alt, src])

  const onFile = useCallback(
    (file: File | undefined) => {
      if (!file) return
      if (!file.type.startsWith('image/')) {
        setError('Choose an image file')
        return
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError('Image must be under 4 MB')
        return
      }
      setError(null)
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = typeof reader.result === 'string' ? reader.result : null
        if (!dataUrl) return
        updateAttributes({
          src: dataUrl,
          alt: file.name || alt,
          crop: null,
          originalSrc: null,
          hazed: false,
        })
      }
      reader.readAsDataURL(file)
    },
    [alt, updateAttributes]
  )

  const commitEmbed = useCallback(() => {
    const next = embedValue.trim()
    if (!next) return
    try {
      const u = new URL(next)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        setError('Use an http or https link')
        return
      }
    } catch {
      setError('Paste a valid image link')
      return
    }
    setError(null)
    updateAttributes({ src: next, crop: null, originalSrc: null, hazed: false })
    setEmbedOpen(false)
    setEmbedValue('')
  }, [embedValue, updateAttributes])

  const replaceImage = useCallback(() => {
    updateAttributes({
      src: null,
      crop: null,
      originalSrc: null,
      hazed: false,
      scale: 1,
    })
    setEmbedOpen(false)
    setCropMode(false)
    setArmed(false)
  }, [updateAttributes])

  const handleMenuAction = useCallback(
    async (action: ImageBlockMenuAction, payload?: { widthPct?: ImageResizePreset }) => {
      if (action === 'more') {
        setMoreOpen((v) => !v)
        armImage()
        return
      }
      if (action === 'download') {
        downloadImage()
        return
      }
      if (action === 'resize' && payload?.widthPct) {
        updateAttributes({ scale: clampImageScale(payload.widthPct / 100) })
        return
      }
      if (action === 'crop') {
        setMoreOpen(false)
        setCropMode(true)
        setDraftCrop(parseImageCrop(cropAttr))
        return
      }
      if (action === 'blur') {
        updateAttributes({ hazed: !hazed })
        return
      }
      if (action === 'replace') {
        setMoreOpen(false)
        replaceImage()
        return
      }
      if (action === 'removeBackground' && src) {
        setBusy(true)
        try {
          const next = await removeImageBackground(src)
          updateAttributes({
            src: next,
            originalSrc: (node.attrs.originalSrc as string | null) || src,
          })
        } catch {
          setError('Could not remove background')
        } finally {
          setBusy(false)
        }
      }
    },
    [
      armImage,
      cropAttr,
      downloadImage,
      hazed,
      node.attrs.originalSrc,
      replaceImage,
      src,
      updateAttributes,
    ]
  )

  const commitCrop = useCallback(() => {
    updateAttributes({ crop: serializeImageCrop(draftCrop) })
    setCropMode(false)
  }, [draftCrop, updateAttributes])

  const cancelCrop = useCallback(() => {
    setDraftCrop(parseImageCrop(cropAttr))
    setCropMode(false)
  }, [cropAttr])

  const onCropPointerDown = useCallback(
    (e: React.PointerEvent, kind: CropDrag['kind']) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      cropDragRef.current = { kind, startX: e.clientX, startY: e.clientY, start: draftCrop }
    },
    [draftCrop]
  )

  const onCropPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = cropDragRef.current
    const box = mediaRef.current?.getBoundingClientRect()
    if (!drag || !box || box.width < 1 || box.height < 1) return
    const dx = ((e.clientX - drag.startX) / box.width) * 100
    const dy = ((e.clientY - drag.startY) / box.height) * 100
    if (drag.kind === 'move') {
      setDraftCrop({
        ...drag.start,
        cx: clamp(drag.start.cx + dx, drag.start.cw / 2, 100 - drag.start.cw / 2),
        cy: clamp(drag.start.cy + dy, drag.start.ch / 2, 100 - drag.start.ch / 2),
      })
      return
    }
    setDraftCrop({
      ...drag.start,
      cw: clamp(drag.start.cw + dx * 2, 10, 100),
      ch: clamp(drag.start.ch + dy * 2, 10, 100),
    })
  }, [])

  const onCropPointerUp = useCallback(() => {
    cropDragRef.current = null
  }, [])

  // Notion-style L/R pills — drag changes scale; W+H share the same factor → aspect locked.
  const onSideResizeDown = useCallback(
    (e: ReactPointerEvent, side: 'left' | 'right') => {
      if (!editor?.isEditable || cropMode) return
      e.preventDefault()
      e.stopPropagation()
      const fullW =
        natural.w > 0 && natural.h > 0 && frameBox.w > 0 && frameBox.h > 0
          ? natural.w * Math.min(frameBox.w / natural.w, frameBox.h / natural.h)
          : 0
      if (fullW < 1) return
      clearHoverLeave()
      setHovered(true)
      setSideResizing(true)
      armImage()
      sideDragRef.current = {
        side,
        startX: e.clientX,
        startScale: imageScale,
        fullW,
        pointerId: e.pointerId,
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [
      armImage,
      clearHoverLeave,
      cropMode,
      editor?.isEditable,
      frameBox.h,
      frameBox.w,
      imageScale,
      natural.h,
      natural.w,
    ]
  )

  const onSideResizeMove = useCallback(
    (e: ReactPointerEvent) => {
      const drag = sideDragRef.current
      if (!drag || e.pointerId !== drag.pointerId) return
      e.preventDefault()
      e.stopPropagation()
      const dx = e.clientX - drag.startX
      // Right edge: drag out grows; left edge: drag out (negative dx) grows
      const deltaW = drag.side === 'right' ? dx : -dx
      const next = clampImageScale(drag.startScale + deltaW / drag.fullW)
      updateAttributes({ scale: next })
    },
    [updateAttributes]
  )

  const onSideResizeUp = useCallback((e: ReactPointerEvent) => {
    const drag = sideDragRef.current
    if (!drag || e.pointerId !== drag.pointerId) return
    sideDragRef.current = null
    setSideResizing(false)
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }, [])

  const clipPath = cropToClipPath(cropMode ? draftCrop : crop)
  const showRing = armed && !!src && !cropMode
  const showHighlight = !!src && !cropMode && (hovered || moreOpen || armed || sideResizing)
  const showHoverToolbar =
    !!src && !cropMode && !!editor?.isEditable && (hovered || moreOpen || sideResizing)
  const showSideHandles =
    !!src && !cropMode && !!editor?.isEditable && (hovered || moreOpen || sideResizing)
  const showMoreMenu = moreOpen && !!src && !!menuAnchor && !cropMode && !!editor?.isEditable
  const showUploadMenu = !src && !!uploadAnchor && !!editor?.isEditable
  // 100% = largest size where the FULL bitmap fits in the frame (min of W/H scale). Resize = fraction of that.
  // Free: frameBox stays frozen at unlock — keep deriving from it so side-drag scale still works.
  const contain =
    natural.w > 0 && natural.h > 0 && frameBox.w > 0 && frameBox.h > 0
      ? Math.min(frameBox.w / natural.w, frameBox.h / natural.h)
      : 0
  const computedW =
    contain > 0 ? Math.max(1, Math.round(natural.w * contain * imageScale)) : undefined
  const computedH =
    contain > 0 ? Math.max(1, Math.round(natural.h * contain * imageScale)) : undefined
  // Last locked paint — free first frame may race before frameBox freeze settles
  if (!freeResize && computedW != null && computedH != null) {
    lockedDisplayRef.current = { w: computedW, h: computedH }
  }
  // Prefer live contain from frozen frameBox; fall back to captured unlock px only if contain is 0
  const displayW = freeResize
    ? computedW ?? frozenDisplay?.w ?? lockedDisplayRef.current?.w
    : computedW
  const displayH = freeResize
    ? computedH ?? frozenDisplay?.h ?? lockedDisplayRef.current?.h
    : computedH

  return (
    <NodeViewWrapper
      as="div"
      className={cn(
        'tt-image-block group relative nodrag nokey',
        src && 'tt-image-block-has-src', // Centered contain-fit bitmap inside the frame
        showHighlight && 'tt-block-highlight', // Blue wash on hover / More / select
        showRing && 'tt-image-block-selected',
        cropMode && 'tt-image-block-cropping'
      )}
      data-type="imageBlock"
      data-scale={imageScale < 1 - 1e-6 ? String(Math.round(imageScale * 1000) / 1000) : undefined}
      data-width-pct={widthPct !== 100 ? String(widthPct) : undefined}
      onMouseEnter={onImageEnter}
      onMouseLeave={onImageLeave}
    >
      <div className="tt-image-block-row">
        {src ? (
          <div
            ref={mediaRef}
            className={cn(
              'tt-image-block-media relative',
              showRing && 'tt-image-block-media-selected',
              cropMode && 'tt-image-block-media-crop'
            )}
            style={
              // Exact contain-fit px in both modes — never max-% (that shrunk locked, then jumped on free)
              displayW != null && displayH != null
                ? { width: displayW, height: displayH, maxWidth: 'none', maxHeight: 'none' }
                : freeResize
                  ? undefined
                  : { maxWidth: '100%', maxHeight: '100%' }
            }
            onPointerDown={(e) => {
              if (cropMode) return
              if (!editor?.isEditable) return
              e.stopPropagation()
              armImage()
            }}
            onClick={(e) => {
              if (!hazed || cropMode) return
              e.stopPropagation()
              setRevealed((v) => !v)
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt={alt || 'Image'}
              className={cn(
                'tt-image-block-img',
                hazed && 'tt-image-block-hazed',
                hazed && revealed && 'tt-image-block-hazed-revealed'
              )}
              data-haze={hazed ? 'true' : undefined}
              style={{
                clipPath,
                width: displayW != null ? '100%' : undefined,
                height: displayH != null ? '100%' : undefined,
                objectFit: displayW != null ? 'fill' : 'contain',
              }}
              onLoad={(e) => {
                const w = e.currentTarget.naturalWidth
                const h = e.currentTarget.naturalHeight
                if (w > 0 && h > 0) setNatural({ w, h })
              }}
            />
            {busy && <div className="tt-image-block-busy" aria-hidden />}
            {cropMode &&
              createPortal(
                <div className="tt-image-block-crop-toolbar">
                  <button type="button" className="tt-image-block-crop-btn" onClick={cancelCrop}>
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="tt-image-block-crop-btn tt-image-block-crop-done"
                    onClick={commitCrop}
                  >
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    Done
                  </button>
                </div>,
                document.body
              )}
            {cropMode && mediaRef.current && (
              <CropBox
                host={mediaRef.current}
                crop={draftCrop}
                onMoveDown={(e) => onCropPointerDown(e, 'move')}
                onResizeDown={(e) => onCropPointerDown(e, 'se')}
                onMove={onCropPointerMove}
                onUp={onCropPointerUp}
              />
            )}
            {showHoverToolbar && (
              <ImageBlockHoverToolbar
                moreOpen={moreOpen}
                chromeScale={chromeScale}
                toolbarRef={toolbarRef}
                onAction={handleMenuAction}
              />
            )}
            {showSideHandles && (
              <>
                <button
                  type="button"
                  aria-label="Resize image"
                  data-tt-image-side-handle="left"
                  className="tt-image-block-side-handle tt-image-block-side-handle-left nodrag nopan"
                  style={{ transform: `translate(-50%, -50%) scale(${chromeScale})` }}
                  onPointerDown={(e) => onSideResizeDown(e, 'left')}
                  onPointerMove={onSideResizeMove}
                  onPointerUp={onSideResizeUp}
                  onPointerCancel={onSideResizeUp}
                />
                <button
                  type="button"
                  aria-label="Resize image"
                  data-tt-image-side-handle="right"
                  className="tt-image-block-side-handle tt-image-block-side-handle-right nodrag nopan"
                  style={{ transform: `translate(50%, -50%) scale(${chromeScale})` }}
                  onPointerDown={(e) => onSideResizeDown(e, 'right')}
                  onPointerMove={onSideResizeMove}
                  onPointerUp={onSideResizeUp}
                  onPointerCancel={onSideResizeUp}
                />
              </>
            )}
          </div>
        ) : (
          <>
            {/* In-flow stub for ⋮⋮ / hug — real Upload UI is portaled (screen-constant like frame menus) */}
            <div
              ref={uploadAnchorRef}
              className="tt-image-block-upload-anchor"
              contentEditable={false}
              aria-hidden
            />
            {showUploadMenu &&
              uploadAnchor &&
              createPortal(
                <div
                  data-tt-image-upload-menu
                  className="fixed z-[1001] tt-menu-surface rounded-lg shadow-lg border border-gray-200 dark:border-[#2f2f2f] p-3 outline-none"
                  style={{
                    left: uploadAnchor.left,
                    top: uploadAnchor.top,
                    width: UPLOAD_MENU_W,
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault() // Keep node selection while using the menu
                    e.stopPropagation()
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300">
                    <ImageIcon className="h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                    <span>Add an image</span>
                  </div>
                  {embedOpen ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        type="url"
                        value={embedValue}
                        onChange={(e) => setEmbedValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitEmbed()
                          }
                          e.stopPropagation()
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Paste an image link…"
                        className="h-8 min-w-[8rem] flex-1 rounded-md border border-gray-200 bg-white px-2 text-xs outline-none dark:border-[#374151] dark:bg-[#111827] dark:text-gray-100"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="inline-flex h-8 items-center rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-[#374151] dark:bg-[#111827] dark:text-gray-200 dark:hover:bg-[#1f2937]"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          commitEmbed()
                        }}
                      >
                        Embed
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-[#374151] dark:bg-[#111827] dark:text-gray-200 dark:hover:bg-[#1f2937]"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          fileRef.current?.click()
                        }}
                      >
                        <Upload className="h-3.5 w-3.5" aria-hidden />
                        Upload
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-[#374151] dark:bg-[#111827] dark:text-gray-200 dark:hover:bg-[#1f2937]"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setEmbedOpen(true)
                          setError(null)
                        }}
                      >
                        <Link2 className="h-3.5 w-3.5" aria-hidden />
                        Embed link
                      </button>
                    </div>
                  )}
                  {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
                </div>,
                document.body
              )}
          </>
        )}
      </div>

      {showMoreMenu && menuAnchor && (
        <ImageBlockMenu
          anchor={menuAnchor}
          widthPct={widthPct}
          hazed={hazed}
          onAction={handleMenuAction}
          onClose={() => setMoreOpen(false)}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </NodeViewWrapper>
  )
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

/** Draggable crop box rendered in screen space over the image. */
function CropBox({
  host,
  crop,
  onMoveDown,
  onResizeDown,
  onMove,
  onUp,
}: {
  host: HTMLElement
  crop: ImageCrop
  onMoveDown: (e: React.PointerEvent) => void
  onResizeDown: (e: React.PointerEvent) => void
  onMove: (e: React.PointerEvent) => void
  onUp: (e: React.PointerEvent) => void
}) {
  const [box, setBox] = useState(host.getBoundingClientRect())
  useEffect(() => {
    const sync = () => setBox(host.getBoundingClientRect())
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(host)
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
  }, [host])

  const left = box.left + ((crop.cx - crop.cw / 2) / 100) * box.width
  const top = box.top + ((crop.cy - crop.ch / 2) / 100) * box.height
  const width = (crop.cw / 100) * box.width
  const height = (crop.ch / 100) * box.height

  return createPortal(
    <div
      className="tt-image-block-crop-box"
      style={{ left, top, width, height }}
      onPointerDown={onMoveDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span
        className="tt-image-block-crop-handle"
        onPointerDown={(e) => {
          e.stopPropagation()
          onResizeDown(e)
        }}
      />
    </div>,
    document.body
  )
}
