'use client'

// Context for sharing React Flow instance with components outside ReactFlowProvider
import { createContext, useContext, useState, useRef, useCallback, useEffect, useLayoutEffect, ReactNode } from 'react'
import { ReactFlowInstance } from 'reactflow'
import { createClient } from '@/lib/supabase/client'
import { usePathname } from 'next/navigation'
import { parseBoardFontId, type BoardFontId } from '@/lib/board-font'

import { isPublicBoardId } from '@/lib/public-showcase-boards'
import { getEphemeralSandbox, isEphemeralSandboxId } from '@/lib/ephemeral-sandbox'
import type { DrawInkId } from '@/components/freehand/ink' // Pencil / highlighter swatch ids
import {
  DEFAULT_DRAW_TIP_DIAMETER_PX,
  DEFAULT_ERASER_TIP_DIAMETER_PX,
  MAX_TIP_DIAMETER_PX,
  MIN_TIP_DIAMETER_PX,
} from '@/components/freehand/path' // Tip thickness bar range + defaults

interface ReactFlowContextType {
  reactFlowInstance: ReactFlowInstance | null
  setReactFlowInstance: (instance: ReactFlowInstance | null) => void
  getSetNodes: () => ((nodes: any) => void) | undefined // Getter for setNodes function (stored in ref)
  registerSetNodes: (setNodes: ((nodes: any) => void) | undefined) => void // Function to register setNodes from useNodesState
  isLocked: boolean // Global lock state
  setIsLocked: (locked: boolean) => void // Function to set lock state
  layoutMode: 'auto' | 'tree' | 'cluster' | 'none' // Layout mode state
  setLayoutMode: (mode: 'auto' | 'tree' | 'cluster' | 'none') => void // Function to set layout mode
  isDeterministicMapping: boolean // Deterministic mapping state (enabled when layoutMode is 'none')
  setIsDeterministicMapping: (enabled: boolean) => void // Function to set deterministic mapping state
  panelWidth: number // Panel width (matches prompt box width when zoom is 100%)
  setPanelWidth: (width: number) => void // Function to set panel width
  isPromptBoxCentered: boolean // Whether prompt box is centered (vs left-aligned)
  setIsPromptBoxCentered: (centered: boolean) => void // Function to set prompt box centered state
  lineStyle: 'solid' | 'dotted' // Line style state (solid or dotted)
  setLineStyle: (style: 'solid' | 'dotted') => void // Function to set line style
  arrowDirection: 'down' | 'up' | 'left' | 'right' // Arrow direction state
  setArrowDirection: (direction: 'down' | 'up' | 'left' | 'right') => void // Function to set arrow direction
  editMenuPillMode: 'home' | 'insert' | 'draw' | 'view' // Edit menu pill mode state
  setEditMenuPillMode: (mode: 'home' | 'insert' | 'draw' | 'view') => void // Function to set edit menu pill mode
  viewMode: 'linear' | 'canvas' // View mode state (linear or canvas)
  boardRule: 'wide' | 'college' | 'narrow' // Board rule state (paper rule type)
  setBoardRule: (rule: 'wide' | 'college' | 'narrow') => void // Function to set board rule
  boardStyle: 'none' | 'dotted' | 'lined' | 'grid' // Board style state (background style)
  setBoardStyle: (style: 'none' | 'dotted' | 'lined' | 'grid') => void // Function to set board style
  boardFont: BoardFontId // Frame text font (Default / Serif / Mono)
  setBoardFont: (font: BoardFontId) => void // Function to set board font
  fillColor: string // Fill color state (for shapes/components)
  setFillColor: (color: string) => void // Function to set fill color
  borderColor: string // Border color state (for shapes/components)
  setBorderColor: (color: string) => void // Function to set border color
  borderWeight: number // Border weight state (for shapes/components)
  setBorderWeight: (weight: number) => void // Function to set border weight
  borderStyle: 'solid' | 'dashed' | 'dotted' | 'none' // Border style state (for shapes/components)
  setBorderStyle: (style: 'solid' | 'dashed' | 'dotted' | 'none') => void // Function to set border style
  clickedEdge: { id: string; source: string; target: string } | null // Currently clicked edge (for panel color updates)
  setClickedEdge: (edge: { id: string; source: string; target: string } | null) => void // Function to set clicked edge
  flashcardMode: 'flashcard' | 'quiz' | null // Flashcard study mode (null = off, flashcard/quiz = active mode)
  setFlashcardMode: (mode: 'flashcard' | 'quiz' | null) => void // Function to set flashcard mode
  selectedTag: string | null // Selected flashcard tag (study set ID) for filtering navigation
  setSelectedTag: (tagId: string | null) => void // Function to set selected tag (toggles if same tag clicked)
  isDrawing: boolean // Drawing mode state (true = drawing enabled, false = selection mode)
  setIsDrawing: (drawing: boolean) => void // Function to set drawing mode
  drawTool: DrawTool | null // Current Draw-bar tool (null = none armed)
  setDrawTool: (tool: DrawTool | null) => void // Arm / disarm a Draw-bar tool
  eraserMode: EraserMode // Stroke = whole ink; spot = carve under the brush
  setEraserMode: (mode: EraserMode) => void // Remember last eraser flavor
  drawTipSize: number // Pencil/highlighter tip diameter (screen px)
  setDrawTipSize: (size: number) => void // Persist draw tip for the thickness bar
  eraserTipSize: number // Eraser tip diameter (screen px)
  setEraserTipSize: (size: number) => void // Persist eraser tip for the thickness bar
  pencilColor: DrawInkId // Freehand pencil swatch (independent of highlighter)
  setPencilColor: (color: DrawInkId) => void // Remember pencil ink for new strokes
  highlighterColor: DrawInkId // Highlighter swatch (independent of pencil)
  setHighlighterColor: (color: DrawInkId) => void // Remember highlighter ink for new strokes
  drawShape: 'rectangle' | 'circle' | 'line' | 'arrow' | 'round-rectangle' | 'hexagon' | 'diamond' | 'arrow-rectangle' | 'cylinder' | 'triangle' | 'parallelogram' | 'plus' // Current shape
  setDrawShape: (shape: 'rectangle' | 'circle' | 'line' | 'arrow' | 'round-rectangle' | 'hexagon' | 'diamond' | 'arrow-rectangle' | 'cylinder' | 'triangle' | 'parallelogram' | 'plus') => void // Function to set shape
  // Undo/Redo functions for React Flow map actions (registered from BoardFlow where useUndoRedo hook is used)
  mapUndo: () => void // Undo last map action (node drag, add, delete, edge change)
  mapRedo: () => void // Redo last undone map action
  canMapUndo: boolean // Whether map undo is available
  canMapRedo: boolean // Whether map redo is available
  registerMapUndoRedo: (fns: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => void // Register undo/redo from BoardFlow
  getMapTakeSnapshot: () => (() => void) | undefined // Getter for takeSnapshot function
  registerMapTakeSnapshot: (fn: () => void) => void // Register takeSnapshot from BoardFlow
  snapEnabled: boolean // Snap to grid/helper lines enabled state
  setSnapEnabled: (enabled: boolean) => void // Function to set snap enabled state
}

const ReactFlowContext = createContext<ReactFlowContextType | undefined>(undefined)

/** localStorage — last Actions/Layout/Draw/View so reload keeps that tool set. */
const NN_PILL_MODE_KEY = 'nodnotes-edit-menu-pill-mode'

/** localStorage — last armed Draw tool (pencil/lasso/…) so reload keeps it toggled. */
const NN_DRAW_TOOL_KEY = 'nodnotes-draw-tool'
/** localStorage — stroke vs spot eraser flavor. */
const NN_ERASER_MODE_KEY = 'nodnotes-eraser-mode'
/** localStorage — pencil/highlighter tip diameter (screen px). */
const NN_DRAW_TIP_SIZE_KEY = 'nodnotes-draw-tip-size'
/** localStorage — eraser tip diameter (screen px). */
const NN_ERASER_TIP_SIZE_KEY = 'nodnotes-eraser-tip-size'
/** localStorage — last pencil ink swatch. */
const NN_PENCIL_COLOR_KEY = 'nodnotes-pencil-color'
/** localStorage — last highlighter ink swatch. */
const NN_HIGHLIGHTER_COLOR_KEY = 'nodnotes-highlighter-color'

const PILL_MODES = ['home', 'insert', 'draw', 'view'] as const // Valid pill values (Actions = home, Layout = insert)
type EditMenuPillMode = (typeof PILL_MODES)[number] // Matches context editMenuPillMode
const DRAW_TOOLS = ['lasso', 'pencil', 'highlighter', 'eraser', 'insert-v', 'insert-h'] as const // Valid Draw tools (null = none); insert-v/h = insert space
export type DrawTool = (typeof DRAW_TOOLS)[number] // Armed Draw tool (also the persisted value)
type StoredDrawTool = DrawTool // Same set is what reload restores
const ERASER_MODES = ['stroke', 'spot'] as const // Whole-stroke delete vs brush carve
export type EraserMode = (typeof ERASER_MODES)[number]
const DRAW_INK_IDS = ['black', 'blue', 'green', 'red'] as const // Same swatches as the Draw dropdowns

/** Read last pill; SSR-safe → Actions. */
function getStoredPillMode(): EditMenuPillMode {
  if (typeof window === 'undefined') return 'home' // Server HTML always starts on Actions
  const saved = localStorage.getItem(NN_PILL_MODE_KEY) // Last mode the user picked
  return PILL_MODES.includes(saved as EditMenuPillMode) ? (saved as EditMenuPillMode) : 'home' // Ignore junk
}

/** Remember the pill so the next load shows the same tools. */
function persistPillMode(mode: EditMenuPillMode) {
  if (typeof window === 'undefined') return // No storage on server
  localStorage.setItem(NN_PILL_MODE_KEY, mode) // Client restore on remount / reload
}

/** Read last Draw tool; SSR-safe → none. */
function getStoredDrawTool(): StoredDrawTool | null {
  if (typeof window === 'undefined') return null // Server: nothing armed
  const saved = localStorage.getItem(NN_DRAW_TOOL_KEY) // Last toggled Draw tool
  return DRAW_TOOLS.includes(saved as StoredDrawTool) ? (saved as StoredDrawTool) : null // Ignore junk / empty
}

/** Remember the armed Draw tool (or clear when deselected). */
function persistDrawTool(tool: StoredDrawTool | null) {
  if (typeof window === 'undefined') return // No storage on server
  if (tool) localStorage.setItem(NN_DRAW_TOOL_KEY, tool) // Keep it armed after reload
  else localStorage.removeItem(NN_DRAW_TOOL_KEY) // Deselect → next load has no Draw tool
}

/** Read last eraser flavor; SSR-safe → stroke. */
function getStoredEraserMode(): EraserMode {
  if (typeof window === 'undefined') return 'stroke'
  const saved = localStorage.getItem(NN_ERASER_MODE_KEY)
  return ERASER_MODES.includes(saved as EraserMode) ? (saved as EraserMode) : 'stroke'
}

function persistEraserMode(mode: EraserMode) {
  if (typeof window === 'undefined') return
  localStorage.setItem(NN_ERASER_MODE_KEY, mode)
}

/** Clamp tip diameter into the Draw/Eraser thickness bar range. */
function clampTipDiameter(n: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback
  return Math.min(MAX_TIP_DIAMETER_PX, Math.max(MIN_TIP_DIAMETER_PX, Math.round(n)))
}

function getStoredTipDiameter(key: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback
  const saved = localStorage.getItem(key)
  if (saved == null) return fallback
  return clampTipDiameter(Number(saved), fallback)
}

function persistTipDiameter(key: string, size: number, fallback: number) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, String(clampTipDiameter(size, fallback)))
}

