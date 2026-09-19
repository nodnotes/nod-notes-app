'use client'

// Utility Sets body — set names, plus a Layers-style thumb for each frame in the set

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils' // Selected-row wash + thumb border
import { captureNodePreviewImage } from '@/lib/captures' // Same node-only thumb Layers uses
import { isFrameDragging } from '@/lib/frame-dragging' // Don't snapshot mid-drag
import { useReactFlowContext } from '@/components/react-flow-context' // Thumb click selects that frame
import {
  getSelectedSetId,
  getSetMembers,
  getSets,
  selectSet,
  subscribeSets,
  type SetItemKind,
} from '@/lib/sets-list'
import {
  UtilityFilterOption,
  UtilitySearchHeader,
} from '@/components/utility-search-header'

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
    <li>
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
    const selectOnly = (nds: Array<{ id: string; selected?: boolean }>) =>
      nds.map((n) => ({ ...n, selected: n.id === nodeId })) // Same single-select as Layers
    const setNodes = getSetNodes()
    if (setNodes) setNodes(selectOnly)
    else reactFlowInstance?.setNodes(selectOnly)
    reactFlowInstance?.setEdges((eds) => eds.map((e) => ({ ...e, selected: false })))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <UtilitySearchHeader
        query={query}
        onQueryChange={setQuery}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        filterActive={kind !== 'all'}
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

      {sets.length === 0 ? (
        <div className="flex flex-col gap-1 px-3 py-3 text-xs text-gray-500 dark:text-gray-400">
          <p className="font-medium text-gray-700 dark:text-gray-200">Sets</p>
          <p className="leading-relaxed">
            Use Add to set on a frame.
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-1.5 py-2">
          <p className="px-1.5 pb-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
            Sets · {visible.length}
          </p>
          {visible.length === 0 ? (
            <p className="px-1.5 py-6 text-center text-xs text-gray-400">No matching sets</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visible.map((set) => {
                const on = selectedId === set.id // This row owns the board halo
                const frames = members.filter((m) => m.setId === set.id && m.kind === 'frame' && m.nodeId)
                return (
                  <li key={set.id} className="flex flex-col gap-1">
                    <button
                      type="button"
                      aria-pressed={on} // Toggle: click again clears the glow
                      title={on ? 'Clear highlight' : 'Highlight on the board'}
                      onClick={() => selectSet(set.id)} // Glow every frame in this set
                      className={cn(
                        'w-full rounded-md px-2 py-1.5 text-left',
                        on
                          ? 'bg-blue-500/15 text-blue-700 dark:text-blue-200' // Which set is lit
                          : 'text-gray-800 hover:bg-black/[0.04] dark:text-gray-100 dark:hover:bg-white/[0.06]'
                      )}
                    >
                      <p className="truncate text-[13px] font-medium">{set.name}</p>
                    </button>
                    {frames.length > 0 ? (
                      <ul className="flex flex-col gap-1">
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
    </div>
  )
}
