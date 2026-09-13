'use client'

// Cursor-style model picker — compact trigger + description panel + searchable list
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronRight, Search } from 'lucide-react'
import {
  AI_MODELS,
  type AiModel,
  type AiModelId,
} from '@/lib/ai/models'
import { cn } from '@/lib/utils'

interface AiModelSelectProps {
  value: AiModelId
  onChange: (id: AiModelId) => void
}

export function AiModelSelect({ value, onChange }: AiModelSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuPos, setMenuPos] = useState<{ left: number; bottom: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => AI_MODELS.find((m) => m.id === value) ?? AI_MODELS[0],
    [value]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return AI_MODELS
    return AI_MODELS.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.shortLabel.toLowerCase().includes(q) ||
        (m.badge || '').toLowerCase().includes(q)
    )
  }, [query])

  const placeMenu = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = 460
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    setMenuPos({ left, bottom: window.innerHeight - r.top + 8 })
  }

  const pick = (model: AiModel) => {
    onChange(model.id)
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    if (!open) return
    placeMenu()
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onReposition = () => placeMenu()
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
    requestAnimationFrame(() => searchRef.current?.focus())
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          'h-8 px-1.5 rounded-lg text-xs font-medium flex-shrink-0 max-w-[5.5rem] truncate',
          'text-gray-800 dark:text-gray-100',
          'hover:bg-black/[0.06] dark:hover:bg-white/[0.08]',
          'focus-visible:outline-none',
          open && 'bg-black/[0.06] dark:bg-white/[0.08]'
        )}
        title={`Model: ${selected.label}`}
        aria-label={`Model: ${selected.label}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open) placeMenu()
          setOpen((o) => !o)
        }}
      >
        {selected.shortLabel}
      </button>

      {open && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="dialog"
              aria-label="Choose model"
              style={{
                position: 'fixed',
                left: menuPos.left,
                bottom: menuPos.bottom,
                zIndex: 80,
              }}
              className={cn(
                'flex w-[min(460px,calc(100vw-16px))]',
                'rounded-xl border border-black/10 dark:border-white/10',
                'bg-white dark:bg-[#1e1e1e] shadow-xl overflow-hidden'
              )}
            >
              <div className="w-[min(200px,42%)] flex-shrink-0 border-r border-black/5 dark:border-white/10 p-3 flex flex-col gap-3">
                <p className="text-xs leading-snug text-gray-600 dark:text-gray-300">
                  {selected.description}
                </p>
                <div className="mt-auto">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                    Model
                  </div>
                  <div
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5',
                      'border border-black/8 dark:border-white/10',
                      'bg-black/[0.03] dark:bg-white/[0.04]',
                      'text-sm text-gray-900 dark:text-gray-100'
                    )}
                  >
                    <span className="truncate">{selected.label}</span>
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                  </div>
                </div>
              </div>

              <div className="flex-1 min-w-0 flex flex-col">
                <div className="px-2.5 pt-2.5 pb-2 border-b border-black/5 dark:border-white/10">
                  <div className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-black/[0.04] dark:bg-white/[0.06]">
                    <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    <input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search models"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                </div>

                <ul className="py-1 max-h-[220px] overflow-y-auto">
                  {filtered.length === 0 ? (
                    <li className="px-3 py-2 text-xs text-gray-400">No matching models</li>
                  ) : (
                    filtered.map((m) => {
                      const active = m.id === value
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => pick(m)}
                            className={cn(
                              'w-full flex items-center gap-2 px-3 py-2 text-left text-sm',
                              active
                                ? 'bg-black/[0.06] dark:bg-white/[0.08]'
                                : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'
                            )}
                          >
                            <span className="flex-1 min-w-0 truncate text-gray-900 dark:text-gray-100">
                              {m.label}
                              {m.badge ? (
                                <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500 font-normal">
                                  {m.badge}
                                </span>
                              ) : null}
                            </span>
                            {active ? (
                              <Check className="h-4 w-4 flex-shrink-0 text-gray-700 dark:text-gray-200" />
                            ) : (
                              <span className="w-4 flex-shrink-0" aria-hidden />
                            )}
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>

                <div className="border-t border-black/5 dark:border-white/10 p-1">
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-gray-400 cursor-not-allowed"
                    title="Coming soon"
                  >
                    Add Models
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}