/** Read last ink swatch; SSR-safe → black. */
function getStoredDrawInk(key: string): DrawInkId {
  if (typeof window === 'undefined') return 'black'
  const saved = localStorage.getItem(key)
  return DRAW_INK_IDS.includes(saved as DrawInkId) ? (saved as DrawInkId) : 'black'
}

function persistDrawInk(key: string, color: DrawInkId) {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, color)
}

export function ReactFlowContextProvider({ children, conversationId, projectId }: { children: ReactNode; conversationId?: string; projectId?: string }) {
  const pathname = usePathname() // Track route changes to reload preferences
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null)
  const setNodesRef = useRef<((nodes: any) => void) | undefined>(undefined) // Use ref to avoid setState during render
  const [isLocked, setIsLocked] = useState(false) // Global lock state
  // Initialize with consistent defaults to avoid hydration mismatch
  // Then update from localStorage in useEffect after hydration
  const [layoutMode, setLayoutMode] = useState<'auto' | 'tree' | 'cluster' | 'none'>('auto')
  const [isDeterministicMapping, setIsDeterministicMapping] = useState(true) // Default to true (auto mode)
  const [panelWidth, setPanelWidth] = useState(768) // Default panel width (matches prompt box max width)
  const [isPromptBoxCentered, setIsPromptBoxCentered] = useState(false) // Whether prompt box is centered
  // Initialize with consistent defaults to avoid hydration mismatch, then load from Supabase
  const [lineStyle, setLineStyle] = useState<'solid' | 'dotted'>('solid')
  const [arrowDirection, setArrowDirection] = useState<'down' | 'up' | 'left' | 'right'>('down')
  const [editMenuPillMode, setEditMenuPillModeState] = useState<'home' | 'insert' | 'draw' | 'view'>('home') // SSR: Actions; layout restore before paint
  const [viewMode, setViewMode] = useState<'linear' | 'canvas'>('canvas') // View mode state
  const [boardRule, setBoardRule] = useState<'wide' | 'college' | 'narrow'>('college') // Board rule state (default: college)
  const [boardStyle, setBoardStyle] = useState<'none' | 'dotted' | 'lined' | 'grid'>('dotted') // Board style state (default: college dotted)
  const [boardFont, setBoardFont] = useState<BoardFontId>('default') // Frame text font (More menu)
  const [fillColor, setFillColor] = useState<string>('') // Fill color state (default: transparent)
  const [borderColor, setBorderColor] = useState<string>('') // Border color state (default: transparent)
  const [borderWeight, setBorderWeight] = useState<number>(1) // Border weight state (default: 1px)
  const [borderStyle, setBorderStyle] = useState<'solid' | 'dashed' | 'dotted' | 'none'>('solid') // Border style state (default: solid)
  const [clickedEdge, setClickedEdge] = useState<{ id: string; source: string; target: string } | null>(null) // Currently clicked edge (for panel color updates)
  const [flashcardMode, setFlashcardMode] = useState<'flashcard' | 'quiz' | null>(null) // Flashcard study mode (null = off)
  const [selectedTag, setSelectedTag] = useState<string | null>(null) // Selected flashcard tag for filtering navigation
  const [isDrawing, setIsDrawing] = useState<boolean>(false) // Drawing mode state (default: selection mode)
  const [drawTool, setDrawToolState] = useState<DrawTool | null>(null) // SSR: none; restore armed tool before paint
  const [eraserMode, setEraserModeState] = useState<EraserMode>('stroke') // SSR default; hydrate from storage before paint
  const [drawTipSize, setDrawTipSizeState] = useState<number>(DEFAULT_DRAW_TIP_DIAMETER_PX) // Pencil tip; hydrate before paint
  const [eraserTipSize, setEraserTipSizeState] = useState<number>(DEFAULT_ERASER_TIP_DIAMETER_PX) // Eraser tip; hydrate before paint
  const [pencilColor, setPencilColorState] = useState<DrawInkId>('black') // SSR default; hydrate pencil swatch before paint
  const [highlighterColor, setHighlighterColorState] = useState<DrawInkId>('black') // SSR default; hydrate highlighter swatch before paint
  const [drawShape, setDrawShape] = useState<'rectangle' | 'circle' | 'line' | 'arrow' | 'round-rectangle' | 'hexagon' | 'diamond' | 'arrow-rectangle' | 'cylinder' | 'triangle' | 'parallelogram' | 'plus'>('rectangle') // Current shape (default: rectangle)
  const [snapEnabled, setSnapEnabled] = useState<boolean>(false) // Snap to grid/helper lines enabled state (default: disabled)
  
  // Undo/Redo state for map actions - stored in refs to avoid re-renders
  // Functions are registered from BoardFlow where the useUndoRedo hook runs inside ReactFlowProvider
  const mapUndoRedoRef = useRef<{ undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }>({
    undo: () => {},
    redo: () => {},
    canUndo: false,
    canRedo: false,
  })
  const mapTakeSnapshotRef = useRef<(() => void) | undefined>(undefined)
  // State to trigger re-renders when undo/redo availability changes
  const [mapUndoRedoState, setMapUndoRedoState] = useState<{ canUndo: boolean; canRedo: boolean }>({ canUndo: false, canRedo: false })
  
  // Toggle selected tag - if same tag clicked, deselect it
  const toggleSelectedTag = useCallback((tagId: string | null) => {
    setSelectedTag((current) => current === tagId ? null : tagId)
  }, [])

  // Persist pill so reload / board remount keeps Actions vs Layout vs Draw vs View
  const setEditMenuPillMode = useCallback((mode: EditMenuPillMode) => {
    persistPillMode(mode) // Remember before the next load
    setEditMenuPillModeState(mode) // Swap the tool set immediately
    if (mode !== 'draw') {
      // Leaving Draw: turn off pencil/eraser/lasso/insert-space so other bars can't ink or erase
      persistDrawTool(null) // Clear last armed tool — toggles stay off until Draw re-arms one
      setDrawToolState(null) // Drop Freehand / eraser / lasso overlays immediately
      setIsDrawing(false) // Pencil/highlighter freehand capture must not outlive the Draw bar
    }
  }, [])

  // Persist the armed Draw tool; pencil/highlighter set isDrawing (freehand overlay); eraser mounts separately
  const setDrawTool = useCallback((tool: StoredDrawTool | null) => {
    persistDrawTool(tool) // Remember (or clear) for reload
    setDrawToolState(tool) // Arm / disarm on the bar
  }, [])

  const setEraserMode = useCallback((mode: EraserMode) => {
    persistEraserMode(mode) // Keep stroke vs spot across reload
    setEraserModeState(mode)
  }, [])

  const setDrawTipSize = useCallback((size: number) => {
    const next = clampTipDiameter(size, DEFAULT_DRAW_TIP_DIAMETER_PX)
    persistTipDiameter(NN_DRAW_TIP_SIZE_KEY, next, DEFAULT_DRAW_TIP_DIAMETER_PX)
    setDrawTipSizeState(next)
  }, [])

  const setEraserTipSize = useCallback((size: number) => {
    const next = clampTipDiameter(size, DEFAULT_ERASER_TIP_DIAMETER_PX)
    persistTipDiameter(NN_ERASER_TIP_SIZE_KEY, next, DEFAULT_ERASER_TIP_DIAMETER_PX)
    setEraserTipSizeState(next)
  }, [])

  const setPencilColor = useCallback((color: DrawInkId) => {
    persistDrawInk(NN_PENCIL_COLOR_KEY, color) // Remember pencil swatch across reload
    setPencilColorState(color) // Freehand pencil strokes use this fill
  }, [])

  const setHighlighterColor = useCallback((color: DrawInkId) => {
    persistDrawInk(NN_HIGHLIGHTER_COLOR_KEY, color) // Remember highlighter swatch across reload
    setHighlighterColorState(color) // Freehand highlighter strokes use this fill
  }, [])

  // Restore pill + Draw tool before first paint (skip embed — no toolbar, must not arm Freehand)
  useLayoutEffect(() => {
    if (pathname?.startsWith('/embed/')) return // Nested preview iframe stays selection-only
    setEraserModeState(getStoredEraserMode()) // Stroke / spot from last session
    setDrawTipSizeState(getStoredTipDiameter(NN_DRAW_TIP_SIZE_KEY, DEFAULT_DRAW_TIP_DIAMETER_PX))
    setEraserTipSizeState(getStoredTipDiameter(NN_ERASER_TIP_SIZE_KEY, DEFAULT_ERASER_TIP_DIAMETER_PX))
    setPencilColorState(getStoredDrawInk(NN_PENCIL_COLOR_KEY)) // Pencil swatch from last session
    setHighlighterColorState(getStoredDrawInk(NN_HIGHLIGHTER_COLOR_KEY)) // Highlighter swatch from last session
    const mode = getStoredPillMode() // Last Actions / Layout / Draw / View
    setEditMenuPillModeState(mode) // Same tool set as last session
    if (mode !== 'draw') return // Other modes: don’t arm a Draw tool or capture the board
    const tool = getStoredDrawTool() // Last toggled Draw tool, if any
    if (!tool) return // Draw bar with nothing selected
    setDrawToolState(tool) // Re-toggle that tool on the Draw bar
    setIsDrawing(tool === 'pencil' || tool === 'highlighter') // Pencil + highlighter → freehand overlay
  }, [pathname])

  // Refs to track conversationId and loading state without triggering save effects
  // conversationIdRef: Tracks current board ID for saves (updated when conversationId changes, but doesn't trigger saves)
  // isLoadingRef: Prevents saves during navigation/loading to avoid race conditions
  const conversationIdRef = useRef<string | undefined>(conversationId)
  const isLoadingRef = useRef(false)

  // Shared function to load preferences from localStorage first (instant), then Supabase (sync)
  // If conversationId is undefined, loads from profiles.metadata (default board)
  // If conversationId exists, loads from conversations.metadata (specific board)
  const loadPreferencesFromSupabase = useCallback(async (currentConversationId?: string) => {
    if (typeof window === 'undefined') return

    // STEP 1: Load from localStorage FIRST (synchronous, instant) - ensures UI shows saved prefs immediately
    const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
    const savedPrefs = localStorage.getItem(storageKey)
    if (savedPrefs) {
      try {
        const prefs = JSON.parse(savedPrefs)
        if (prefs.layoutMode && ['auto', 'tree', 'cluster', 'none'].includes(prefs.layoutMode)) {
          setLayoutMode(prefs.layoutMode)
          setIsDeterministicMapping(prefs.layoutMode !== 'none')
        }
        if (prefs.lineStyle && ['solid', 'dotted'].includes(prefs.lineStyle)) {
          setLineStyle(prefs.lineStyle)
        }
        if (prefs.arrowDirection && ['down', 'up', 'left', 'right'].includes(prefs.arrowDirection)) {
          setArrowDirection(prefs.arrowDirection)
        }
        if (prefs.boardRule && ['wide', 'college', 'narrow'].includes(prefs.boardRule)) {
          setBoardRule(prefs.boardRule)
        }
        if (prefs.boardStyle && ['none', 'dotted', 'lined', 'grid'].includes(prefs.boardStyle)) {
          setBoardStyle(prefs.boardStyle)
        }
        const loadedFont = parseBoardFontId(prefs.boardFont)
        if (loadedFont) setBoardFont(loadedFont)
      } catch (e) {
        // Fallback to old localStorage keys for backward compatibility
        const savedLayoutMode = localStorage.getItem('nodnotes-layout-mode') as 'auto' | 'tree' | 'cluster' | 'none' | null
        if (savedLayoutMode && ['auto', 'tree', 'cluster', 'none'].includes(savedLayoutMode)) {
          setLayoutMode(savedLayoutMode)
          setIsDeterministicMapping(savedLayoutMode !== 'none')
        }
        const savedLineStyle = localStorage.getItem('nodnotes-line-style') as 'solid' | 'dotted' | null
        if (savedLineStyle && ['solid', 'dotted'].includes(savedLineStyle)) {
          setLineStyle(savedLineStyle)
        }
        const savedArrowDirection = localStorage.getItem('nodnotes-arrow-direction') as 'down' | 'up' | 'left' | 'right' | null
        if (savedArrowDirection && ['down', 'up', 'left', 'right'].includes(savedArrowDirection)) {
          setArrowDirection(savedArrowDirection)
        }
      }
    }

    // STEP 2: Then load from Supabase (async) and update if different
    const supabase = createClient()

    try {
      let publicBoardPrefs: any = null
      // Visitor sandbox — prefs come from the cloned master metadata
      if (currentConversationId && isEphemeralSandboxId(currentConversationId)) {
        publicBoardPrefs = getEphemeralSandbox(currentConversationId)?.conversation.metadata || null
      } else if (currentConversationId && isPublicBoardId(currentConversationId)) {
        try {
          const publicResponse = await fetch(`/api/public-board/${currentConversationId}`)
          if (publicResponse.ok) {
            const publicData = await publicResponse.json()
            if (publicData.conversation?.metadata) {
              publicBoardPrefs = publicData.conversation.metadata
            }
          }
        } catch (e) {
          // API failed — continue to the authenticated fetch below
        }
      }

      if (publicBoardPrefs) {
        if (publicBoardPrefs.boardRule && ['wide', 'college', 'narrow'].includes(publicBoardPrefs.boardRule)) {
          setBoardRule(publicBoardPrefs.boardRule)
          const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
          const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
          localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, boardRule: publicBoardPrefs.boardRule }))
        }
        if (publicBoardPrefs.boardStyle && ['none', 'dotted', 'lined', 'grid'].includes(publicBoardPrefs.boardStyle)) {
          setBoardStyle(publicBoardPrefs.boardStyle)
          const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
          const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
          localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, boardStyle: publicBoardPrefs.boardStyle }))
        }
        const publicFont = parseBoardFontId(publicBoardPrefs.boardFont)
        if (publicFont) {
          setBoardFont(publicFont)
          const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
          const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
          localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, boardFont: publicFont }))
        }
        if (publicBoardPrefs.layoutMode && ['auto', 'tree', 'cluster', 'none'].includes(publicBoardPrefs.layoutMode)) {
          setLayoutMode(publicBoardPrefs.layoutMode)
          setIsDeterministicMapping(publicBoardPrefs.layoutMode !== 'none')
          const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
          const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
          localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, layoutMode: publicBoardPrefs.layoutMode }))
        }
        if (publicBoardPrefs.lineStyle && ['solid', 'dotted'].includes(publicBoardPrefs.lineStyle)) {
          setLineStyle(publicBoardPrefs.lineStyle)
          const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
          const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
          localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, lineStyle: publicBoardPrefs.lineStyle }))
        }
        if (publicBoardPrefs.arrowDirection && ['down', 'up', 'left', 'right'].includes(publicBoardPrefs.arrowDirection)) {
          setArrowDirection(publicBoardPrefs.arrowDirection)
          const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
          const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
          localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, arrowDirection: publicBoardPrefs.arrowDirection }))
        }
        return
      }

      // For non-homepage boards, require authentication
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        let prefs: any = null

        if (currentConversationId) {
          // Load from conversation metadata (specific board)
          const { data: conversation } = await supabase
            .from('conversations')
            .select('metadata')
            .eq('id', currentConversationId)
            .eq('user_id', user.id)
            .single()

          if (conversation?.metadata) {
            prefs = conversation.metadata as typeof prefs
          }
        } else {
          // Load from profile metadata (default board /board)
          const { data: profile } = await supabase
            .from('profiles')
            .select('metadata')
            .eq('id', user.id)
            .single()

          if (profile?.metadata) {
            prefs = profile.metadata as typeof prefs
          }
        }

        if (prefs) {
          // Update from Supabase if values exist
          if ((prefs as any).layoutMode && ['auto', 'tree', 'cluster', 'none'].includes((prefs as any).layoutMode)) {
            setLayoutMode(prefs.layoutMode)
            setIsDeterministicMapping(prefs.layoutMode !== 'none')
            // Save to localStorage for instant loading next time
            const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
            const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
            localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, layoutMode: prefs.layoutMode }))
          }

          if (prefs.lineStyle && ['solid', 'dotted'].includes(prefs.lineStyle)) {
            setLineStyle(prefs.lineStyle)
            const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
            const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
            localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, lineStyle: prefs.lineStyle }))
          }

          if (prefs.arrowDirection && ['down', 'up', 'left', 'right'].includes(prefs.arrowDirection)) {
            setArrowDirection(prefs.arrowDirection)
            const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
            const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
            localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, arrowDirection: prefs.arrowDirection }))
          }

          if (prefs.boardRule && ['wide', 'college', 'narrow'].includes(prefs.boardRule)) {
            setBoardRule(prefs.boardRule)
            const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
            const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
            localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, boardRule: prefs.boardRule }))
          }

          if (prefs.boardStyle && ['none', 'dotted', 'lined', 'grid'].includes(prefs.boardStyle)) {
            setBoardStyle(prefs.boardStyle)
            const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
            const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
            localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, boardStyle: prefs.boardStyle }))
          }

          const syncedFont = parseBoardFontId((prefs as { boardFont?: unknown }).boardFont)
          if (syncedFont) {
            setBoardFont(syncedFont)
            const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
            const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
            localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, boardFont: syncedFont }))
          }
        }
      }
    } catch (error) {
      console.error('Error loading preferences from Supabase:', error)
      // If Supabase fails, localStorage values already loaded above will be used
    }
  }, []) // State setters are stable, no need to include them in dependencies

  // Update conversationIdRef when conversationId changes (doesn't trigger save effects)
  // This allows save effects to use the current conversationId without re-running when it changes
  useEffect(() => {
    conversationIdRef.current = conversationId
  }, [conversationId])

  // Mount / board / pathname loads all live in ONE effect below (`pathname, conversationId`).
  // Three effects used to call this loader with the same deps, so every mount and every board
  // switch ran 3× auth.getUser + 3× conversations select before the board could settle.

  // Also reload from Supabase when window gains focus (to catch changes made in other tabs/windows)
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleFocus = () => {
      // Set loading flag to prevent saves during reload
      isLoadingRef.current = true
      // Reload from Supabase to get latest preferences
      loadPreferencesFromSupabase(conversationId).finally(() => {
        isLoadingRef.current = false
      })
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [loadPreferencesFromSupabase, conversationId])

  // Save layout mode to localStorage and Supabase when it changes
  // If conversationId is undefined, saves to profiles.metadata (default board)
  // If conversationId exists, saves to conversations.metadata (specific board)
  // NOTE: Only runs when layoutMode changes, NOT when conversationId changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isLoadingRef.current) return // Skip saves during loading/navigation to prevent overwriting wrong board

    // Use ref to get current conversationId (doesn't trigger effect when it changes)
    const currentConversationId = conversationIdRef.current

    // Save to localStorage immediately (lightweight, instant)
    const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
    const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
    localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, layoutMode }))

    // Also save to old key for backward compatibility
    localStorage.setItem('nodnotes-layout-mode', layoutMode)

    // Save to Supabase in background (for cross-device sync)
    const saveToSupabase = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.warn('Cannot save layout mode: user not authenticated')
          return
        }

        if (currentConversationId) {
          // Save to conversation metadata (specific board) - only this board's preferences
          const { data: conversation, error: fetchError } = await supabase
            .from('conversations')
            .select('metadata')
            .eq('id', currentConversationId)
            .eq('user_id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching conversation for layout mode save:', fetchError)
            return
          }

          const existingMetadata = (conversation?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('conversations')
            .update({
              metadata: { ...existingMetadata, layoutMode },
            })
            .eq('id', currentConversationId)
            .eq('user_id', user.id)

          if (updateError) {
            console.error('Error updating conversation layout mode:', updateError)
          } else {
            console.log(`✅ Saved layout mode "${layoutMode}" to board ${currentConversationId}`)
          }
        } else {
          // Save to profile metadata (default board /board) - only default board preferences
          const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('metadata')
            .eq('id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching profile for layout mode save:', fetchError)
            return
          }

          const existingMetadata = (profile?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              metadata: { ...existingMetadata, layoutMode },
            })
            .eq('id', user.id)

          if (updateError) {
            console.error('Error updating profile layout mode:', updateError)
          } else {
            console.log(`✅ Saved layout mode "${layoutMode}" to default board (/board)`)
          }
        }
      } catch (error) {
        console.error('Error saving layout mode to Supabase:', error)
      }
    }

    saveToSupabase()
  }, [layoutMode]) // Only run when layoutMode changes, NOT when conversationId changes

  // Save line style to localStorage and Supabase when it changes
  // If conversationId is undefined, saves to profiles.metadata (default board)
  // If conversationId exists, saves to conversations.metadata (specific board)
  // NOTE: Only runs when lineStyle changes, NOT when conversationId changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isLoadingRef.current) return // Skip saves during loading/navigation to prevent overwriting wrong board

    // Use ref to get current conversationId (doesn't trigger effect when it changes)
    const currentConversationId = conversationIdRef.current

    // Save to localStorage immediately (lightweight, instant)
    const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
    const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
    localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, lineStyle }))

    // Also save to old key for backward compatibility
    localStorage.setItem('nodnotes-line-style', lineStyle)

    // Save to Supabase in background (for cross-device sync)
    const saveToSupabase = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.warn('Cannot save line style: user not authenticated')
          return
        }

        if (currentConversationId) {
          // Save to conversation metadata (specific board) - only this board's preferences
          const { data: conversation, error: fetchError } = await supabase
            .from('conversations')
            .select('metadata')
            .eq('id', currentConversationId)
            .eq('user_id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching conversation for line style save:', fetchError)
            return
          }

          const existingMetadata = (conversation?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('conversations')
            .update({
              metadata: { ...existingMetadata, lineStyle },
            })
            .eq('id', currentConversationId)
            .eq('user_id', user.id)

          if (updateError) {
            console.error('Error updating conversation line style:', updateError)
          } else {
            console.log(`✅ Saved line style "${lineStyle}" to board ${currentConversationId}`)
          }
        } else {
          // Save to profile metadata (default board /board) - only default board preferences
          const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('metadata')
            .eq('id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching profile for line style save:', fetchError)
            return
          }

          const existingMetadata = (profile?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              metadata: { ...existingMetadata, lineStyle },
            })
            .eq('id', user.id)

          if (updateError) {
            console.error('Error updating profile line style:', updateError)
          } else {
            console.log(`✅ Saved line style "${lineStyle}" to default board (/board)`)
          }
        }
      } catch (error) {
        console.error('Error saving line style to Supabase:', error)
      }
    }

    saveToSupabase()
  }, [lineStyle]) // Only run when lineStyle changes, NOT when conversationId changes

  // Save board rule to localStorage and Supabase when it changes
  // If conversationId is undefined, saves to profiles.metadata (default board)
  // If conversationId exists, saves to conversations.metadata (specific board)
  // NOTE: Only runs when boardRule changes, NOT when conversationId changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isLoadingRef.current) return // Skip saves during loading/navigation to prevent overwriting wrong board

    // Use ref to get current conversationId (doesn't trigger effect when it changes)
    const currentConversationId = conversationIdRef.current

    // Save to localStorage immediately (lightweight, instant)
    const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
    const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
    localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, boardRule }))

    // Save to Supabase in background (for cross-device sync)
    const saveToSupabase = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.warn('Cannot save board rule: user not authenticated')
          return
        }

        if (currentConversationId) {
          // Save to conversation metadata (specific board) - only this board's preferences
          const { data: conversation, error: fetchError } = await supabase
            .from('conversations')
            .select('metadata')
            .eq('id', currentConversationId)
            .eq('user_id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching conversation for board rule save:', fetchError)
            return
          }

          const existingMetadata = (conversation?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('conversations')
            .update({
              metadata: { ...existingMetadata, boardRule },
            })
            .eq('id', currentConversationId)
            .eq('user_id', user.id)

          if (updateError) {
            console.error('Error updating conversation board rule:', updateError)
          } else {
            console.log(`✅ Saved board rule "${boardRule}" to board ${currentConversationId}`)
          }
        } else {
          // Save to profile metadata (default board /board) - only default board preferences
          const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('metadata')
            .eq('id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching profile for board rule save:', fetchError)
            return
          }

          const existingMetadata = (profile?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              metadata: { ...existingMetadata, boardRule },
            })
            .eq('id', user.id)

          if (updateError) {
            console.error('Error updating profile board rule:', updateError)
          } else {
            console.log(`✅ Saved board rule "${boardRule}" to default board (/board)`)
          }
        }
      } catch (error) {
        console.error('Error saving board rule to Supabase:', error)
      }
    }

    saveToSupabase()
  }, [boardRule]) // Only run when boardRule changes, NOT when conversationId changes

  // Save board style to localStorage and Supabase when it changes
  // If conversationId is undefined, saves to profiles.metadata (default board)
  // If conversationId exists, saves to conversations.metadata (specific board)
  // NOTE: Only runs when boardStyle changes, NOT when conversationId changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isLoadingRef.current) return // Skip saves during loading/navigation to prevent overwriting wrong board

    // Use ref to get current conversationId (doesn't trigger effect when it changes)
    const currentConversationId = conversationIdRef.current

    // Save to localStorage immediately (lightweight, instant)
    const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
    const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
    localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, boardStyle }))

    // Save to Supabase in background (for cross-device sync)
    const saveToSupabase = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.warn('Cannot save board style: user not authenticated')
          return
        }

        if (currentConversationId) {
          // Save to conversation metadata (specific board) - only this board's preferences
          const { data: conversation, error: fetchError } = await supabase
            .from('conversations')
            .select('metadata')
            .eq('id', currentConversationId)
            .eq('user_id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching conversation for board style save:', fetchError)
            return
          }

          const existingMetadata = (conversation?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('conversations')
            .update({
              metadata: { ...existingMetadata, boardStyle },
            })
            .eq('id', currentConversationId)
            .eq('user_id', user.id)

          if (updateError) {
            console.error('Error updating conversation board style:', updateError)
          } else {
            console.log(`✅ Saved board style "${boardStyle}" to board ${currentConversationId}`)
          }
        } else {
          // Save to profile metadata (default board /board) - only default board preferences
          const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('metadata')
            .eq('id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching profile for board style save:', fetchError)
            return
          }

          const existingMetadata = (profile?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              metadata: { ...existingMetadata, boardStyle },
            })
            .eq('id', user.id)

          if (updateError) {
            console.error('Error updating profile board style:', updateError)
          } else {
            console.log(`✅ Saved board style "${boardStyle}" to default board (/board)`)
          }
        }
      } catch (error) {
        console.error('Error saving board style to Supabase:', error)
      }
    }

    saveToSupabase()
  }, [boardStyle]) // Only run when boardStyle changes, NOT when conversationId changes

  // Save board font to localStorage and Supabase when it changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isLoadingRef.current) return

    const currentConversationId = conversationIdRef.current
    const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
    const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
    localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, boardFont }))

    const saveToSupabase = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        if (currentConversationId) {
          const { data: conversation, error: fetchError } = await supabase
            .from('conversations')
            .select('metadata')
            .eq('id', currentConversationId)
            .eq('user_id', user.id)
            .single()
          if (fetchError) return
          const existingMetadata = (conversation?.metadata as Record<string, unknown>) || {}
          await supabase
            .from('conversations')
            .update({ metadata: { ...existingMetadata, boardFont } })
            .eq('id', currentConversationId)
            .eq('user_id', user.id)
        } else {
          const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('metadata')
            .eq('id', user.id)
            .single()
          if (fetchError) return
          const existingMetadata = (profile?.metadata as Record<string, unknown>) || {}
          await supabase
            .from('profiles')
            .update({ metadata: { ...existingMetadata, boardFont } })
            .eq('id', user.id)
        }
      } catch (error) {
        console.error('Error saving board font to Supabase:', error)
      }
    }

    void saveToSupabase()
  }, [boardFont])

  // Save arrow direction to localStorage and Supabase when it changes
  // If conversationId is undefined, saves to profiles.metadata (default board)
  // If conversationId exists, saves to conversations.metadata (specific board)
  // NOTE: Only runs when arrowDirection changes, NOT when conversationId changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isLoadingRef.current) return // Skip saves during loading/navigation to prevent overwriting wrong board

    // Use ref to get current conversationId (doesn't trigger effect when it changes)
    const currentConversationId = conversationIdRef.current

    // Save to localStorage immediately (lightweight, instant)
    const storageKey = currentConversationId ? `nodnotes-prefs-${currentConversationId}` : 'nodnotes-prefs-default'
    const existingPrefs = JSON.parse(localStorage.getItem(storageKey) || '{}')
    localStorage.setItem(storageKey, JSON.stringify({ ...existingPrefs, arrowDirection }))

    // Also save to old key for backward compatibility
    localStorage.setItem('nodnotes-arrow-direction', arrowDirection)

    // Save to Supabase in background (for cross-device sync)
    const saveToSupabase = async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          console.warn('Cannot save arrow direction: user not authenticated')
          return
        }

        if (currentConversationId) {
          // Save to conversation metadata (specific board) - only this board's preferences
          const { data: conversation, error: fetchError } = await supabase
            .from('conversations')
            .select('metadata')
            .eq('id', currentConversationId)
            .eq('user_id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching conversation for arrow direction save:', fetchError)
            return
          }

          const existingMetadata = (conversation?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('conversations')
            .update({
              metadata: { ...existingMetadata, arrowDirection },
            })
            .eq('id', currentConversationId)
            .eq('user_id', user.id)

          if (updateError) {
            console.error('Error updating conversation arrow direction:', updateError)
          } else {
            console.log(`✅ Saved arrow direction "${arrowDirection}" to board ${currentConversationId}`)
          }
        } else {
          // Save to profile metadata (default board /board) - only default board preferences
          const { data: profile, error: fetchError } = await supabase
            .from('profiles')
            .select('metadata')
            .eq('id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching profile for arrow direction save:', fetchError)
            return
          }

          const existingMetadata = (profile?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('profiles')
            .update({
              metadata: { ...existingMetadata, arrowDirection },
            })
            .eq('id', user.id)

          if (updateError) {
            console.error('Error updating profile arrow direction:', updateError)
          } else {
            console.log(`✅ Saved arrow direction "${arrowDirection}" to default board (/board)`)
          }
        }
      } catch (error) {
        console.error('Error saving arrow direction to Supabase:', error)
      }
    }

    saveToSupabase()
  }, [arrowDirection]) // Only run when arrowDirection changes, NOT when conversationId changes

  // Reload selections from Supabase when a new conversation/board is created
  // This ensures selections made before sending the first message are preserved
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleConversationCreated = (e: Event) => {
      const customEvent = e as CustomEvent<{ conversationId: string }>
      const newConversationId = customEvent.detail?.conversationId

      if (!newConversationId) return

      // Only copy preferences if we're on /board (conversationId is undefined)
      // This ensures new boards created from /board inherit /board preferences
      // Existing boards should not be affected by /board changes
      if (conversationId !== undefined) {
        // We're on a specific board, don't copy preferences
        // Just reload the new board's own preferences immediately
        loadPreferencesFromSupabase(newConversationId)
        return
      }

      // When a new board is created from /board, copy current /board preferences to the new board
      // This ensures the new board inherits the current selections, even if they haven't been saved yet
      const copyPrefsToNewBoard = async () => {
        try {
          const supabase = createClient()
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) {
            console.warn('Cannot copy preferences to new board: user not authenticated')
            return
          }

          // Use current state values (most up-to-date, even if not yet saved)
          // These are the preferences currently shown on /board
          const currentPrefs = {
            layoutMode,
            lineStyle,
            arrowDirection,
          }

          // Copy to new board's conversation metadata
          const { data: conversation, error: fetchError } = await supabase
            .from('conversations')
            .select('metadata')
            .eq('id', newConversationId)
            .eq('user_id', user.id)
            .single()

          if (fetchError) {
            console.error('Error fetching new conversation for preference copy:', fetchError)
            return
          }

          const existingMetadata = (conversation?.metadata as Record<string, any>) || {}

          const { error: updateError } = await supabase
            .from('conversations')
            .update({
              metadata: { ...existingMetadata, ...currentPrefs },
            })
            .eq('id', newConversationId)
            .eq('user_id', user.id)

          if (updateError) {
            console.error('Error copying preferences to new board:', updateError)
          } else {
            console.log(`✅ Copied /board preferences to new board ${newConversationId}:`, currentPrefs)
          }

          // Also copy to localStorage for instant loading
          const defaultStorageKey = 'nodnotes-prefs-default'
          const defaultPrefsStr = localStorage.getItem(defaultStorageKey)
          if (defaultPrefsStr) {
            localStorage.setItem(`nodnotes-prefs-${newConversationId}`, defaultPrefsStr)
          } else {
            // If no default prefs in localStorage, save current state
            localStorage.setItem(`nodnotes-prefs-${newConversationId}`, JSON.stringify(currentPrefs))
          }
        } catch (error) {
          console.error('Error copying preferences to new board:', error)
        }
      }

      copyPrefsToNewBoard()

      // Load immediately - localStorage already has the copied preferences (instant)
      // Supabase sync happens in background, no delay needed
      loadPreferencesFromSupabase(newConversationId)
    }

    const handleReloadPreferences = () => {
      // Set loading flag to prevent saves during reload
      isLoadingRef.current = true
      // Reload preferences when explicitly requested (e.g., from BoardFlowInner)
      loadPreferencesFromSupabase(conversationId).finally(() => {
        isLoadingRef.current = false
      })
    }

    // Also reload when pathname changes (to catch navigation)
    const handlePathnameChange = () => {
      // Set loading flag to prevent saves during reload
      isLoadingRef.current = true
      // Load immediately - localStorage is instant, Supabase syncs in background
      loadPreferencesFromSupabase(conversationId).finally(() => {
        isLoadingRef.current = false
      })
    }

    // Listen for conversation-created event
    window.addEventListener('conversation-created', handleConversationCreated)

    // Listen for explicit reload request
    window.addEventListener('reload-preferences', handleReloadPreferences)

    // Listen for pathname changes (navigation)
    window.addEventListener('popstate', handlePathnameChange)

    // Override pushState and replaceState to catch programmatic navigation
    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState

    window.history.pushState = function (...args) {
      originalPushState.apply(window.history, args)
      setTimeout(handlePathnameChange, 0)
    }

    window.history.replaceState = function (...args) {
      originalReplaceState.apply(window.history, args)
      setTimeout(handlePathnameChange, 0)
    }

    return () => {
      window.removeEventListener('conversation-created', handleConversationCreated)
      window.removeEventListener('reload-preferences', handleReloadPreferences)
      window.removeEventListener('popstate', handlePathnameChange)
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
    }
  }, [loadPreferencesFromSupabase])

  // Reload preferences when pathname changes (new board created or navigation)
  // Note: conversationId changes are handled in the main load effect above
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Set loading flag to prevent saves during reload
    isLoadingRef.current = true

    // Load immediately - localStorage is instant, Supabase syncs in background
    // No need for multiple retries since localStorage loads synchronously
    loadPreferencesFromSupabase(conversationId).finally(() => {
      isLoadingRef.current = false
    })
  }, [pathname, conversationId, loadPreferencesFromSupabase])

  // (Mount reload folded into the pathname/conversationId effect above — it fired on the same deps.)

  // Sync deterministic mapping state with layoutMode
  // None = no branching (disabled), Auto/Tree/Cluster = branching (enabled)
  useEffect(() => {
    setIsDeterministicMapping(layoutMode !== 'none')
  }, [layoutMode])

  // Getter function to access the ref value
  const getSetNodes = useCallback(() => setNodesRef.current, [])

  // Registration function that updates the ref (doesn't trigger re-render)
  const registerSetNodes = useCallback((fn: ((nodes: any) => void) | undefined) => {
    setNodesRef.current = fn
  }, [])

  // Map undo function - calls the registered undo from BoardFlow
  const mapUndo = useCallback(() => {
    mapUndoRedoRef.current.undo()
  }, [])

  // Map redo function - calls the registered redo from BoardFlow
  const mapRedo = useCallback(() => {
    mapUndoRedoRef.current.redo()
  }, [])

  // Registration function for undo/redo from BoardFlow (updates ref and triggers state for button disabled states)
  const registerMapUndoRedo = useCallback((fns: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }) => {
    mapUndoRedoRef.current = fns
    // Update state to trigger re-render for button disabled states
    setMapUndoRedoState({ canUndo: fns.canUndo, canRedo: fns.canRedo })
  }, [])

  // Getter for takeSnapshot function
  const getMapTakeSnapshot = useCallback(() => mapTakeSnapshotRef.current, [])

  // Registration function for takeSnapshot from BoardFlow
  const registerMapTakeSnapshot = useCallback((fn: () => void) => {
    mapTakeSnapshotRef.current = fn
  }, [])

  return (
    <ReactFlowContext.Provider value={{ reactFlowInstance, setReactFlowInstance, getSetNodes, registerSetNodes, isLocked, setIsLocked, layoutMode, setLayoutMode, isDeterministicMapping, setIsDeterministicMapping, panelWidth, setPanelWidth, isPromptBoxCentered, setIsPromptBoxCentered, lineStyle, setLineStyle, arrowDirection, setArrowDirection, editMenuPillMode, setEditMenuPillMode, viewMode, boardRule, setBoardRule, boardStyle, setBoardStyle, boardFont, setBoardFont, fillColor, setFillColor, borderColor, setBorderColor, borderWeight, setBorderWeight, borderStyle, setBorderStyle, clickedEdge, setClickedEdge, flashcardMode, setFlashcardMode, selectedTag, setSelectedTag: toggleSelectedTag, isDrawing, setIsDrawing, drawTool, setDrawTool, eraserMode, setEraserMode, drawTipSize, setDrawTipSize, eraserTipSize, setEraserTipSize, pencilColor, setPencilColor, highlighterColor, setHighlighterColor, drawShape, setDrawShape, mapUndo, mapRedo, canMapUndo: mapUndoRedoState.canUndo, canMapRedo: mapUndoRedoState.canRedo, registerMapUndoRedo, getMapTakeSnapshot, registerMapTakeSnapshot, snapEnabled, setSnapEnabled }}>
      {children}
    </ReactFlowContext.Provider>
  )
}

