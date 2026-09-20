'use client'

// Utility Sets body — set names, plus a Layers-style thumb for each frame in the set

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { CalendarDays, Check, List, MoreHorizontal, Pencil, Plus, SquareStack, Trash2 } from 'lucide-react' // Schedule, organize check, + Set, list mark, row ⋯, rename, delete
import { cn } from '@/lib/utils' // Selected-row wash + thumb border
import { captureNodePreviewImage } from '@/lib/captures' // Same node-only thumb Layers uses
import { isFrameDragging } from '@/lib/frame-dragging' // Don't snapshot mid-drag
import { useReactFlowContext } from '@/components/react-flow-context' // Thumb click selects that frame
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  createSet,
  deleteSet,
  getSelectedSetId,
  getSetMembers,
  getSets,
  renameSet,
  selectSet,
  setSetCollapsed,
  subscribeSets,
  type NodSet,
  type SetItemKind,
} from '@/lib/sets-list'
import {
  UtilityFilterOption,
  UtilitySearchHeader,
} from '@/components/utility-search-header'
import { SetScheduleModal } from '@/components/set-schedule-modal' // Sets ⋯ Schedule full-screen planner

/** How the Sets list is arranged. By set is the default. */
type SetOrganize = 'list' | 'set'

/** Shared ⋯ chrome — same as the Layers Add group row. */
const setMoreButtonClass =
  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-black/[0.06] hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-200 [@media(hover:hover)]:opacity-0 data-[state=open]:opacity-100'

/** Two stacked boxes. Closed pulls them together; open keeps the wider offset. The Sets tab stays three boxes. */
function SetIcon({ className, collapsed }: { className?: string; collapsed?: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path
        d={
          collapsed
            ? 'M8 14c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2' // Back box, closer to the front
            : 'M7 13c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2'
        }
      />
      <rect width="8" height="8" x={collapsed ? 9 : 11} y={collapsed ? 9 : 11} rx="2" /> {/* Front box */}
    </svg>
  )
}

const previewCache = new Map<string, string>() // Last good thumb per frame — survives leaving the Sets tab

