'use client'

// Custom emoji picker that renders OpenMoji SVG art (not OS Apple/Google glyphs).
import { useMemo, useState } from 'react'
import data from '@emoji-mart/data'
import { Search } from 'lucide-react'
import { emojiNativeToUnified, openmojiSvgUrl } from '@/lib/openmoji'
import { Input } from '@/components/ui/input'

type EmojiSkin = { unified: string; native: string } // One skin tone / default glyph
type EmojiEntry = {
  id: string
  name: string
  keywords?: string[]
  skins: EmojiSkin[]
}

type Category = { id: string; emojis: string[] } // emoji-mart category row

export type OpenMojiSelection = {
  id: string // Stable emoji-mart id
  name: string // Human label
  native: string // Unicode character for persistence
  unified: string // Hexcode for OpenMoji CDN
}

type OpenMojiPickerProps = {
  onSelect: (emoji: OpenMojiSelection) => void // Called when user picks an emoji
  className?: string
  /** Drop card chrome so the picker can live inside Edit profile window. */
  embedded?: boolean
  /** Skip autofocus (useful inside dialogs that already have a title focus). */
  autoFocus?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  people: 'Smileys',
  nature: 'Nature',
  foods: 'Food',
  activity: 'Activity',
  places: 'Places',
  objects: 'Objects',
  symbols: 'Symbols',
  flags: 'Flags',
}

export function OpenMojiPicker({
  onSelect,
  className,
  embedded = false,
  autoFocus = true,
}: OpenMojiPickerProps) {
  const categories = (data as { categories: Category[] }).categories // All emoji-mart categories
  const emojis = (data as { emojis: Record<string, EmojiEntry> }).emojis // Id → emoji metadata
  const [query, setQuery] = useState('') // Search box text
  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? 'people') // Tab

  // Resolve which emoji ids to show (search overrides category).
  const visibleIds = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      return Object.values(emojis)
        .filter((e) => {
          if (e.name.toLowerCase().includes(q)) return true
          if (e.id.toLowerCase().includes(q)) return true
          return e.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false
        })
        .map((e) => e.id)
        .slice(0, 200) // Cap search results for snappy grids
    }
    const cat = categories.find((c) => c.id === activeCategory)
    return cat?.emojis ?? []
  }, [query, activeCategory, categories, emojis])

  const shellClass = embedded
    ? `w-full overflow-hidden flex flex-col ${className ?? ''}`
    : `w-[320px] bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden flex flex-col ${className ?? ''}`

  return (
    <div
      className={shellClass}
      onPointerDown={(e) => e.stopPropagation()} // Keep dropdown open while interacting
    >
      {/* Search */}
      <div className={`p-2 ${embedded ? '' : 'border-b border-gray-100 dark:border-gray-800'}`}>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            data-openmoji-search
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji"
            className="h-8 pl-8 text-sm dark:bg-gray-800 dark:border-gray-700"
            autoFocus={autoFocus && !embedded}
          />
        </div>
      </div>

      {/* Category tabs — hidden while searching */}
      {!query.trim() && (
        <div className="flex gap-0.5 px-1.5 pt-1.5 overflow-x-auto border-b border-gray-100 dark:border-gray-800">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 px-2 py-1 text-[11px] rounded-md transition-colors ${
                activeCategory === cat.id
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium'
                  : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/60'
              }`}
            >
              {CATEGORY_LABELS[cat.id] ?? cat.id}
            </button>
          ))}
        </div>
      )}

      {/* OpenMoji grid */}
      <div
        className={`${embedded ? 'h-[180px]' : 'h-[240px]'} overflow-y-auto p-1.5 grid grid-cols-8 gap-0.5 content-start`}
      >
        {visibleIds.map((id) => {
          const entry = emojis[id]
          const skin = entry?.skins?.[0]
          if (!entry || !skin) return null
          const src = openmojiSvgUrl(skin.unified)
          return (
            <button
              key={id}
              type="button"
              title={entry.name}
              aria-label={entry.name}
              className="h-9 w-9 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              onClick={() =>
                onSelect({
                  id: entry.id,
                  name: entry.name,
                  native: skin.native,
                  unified: skin.unified,
                })
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- CDN SVG; Next Image unnecessary */}
              <img src={src} alt="" width={28} height={28} className="h-7 w-7 pointer-events-none" loading="lazy" />
            </button>
          )
        })}
        {visibleIds.length === 0 && (
          <p className="col-span-8 text-center text-xs text-gray-500 py-8">No matches</p>
        )}
      </div>

      {/* CC BY-SA attribution required by OpenMoji */}
      <div className="px-2 py-1.5 border-t border-gray-100 dark:border-gray-800">
        <p className="text-[10px] text-gray-400 text-center">
          Emoji art by{' '}
          <a
            href="https://openmoji.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-600 dark:hover:text-gray-300"
          >
            OpenMoji
          </a>{' '}
          (CC BY-SA 4.0)
        </p>
      </div>
    </div>
  )
}

/** Renders a single OpenMoji from a stored native emoji (or falls back to children). */
export function OpenMojiImg({
  native,
  unified,
  size = 28,
  className,
  alt = '',
}: {
  native?: string | null
  unified?: string | null
  size?: number
  className?: string
  alt?: string
}) {
  const hex = unified || (native ? emojiNativeToUnified(native) : null) // Prefer stored unified hex
  if (!hex) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={openmojiSvgUrl(hex)}
      alt={alt}
      width={size}
      height={size}
      className={className}
      draggable={false}
    />
  )
}
