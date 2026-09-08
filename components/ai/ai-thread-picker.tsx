'use client'

// Thread picker — click-open portaled popup: row hover via pointer tracking (CSS :hover stalls after open)
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AiThread } from '@/lib/ai/types'
import { cn } from '@/lib/utils'
import {
  Check,
  ChevronDown,
  GitFork,
  ListFilter,
  Loader2,
  MoreHorizontal,
  Pin,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getPinnedChatThreadIds,
  sortThreadsWithPins,
  togglePinnedChatThread,
} from '@/lib/ai/pinned-chat-threads'

export type AiThreadFilter = 'all' | 'board'

interface AiThreadPickerProps {
  boardId?: string
  thread: AiThread | null
  onSelect: (thread: AiThread) => void
  onFork: (thread: AiThread) => void
  refreshKey?: number
}

export function AiThreadPicker({
  boardId,
  thread,
  onSelect,
  onFork,
  refreshKey = 0,
}: AiThreadPickerProps) {
  const [open, setOpen] = useState(false)
  const [threads, setThreads] = useState<AiThread[]>([])
  const [loading, setLoading] = useState(false)
  const [forkingId, setForkingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<AiThreadFilter>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => getPinnedChatThreadIds())
  const [rowMenuId, setRowMenuId] = useState<string | null>(null)
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(
    null
  )

  const updatePanelPos = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const width = Math.max(288, rect.width)
    // Sidebar sits at the right edge, so a trigger-left panel overflows the window and
    // clips the row actions. Clamp into view (8px gutter) like a menu's collision handling.
    const maxLeft = window.innerWidth - width - 8
    setPanelPos({
      top: rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, maxLeft)),
      width,
    })
  }, [])

  const syncHoverFromPoint = useCallback((x: number, y: number) => {
    const panel = panelRef.current
    if (!panel) return
    const hit = document.elementFromPoint(x, y)
    if (!hit || !panel.contains(hit)) {
      setHoveredThreadId(null)
      return
    }
    const row = hit.closest('[data-chat-thread-row]')
    setHoveredThreadId(row?.getAttribute('data-thread-id') ?? null)
  }, [])

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      lastPointerRef.current = { x: e.clientX, y: e.clientY }
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    return () => document.removeEventListener('pointermove', onMove)
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null)
      setHoveredThreadId(null)
      return
    }
    updatePanelPos()
  }, [open, updatePanelPos])

  useEffect(() => {
    if (!open) return
    const onLayout = () => updatePanelPos()
    window.addEventListener('resize', onLayout)
    window.addEventListener('scroll', onLayout, true)
    return () => {
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('scroll', onLayout, true)
    }
  }, [open, updatePanelPos])

  useEffect(() => {
    if (!open) return
    const onPointerMove = (e: PointerEvent) => {
      syncHoverFromPoint(e.clientX, e.clientY)
    }
    document.addEventListener('pointermove', onPointerMove, true)
    return () => document.removeEventListener('pointermove', onPointerMove, true)
  }, [open, syncHoverFromPoint])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRowMenuId(null)
        setFilterOpen(false)
        setOpen(false)
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setRowMenuId(null)
      setFilterOpen(false)
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        params.set('filter', filter)
        if (filter === 'board' && boardId) params.set('boardId', boardId)
        const res = await fetch(`/api/ai/threads?${params.toString()}`)
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) setThreads(data.threads || [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [filter, boardId, refreshKey])

  const filteredThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const base = q ? threads.filter((t) => t.title?.toLowerCase().includes(q)) : threads
    return sortThreadsWithPins(base)
  }, [threads, searchQuery, pinnedIds])

  useLayoutEffect(() => {
    if (!open || loading) return
    const { x, y } = lastPointerRef.current
    syncHoverFromPoint(x, y)
  }, [open, loading, filteredThreads, syncHoverFromPoint])

  const handleForkThread = async (source: AiThread) => {
    if (forkingId) return
    setForkingId(source.id)
    setRowMenuId(null)
    try {
      const res = await fetch(`/api/ai/threads/${source.id}/fork`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      if (data.thread) {
        onFork(data.thread as AiThread)
        setOpen(false)
      }
    } finally {
      setForkingId(null)
    }
  }

  const togglePin = (threadId: string) => {
    setPinnedIds(togglePinnedChatThread(threadId))
  }

  const panel =
    open && panelPos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={panelRef}
            data-chat-thread-picker-popup
            style={{
              position: 'fixed',
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              zIndex: 10000, // Above board drag overlays so pointermove can hit rows
              pointerEvents: 'auto',
            }}
            className="flex flex-col max-h-[min(24rem,70vh)] overflow-hidden rounded-2xl border border-gray-200 dark:border-[#2f2f2f] bg-white dark:bg-[#171717] shadow-xl"
          >
            <div className="px-4 pt-2 pb-2 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-1 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Search anything..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-7 h-8 text-sm rounded-lg border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
                <div className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    className={cn(
                      'h-8 w-8 rounded-lg bg-transparent border-0 hover:bg-gray-100 dark:hover:bg-gray-800 group',
                      (filterOpen || filter === 'board') &&
                        'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    )}
                    title="Filter chats"
                    aria-label="Filter chats"
                    aria-expanded={filterOpen}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setFilterOpen((v) => !v)
                    }}
                  >
                    <ListFilter className="h-4 w-4 text-gray-500 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors" />
                  </Button>
                  {filterOpen && (
                    <div className="absolute right-0 top-full z-50 mt-0.5 min-w-[9.5rem] overflow-hidden rounded-md border border-gray-200 dark:border-[#2f2f2f] bg-white dark:bg-[#171717] py-1 shadow-md">
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-[#1f1f1f]',
                          filter === 'all' && 'font-medium text-gray-900 dark:text-gray-100'
                        )}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          setFilter('all')
                          setFilterOpen(false)
                        }}
                      >
                        <span className="flex-1">All chats</span>
                        {filter === 'all' && <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        type="button"
                        disabled={!boardId}
                        className={cn(
                          'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-[#1f1f1f] disabled:opacity-40',
                          filter === 'board' && 'font-medium text-gray-900 dark:text-gray-100'
                        )}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!boardId) return
                          setFilter('board')
                          setFilterOpen(false)
                        }}
                      >
                        <span className="flex-1">This board</span>
                        {filter === 'board' && <Check className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div
              className="mx-4 h-px flex-shrink-0 bg-gray-200 dark:bg-[#2f2f2f]"
              aria-hidden
            />

            <div className="px-4 flex-shrink-0">
              <div className="flex items-center gap-0.5 pl-1 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 min-h-[32px]">
                <span>Chats</span>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-400/50 [&::-webkit-scrollbar-thumb]:rounded-full">
              {loading && (
                <div className="px-1 py-1.5 text-xs text-gray-500">Loading…</div>
              )}
              {!loading && filteredThreads.length === 0 && (
                <div className="px-1 py-1.5 text-xs text-gray-500">
                  {searchQuery.trim() ? 'No matching chats' : 'No chats yet'}
                </div>
              )}
              <ul className="space-y-0">
                {filteredThreads.map((t) => {
                  const isActive = thread?.id === t.id
                  const isPinned = pinnedIds.has(t.id)
                  const menuOpen = rowMenuId === t.id
                  const isHovered = hoveredThreadId === t.id
                  return (
                    <li key={t.id}>
                      <div
                        data-chat-thread-row
                        data-thread-id={t.id}
                        className={cn(
                          'group relative flex w-full items-center gap-0.5 pr-1 h-8 rounded-lg border border-transparent text-sm transition-colors',
                          isActive
                            ? 'bg-blue-50 dark:bg-[#2a2a3a]'
                            : isHovered &&
                                '[@media(hover:hover)]:bg-gray-50 dark:[@media(hover:hover)]:bg-[#1f1f1f]'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(t)
                            setOpen(false)
                          }}
                          className="flex-1 min-w-0 truncate text-left pl-1 pr-1 text-gray-700 dark:text-gray-300"
                        >
                          {t.title}
                        </button>
                        <div
                          data-chat-row-actions
                          className={cn(
                            'flex items-center flex-shrink-0 transition-opacity',
                            'opacity-100 [@media(hover:hover)]:opacity-0',
                            (isHovered || isPinned || menuOpen) &&
                              '[@media(hover:hover)]:opacity-100'
                          )}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-6 hover:bg-transparent text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-200"
                            title={isPinned ? 'Unpin chat' : 'Pin chat'}
                            aria-label={isPinned ? 'Unpin chat' : 'Pin chat'}
                            onClick={(e) => {
                              e.stopPropagation()
                              togglePin(t.id)
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                          >
                            <Pin
                              className={cn(
                                'h-4 w-4',
                                isPinned && 'fill-current text-gray-700 dark:text-gray-200'
                              )}
                            />
                          </Button>
                          <div className="relative">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-6 hover:bg-transparent text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-200"
                              title="Chat options"
                              aria-label="Chat options"
                              onClick={(e) => {
                                e.stopPropagation()
                                setRowMenuId((cur) => (cur === t.id ? null : t.id))
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                            {rowMenuId === t.id && (
                              <div className="absolute right-0 top-full z-50 mt-0.5 min-w-[11rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                                <button
                                  type="button"
                                  disabled={forkingId === t.id}
                                  className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent disabled:opacity-50"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    void handleForkThread(t)
                                  }}
                                >
                                  {forkingId === t.id ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <GitFork className="h-4 w-4 mr-2" />
                                  )}
                                  Duplicate chat
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault() // Avoid focus trap that stalls :hover until window refocus
          setRowMenuId(null)
          setFilterOpen(false)
          setOpen((prev) => !prev)
        }}
        className="flex w-full max-w-full min-w-0 items-center rounded-md px-1.5 py-1 text-sm font-medium text-gray-900 dark:text-gray-100 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
        title={thread?.title || 'Chat sessions'}
      >
        <span className="inline-flex max-w-full min-w-0 items-center gap-1">
          <span className="min-w-0 truncate text-left">
            {thread?.title || 'New AI chat'}
          </span>
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-gray-500 dark:text-gray-400" />
        </span>
      </button>
      {panel}
    </>
  )
}