/** One frame in a set — same bordered 4:3 thumb as a Layers row. */
function SetFrameThumb({
  label,
  url,
  pending,
  lit,
  onOpen,
}: {
  label: string
  url?: string // Data URL, or missing while the node is off this board
  pending: boolean // Still capturing
  lit: boolean // This set is the one glowing on the board
  onOpen: () => void
}) {
  return (
    <li className="w-full shrink-0">
      <button
        type="button"
        onClick={onOpen} // Select this frame, same as a Layers row
        className="w-full text-left"
        title={label}
        aria-label={label}
      >
        <div
          className={cn(
            'relative w-full aspect-[4/3] overflow-hidden rounded-md bg-gray-50 dark:bg-[#1a1a1a]',
            lit
              ? 'border-2 border-blue-500' // Set is selected — same blue ring as a selected layer
              : 'border border-gray-200/80 dark:border-white/10'
          )}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- local data URL, same as Layers
            <img
              src={url}
              alt=""
              className="absolute inset-0 h-full w-full object-contain pointer-events-none"
              draggable={false}
            />
          ) : pending ? (
            <div className="absolute inset-0 animate-pulse bg-gray-100 dark:bg-white/[0.06]" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[11px] text-gray-400">
              {label}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

/** Set name — click collapses like a group; ⋯ on hover of the name or its thumbs. */
function SetNameRow({
  set,
  on,
  renaming,
  onRenameStart,
  onRenameEnd,
  onSchedule,
}: {
  set: NodSet
  on: boolean // This set owns the board halo
  renaming: boolean // New set opens ready to name
  onRenameStart: () => void
  onRenameEnd: () => void
  onSchedule: () => void // Opens the spaced-repetition Schedule popup
}) {
  const skipBlur = useRef(false) // Escape blur must not save the in-progress edit
  const collapsed = !!set.collapsed // Closed hides the thumbs

  useEffect(() => {
    if (!renaming) return
    document.getElementById(`set-name-${set.id}`)?.scrollIntoView({ block: 'nearest' }) // Keep the new name on screen
  }, [renaming, set.id])

  const toggleCollapsed = () => {
    if (renaming) return // The name field owns the click while it is open
    setSetCollapsed(set.id, !collapsed)
  }

  return (
    <div
      id={`set-name-${set.id}`}
      className={cn(
        'relative mt-0.5 flex h-7 items-center gap-1.5 rounded-md pl-1.5',
        on && 'bg-blue-500/15' // Which set is glowing on the board
      )}
    >
      {renaming ? (
        <>
          <SetIcon className="h-4 w-4 flex-shrink-0 text-gray-800 dark:text-gray-200" collapsed={collapsed} />
          <input
            autoFocus // New set opens ready to name
            defaultValue={set.name}
            aria-label="Set name"
            className="min-w-0 flex-1 bg-transparent text-xs text-gray-900 outline-none dark:text-gray-100"
            onFocus={(e) => e.currentTarget.select()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()} // Don't toggle the glow while naming
            onKeyDown={(e) => {
              e.stopPropagation() // Don't let the board steal Enter / Escape
              if (e.key === 'Enter') e.currentTarget.blur()
              if (e.key === 'Escape') {
                skipBlur.current = true
                e.currentTarget.blur()
              }
            }}
            onBlur={(e) => {
              if (!skipBlur.current) renameSet(set.id, e.currentTarget.value) // Blank keeps "Set N"
              skipBlur.current = false
              onRenameEnd()
            }}
          />
        </>
      ) : (
        <button
          type="button"
          title={collapsed ? 'Expand set' : 'Collapse set'}
          aria-label={collapsed ? 'Expand set' : 'Collapse set'}
          aria-expanded={!collapsed}
          aria-pressed={on} // Still marks which set is glowing
          onPointerDown={(e) => e.preventDefault()} // Don't steal focus from the board
          onClick={toggleCollapsed} // Name and icon are one control, same as a group
          onDoubleClick={onRenameStart} // A double-click's two clicks cancel, so collapse stays put
          className={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 text-left',
            on ? 'text-blue-700 dark:text-blue-200' : 'text-gray-800 dark:text-gray-200'
          )}
        >
          <SetIcon className="h-4 w-4 flex-shrink-0" collapsed={collapsed} /> {/* Closer boxes when closed */}
          <span className={cn('min-w-0 flex-1 truncate text-xs', on ? 'text-blue-700 dark:text-blue-200' : 'text-gray-900 dark:text-gray-100')}>{set.name}</span>
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={cn(setMoreButtonClass, '[@media(hover:hover)]:group-hover/set-row:opacity-100')}
            title="Set options"
            aria-label={`${set.name} options`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44"
          onClick={(e) => e.stopPropagation()}
          onCloseAutoFocus={(e) => e.preventDefault()} // Leave focus for the name field, not the ⋯ button
        >
          <DropdownMenuItem onSelect={onRenameStart}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSchedule}>
            <CalendarDays className="mr-2 h-4 w-4" />
            Schedule
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
            onSelect={() => deleteSet(set.id)} // Frames leave the set; the board glow clears
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Sets mode body — search + one row per set, with a thumb for each frame. */
export function SetsList() {
  const sets = useSyncExternalStore(subscribeSets, getSets, () => []) // Oldest first
  const members = useSyncExternalStore(subscribeSets, getSetMembers, () => []) // Newest first
  const selectedId = useSyncExternalStore(subscribeSets, getSelectedSetId, () => null) // Glowing set, or none
  const { reactFlowInstance, getSetNodes } = useReactFlowContext() // Thumb click selects that frame
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {} // Seed from the tab-switch cache
    previewCache.forEach((url, id) => {
      init[id] = url
    })
    return init
  })
  const [failed, setFailed] = useState<Record<string, true>>({}) // Node not on this board — stop the pulse
  const urlsRef = useRef(urls) // Latest thumbs for the edit observer without re-subscribing
  urlsRef.current = urls
  const [query, setQuery] = useState('') // Filter by set name
  const [filterOpen, setFilterOpen] = useState(false)
  const [kind, setKind] = useState<SetItemKind | 'all'>('all')
  const [renamingId, setRenamingId] = useState<string | null>(null) // Set whose name is being edited
  const [scheduleSetId, setScheduleSetId] = useState<string | null>(null) // Set whose Schedule popup is open
  const [organize, setOrganize] = useState<SetOrganize>('set') // ⋯ menu: one list, or set rows
  const [organizeOpen, setOrganizeOpen] = useState(false) // Organize sets menu
  const organizeRef = useRef<HTMLDivElement>(null) // + Set row + ⋯ menu, so outside clicks can close it
  const scheduleSet = scheduleSetId ? sets.find((s) => s.id === scheduleSetId) : null // Title for the Schedule modal

  useEffect(() => {
    if (!organizeOpen) return // Listener only while the ⋯ menu is up
    const onDown = (event: PointerEvent) => {
      if (organizeRef.current?.contains(event.target as globalThis.Node)) return // Keep clicks on the menu itself
      setOrganizeOpen(false) // Click outside closes In one list / By set
    }
    window.addEventListener('pointerdown', onDown, true) // Capture so the board does not eat the click first
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [organizeOpen])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return sets.filter((set) => {
      const rows = members.filter((m) => m.setId === set.id)
      if (kind !== 'all' && !rows.some((m) => m.kind === kind)) return false
      if (q && !set.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [sets, members, query, kind])

  const frameIds = useMemo(() => {
    const ids: string[] = [] // Unique board frames across every set
    for (const m of members) {
      if (m.kind === 'frame' && m.nodeId && !ids.includes(m.nodeId)) ids.push(m.nodeId)
    }
    return ids
  }, [members])
  const frameKey = frameIds.join('|') // Effect key — membership, not thumb patches

  useEffect(() => {
    if (!frameIds.length) return
    let cancelled = false // Unmount or a newer membership list
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const id of frameIds) {
          if (cancelled || isFrameDragging()) return
          const url = await captureNodePreviewImage(id) // Same capture as Layers
          if (cancelled) return
          if (url) {
            previewCache.set(id, url)
            setUrls((prev) => (prev[id] === url ? prev : { ...prev, [id]: url }))
            setFailed((prev) => {
              if (!prev[id]) return prev
              const next = { ...prev }
              delete next[id]
              return next
            })
          } else if (!previewCache.has(id)) {
            setFailed((prev) => (prev[id] ? prev : { ...prev, [id]: true })) // Off-board frame
          }
        }
      })()
    }, 250) // Past selection-chrome measure, same as Layers
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [frameKey, frameIds])

  useEffect(() => {
    if (!frameIds.length) return
    const pending = new Set<string>() // Frames whose DOM changed
    let debounceTimer = 0
    let gen = 0 // Drop a capture if a newer edit landed
    const observers: MutationObserver[] = []
    const flush = () => {
      debounceTimer = 0
      const ids = [...pending]
      pending.clear()
      if (!ids.length || isFrameDragging()) return
      const mine = ++gen
      void (async () => {
        for (const id of ids) {
          if (mine !== gen) return
          const url = await captureNodePreviewImage(id)
          if (mine !== gen || !url || urlsRef.current[id] === url) continue
          previewCache.set(id, url)
          setUrls((prev) => ({ ...prev, [id]: url }))
        }
      })()
    }
    for (const id of frameIds) {
      const safe = id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      const el = document.querySelector(`.react-flow__node[data-id="${safe}"]`)
      if (!el) continue
      const obs = new MutationObserver((records) => {
        if (isFrameDragging()) return
        const meaningful = records.some((r) => {
          if (r.type !== 'attributes') return true // Text or structure changed
          return r.attributeName !== 'data-set-highlight' && r.attributeName !== 'data-in-set' // Glow stamps are not content
        })
        if (!meaningful) return
        pending.add(id)
        window.clearTimeout(debounceTimer)
        debounceTimer = window.setTimeout(flush, 450) // Idle after typing
      })
      obs.observe(el, { subtree: true, childList: true, characterData: true, attributes: true })
      observers.push(obs)
    }
    return () => {
      gen += 1
      window.clearTimeout(debounceTimer)
      observers.forEach((obs) => obs.disconnect())
    }
  }, [frameKey, frameIds])

  const openFrame = (setId: string, nodeId: string) => {
    if (selectedId !== setId) selectSet(setId) // Glow the set without toggling it off
    const setNodes = getSetNodes()
    if (setNodes) {
      setNodes((nds: Array<{ id: string; selected?: boolean }>) =>
        nds.map((n) => ({ ...n, selected: n.id === nodeId })) // Same single-select as Layers
      )
    } else {
      reactFlowInstance?.setNodes((nds) => nds.map((n) => ({ ...n, selected: n.id === nodeId })))
    }
    reactFlowInstance?.setEdges((eds) => eds.map((e) => ({ ...e, selected: false })))
  }

  const onNewSet = () => {
    setOrganize('set') // The new row only shows under By set
    const created = createSet() // Empty "Set N" at the end of the list
    setRenamingId(created.id) // Name it immediately
  }

  const flatFrames = useMemo(() => {
    const byNode = new Map<string, { nodeId: string; label: string; setId: string }>() // One thumb per frame
    for (const set of visible) {
      for (const m of members) {
        if (m.setId !== set.id || m.kind !== 'frame' || !m.nodeId) continue
        const prev = byNode.get(m.nodeId)
        if (!prev || set.id === selectedId) byNode.set(m.nodeId, { nodeId: m.nodeId, label: m.label, setId: set.id }) // Prefer the glowing set
      }
    }
    return [...byNode.values()]
  }, [visible, members, selectedId])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <UtilitySearchHeader
        query={query}
        onQueryChange={setQuery}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        filterActive={kind !== 'all'} // Blue unless every set kind is showing
        filterTitle="Filter sets"
        filterMenu={
          <>
            <UtilityFilterOption
              label="All"
              active={kind === 'all'}
              onSelect={() => {
                setKind('all')
                setFilterOpen(false)
              }}
            />
            <UtilityFilterOption
              label="Frames"
              active={kind === 'frame'}
              onSelect={() => {
                setKind('frame')
                setFilterOpen(false)
              }}
            />
          </>
        }
      />

      <div ref={organizeRef} className="group/set-add relative flex h-8 flex-shrink-0 items-center gap-1 px-1.5 pt-2">
        <button
          type="button"
          className="flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 text-[13px] font-medium text-gray-500 hover:bg-black/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.08]"
          title="New set"
          aria-label="New set"
          onPointerDown={(e) => e.preventDefault()}
          onClick={onNewSet}
        >
          <Plus className="h-4 w-4 flex-shrink-0" /> {/* Same hit target as the word */}
          Set
        </button>
        <button
          type="button"
          className={cn(
            setMoreButtonClass,
            'ml-auto [@media(hover:hover)]:group-hover/set-add:opacity-100',
            organizeOpen && 'opacity-100'
          )}
          title="Organize sets"
          aria-label="Organize sets"
          aria-expanded={organizeOpen}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => setOrganizeOpen((open) => !open)}
        >
          <MoreHorizontal className="h-4 w-4" /> {/* Far right of + Set */}
        </button>
        {organizeOpen && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-gray-200 bg-[var(--nod-chat-prompt)] py-1.5 shadow-lg dark:border-[#2f2f2f]"> {/* Same chrome grey as the utility body */}
            <p className="px-3 pb-1 pt-1 text-xs text-gray-400">Organize sets</p>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-900 hover:bg-[var(--nod-on-chrome)] dark:text-gray-100"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setOrganize('list') // Flat thumbs, no set names
                setOrganizeOpen(false)
              }}
            >
              <List className="h-4 w-4 flex-shrink-0" />
              <span className="min-w-0 flex-1">In one list</span>
              {organize === 'list' && <Check className="h-4 w-4 flex-shrink-0" />}
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-900 hover:bg-[var(--nod-on-chrome)] dark:text-gray-100"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                setOrganize('set') // Set names under + Set
                setOrganizeOpen(false)
              }}
            >
              <SquareStack className="h-4 w-4 flex-shrink-0" />
              <span className="min-w-0 flex-1">By set</span>
              {organize === 'set' && <Check className="h-4 w-4 flex-shrink-0" />}
            </button>
          </div>
        )}
      </div>

      {sets.length === 0 ? (
        <div className="px-3 py-3 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          Use + Set, or Add to set on a frame.
        </div>
      ) : (
        <div className="utility-body-scroll min-h-0 flex-1 pl-1.5 pr-2 py-1"> {/* Not a flex column — that compresses thumbs while a drag reorders */}
          {visible.length === 0 ? (
            <p className="px-1.5 py-6 text-center text-xs text-gray-400">No matching sets</p>
          ) : organize === 'list' ? (
            flatFrames.length === 0 ? (
              <p className="px-1.5 py-6 text-center text-xs text-gray-400">No matching sets</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {flatFrames.map((frame) => (
                  <SetFrameThumb
                    key={frame.nodeId}
                    label={frame.label}
                    url={urls[frame.nodeId]}
                    pending={!urls[frame.nodeId] && !failed[frame.nodeId]}
                    lit={selectedId === frame.setId} // Glow follows the set this thumb was taken from
                    onOpen={() => openFrame(frame.setId, frame.nodeId)}
                  />
                ))}
              </ul>
            )
          ) : (
            <ul className="flex flex-col gap-1">
              {visible.map((set) => {
                const on = selectedId === set.id // This row owns the board halo
                const frames = members.filter((m) => m.setId === set.id && m.kind === 'frame' && m.nodeId)
                return (
                  <li key={set.id} className="group/set-row flex flex-col gap-1"> {/* Hover name or thumb shows ⋯ */}
                    <SetNameRow
                      set={set}
                      on={on}
                      renaming={renamingId === set.id}
                      onRenameStart={() => setRenamingId(set.id)}
                      onRenameEnd={() => setRenamingId((current) => (current === set.id ? null : current))}
                      onSchedule={() => setScheduleSetId(set.id)}
                    />
                    {!set.collapsed && frames.length > 0 ? (
                      <ul className="flex flex-col gap-1 pl-7"> {/* Name column: icon width + gap */}
                        {frames.map((frame) => (
                          <SetFrameThumb
                            key={frame.id}
                            label={frame.label}
                            url={frame.nodeId ? urls[frame.nodeId] : undefined}
                            pending={!!frame.nodeId && !urls[frame.nodeId] && !failed[frame.nodeId]}
                            lit={on}
                            onOpen={() => frame.nodeId && openFrame(set.id, frame.nodeId)}
                          />
                        ))}
                      </ul>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
      <SetScheduleModal
        open={!!scheduleSet}
        onOpenChange={(next) => {
          if (!next) setScheduleSetId(null) // Close clears which set owns the planner
        }}
        setName={scheduleSet?.name ?? 'Set'}
      />
    </div>
  )
}