export function useReactFlowContext() {
  const context = useContext(ReactFlowContext)
  if (context === undefined) {
    // Return null values if context is not available (graceful degradation)
    return { reactFlowInstance: null, setReactFlowInstance: () => { }, getSetNodes: () => undefined, registerSetNodes: () => { }, isLocked: false, setIsLocked: () => { }, layoutMode: 'auto' as const, setLayoutMode: () => { }, isDeterministicMapping: false, setIsDeterministicMapping: () => { }, panelWidth: 768, setPanelWidth: () => { }, isPromptBoxCentered: false, setIsPromptBoxCentered: () => { }, lineStyle: 'solid' as const, setLineStyle: () => { }, arrowDirection: 'down' as const, setArrowDirection: () => { }, editMenuPillMode: 'home' as const, setEditMenuPillMode: () => { }, viewMode: 'canvas' as const, boardRule: 'college' as const, setBoardRule: () => { }, boardStyle: 'dotted' as const, setBoardStyle: () => { }, boardFont: 'default' as const, setBoardFont: () => { }, fillColor: '', setFillColor: () => { }, borderColor: '', setBorderColor: () => { }, borderWeight: 1, setBorderWeight: () => { }, borderStyle: 'solid' as const, setBorderStyle: () => { }, clickedEdge: null, setClickedEdge: () => { }, flashcardMode: null, setFlashcardMode: () => { }, selectedTag: null, setSelectedTag: () => { }, isDrawing: false, setIsDrawing: () => { }, drawTool: null, setDrawTool: () => { }, eraserMode: 'stroke' as const, setEraserMode: () => { }, drawTipSize: 12, setDrawTipSize: () => { }, eraserTipSize: 28, setEraserTipSize: () => { }, pencilColor: 'black' as const, setPencilColor: () => { }, highlighterColor: 'black' as const, setHighlighterColor: () => { }, drawShape: 'rectangle' as const, setDrawShape: () => { }, mapUndo: () => { }, mapRedo: () => { }, canMapUndo: false, canMapRedo: false, registerMapUndoRedo: () => { }, getMapTakeSnapshot: () => undefined, registerMapTakeSnapshot: () => { }, snapEnabled: false, setSnapEnabled: () => { } }
  }
  return context
}

