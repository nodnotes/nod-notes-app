// Board-global frame filters — Notion-like match; hide non-matching frames when nothing is selected.

import type { Node } from 'reactflow'
import type { DatabaseFilter, FilterOperator } from '@/lib/notion/database-view'
import { parsePropertyBlockTag } from '@/lib/tiptap/property-block-html'
import { propertyTypeLabel, isPropertyTypeId, readFramePropertyType } from '@/lib/blocks/property'

/** True when the operator has no value field. */
function operatorNeedsValue(op: FilterOperator): boolean {
  return op !== 'is_empty' && op !== 'is_not_empty'
}

/** Content search scope: omitted or anything other than property means body text. */
function contentSearchTarget(filter: DatabaseFilter): 'text' | 'property' {
  if (filter.property.trim().toLowerCase() !== 'content') return 'text' // Other properties ignore the field
  return filter.contentTarget === 'property' ? 'property' : 'text'
}

/** True when this rule should hide non-matching frames. */
export function isBoardFilterActive(filter: DatabaseFilter): boolean {
  if (contentSearchTarget(filter) === 'property') return true // Property target applies with no typed value
  if (!operatorNeedsValue(filter.operator)) return true // Is empty / Is not empty
  return filter.value.trim().length > 0 // Typed a value
}

/** Filters that are ready to apply (have a value, are empty-ops, or target properties). */
export function appliedFilters(filters: DatabaseFilter[]): DatabaseFilter[] {
  return filters.filter(isBoardFilterActive)
}

/** Strip tags → plain text for Content / Name fallbacks. */
export function plainTextFromHtml(html: string): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Value of a named propertyBlock cell in frame HTML (name or type label). */
function propertyValueFromHtml(html: string, property: string): string | null {
  if (!html || !html.includes('propertyBlock')) return null
  const want = property.trim().toLowerCase()
  if (!want) return null
  const re = /<div\b[^>]*data-type=["']propertyBlock["'][^>]*>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const { type, propertyName } = parsePropertyBlockTag(m[0])
    const name = (propertyName || (type ? propertyTypeLabel(type) : '')).trim().toLowerCase()
    if (name !== want) continue
    const vm = m[0].match(/data-value=["']([^"']*)["']/)
    return vm ? vm[1] : ''
  }
  // Also match by raw type id (e.g. filter property "Status" vs type status)
  if (isPropertyTypeId(want)) {
    const re2 = /<div\b[^>]*data-type=["']propertyBlock["'][^>]*>/gi
    let m2: RegExpExecArray | null
    while ((m2 = re2.exec(html))) {
      const { type } = parsePropertyBlockTag(m2[0])
      if (type !== want) continue
      const vm = m2[0].match(/data-value=["']([^"']*)["']/)
      return vm ? vm[1] : ''
    }
  }
  return null
}

/** Turn an HTML attribute value back into the text the user typed. */
function unescapeAttr(text: string): string {
  return text
    .replace(/&quot;/g, '"') // Quotes written by escapeAttr
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&') // Amp last so other entities stay intact
}

/** Names, type labels, and values of every propertyBlock — Content search in Property mode. */
function propertySearchTextFromHtml(html: string): string {
  if (!html || !html.includes('propertyBlock')) return '' // No cells to search
  const parts: string[] = [] // Joined into one haystack for the operator
  const re = /<div\b[^>]*data-type=["']propertyBlock["'][^>]*>/gi // Opening tag, any attr order
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const { type, propertyName } = parsePropertyBlockTag(m[0]) // Name + type id
    if (propertyName) parts.push(propertyName) // Notion column name
    if (type) parts.push(propertyTypeLabel(type)) // Menu label (Status, Text, …)
    const vm = m[0].match(/data-value=["']([^"']*)["']/) // Cell value lives on the tag
    if (vm?.[1]) parts.push(unescapeAttr(vm[1]))
  }
  return parts.join(' ')
}

/** True when the frame has a property cell or a frame-level property type. */
function frameHasProperties(
  meta: Record<string, unknown> | null | undefined,
  content: string
): boolean {
  if (readFramePropertyType(meta)) return true // metadata.propertyType (header strip)
  return content.includes('propertyBlock') // Inline or strip propertyBlock
}

/** Property haystack: cell name, type label, and value, plus the frame-level type. */
function propertySearchText(
  meta: Record<string, unknown> | null | undefined,
  html: string
): string {
  const fromHtml = propertySearchTextFromHtml(html) // Cells in the body
  const frameType = readFramePropertyType(meta) // Type stored only on metadata
  if (!frameType) return fromHtml
  const label = propertyTypeLabel(frameType)
  if (fromHtml.toLowerCase().includes(label.toLowerCase())) return fromHtml // Already in a cell
  return fromHtml ? `${fromHtml} ${label}` : label
}

/** Field text for a filter property on one frame. */
export function frameFilterFieldText(
  meta: Record<string, unknown> | null | undefined,
  content: string,
  property: string
): string {
  const key = property.trim().toLowerCase()
  if (key === 'name') {
    const title = typeof meta?.blockTitle === 'string' ? meta.blockTitle.trim() : ''
    return title
  }
  if (key === 'content') {
    return plainTextFromHtml(content)
  }
  const fromCell = propertyValueFromHtml(content, property)
  if (fromCell != null) return fromCell
  // Fallback: Name-like — treat unknown props as body search only when labeled Content-ish
  return ''
}

/** Notion-like text compare for one operator. */
export function textMatchesFilterOperator(
  text: string,
  operator: FilterOperator,
  value: string
): boolean {
  const t = text.trim()
  const v = value.trim()
  switch (operator) {
    case 'is':
      return t.toLowerCase() === v.toLowerCase()
    case 'is_not':
      return t.toLowerCase() !== v.toLowerCase()
    case 'contains':
      return t.toLowerCase().includes(v.toLowerCase())
    case 'does_not_contain':
      return !t.toLowerCase().includes(v.toLowerCase())
    case 'starts_with':
      return t.toLowerCase().startsWith(v.toLowerCase())
    case 'ends_with':
      return t.toLowerCase().endsWith(v.toLowerCase())
    case 'is_empty':
      return t.length === 0
    case 'is_not_empty':
      return t.length > 0
    case 'gt': {
      const a = parseFloat(t)
      const b = parseFloat(v)
      return !Number.isNaN(a) && !Number.isNaN(b) && a > b
    }
    case 'lt': {
      const a = parseFloat(t)
      const b = parseFloat(v)
      return !Number.isNaN(a) && !Number.isNaN(b) && a < b
    }
    default:
      return true
  }
}

/** One filter against one frame (meta + HTML). */
export function frameMatchesFilter(
  meta: Record<string, unknown> | null | undefined,
  content: string,
  filter: DatabaseFilter
): boolean {
  if (contentSearchTarget(filter) === 'property') {
    const has = frameHasProperties(meta, content) // Property cells or metadata.propertyType
    const value = filter.value.trim()
    // No typed value: the operator is about whether a property exists (Contains → only those frames)
    if (!value) {
      switch (filter.operator) {
        case 'does_not_contain':
        case 'is_empty':
        case 'is_not':
          return !has
        default:
          return has // contains, is, starts/ends with, is not empty
      }
    }
    if (!has) {
      // A typed value still cannot match a frame that has no properties
      return filter.operator === 'does_not_contain' || filter.operator === 'is_not'
    }
    return textMatchesFilterOperator(propertySearchText(meta, content), filter.operator, filter.value)
  }
  const text = frameFilterFieldText(meta, content, filter.property) // Name, body text, or one property
  return textMatchesFilterOperator(text, filter.operator, filter.value)
}

/** AND of all applied filters (Notion default). */
export function frameMatchesFilters(
  meta: Record<string, unknown> | null | undefined,
  content: string,
  filters: DatabaseFilter[]
): boolean {
  const active = appliedFilters(filters)
  if (active.length === 0) return true
  return active.every((f) => frameMatchesFilter(meta, content, f))
}

/** RF node helper — chatPanel frames only. */
export function nodeMatchesBoardFilters(node: Node, filters: DatabaseFilter[]): boolean {
  if (node.type !== 'chatPanel') return true
  const data = node.data as {
    promptMessage?: { content?: string; metadata?: Record<string, unknown> }
  } | undefined
  const meta = data?.promptMessage?.metadata
  if (!meta || meta.isBlock !== true) return true // Non-frames stay visible
  return frameMatchesFilters(meta, String(data?.promptMessage?.content || ''), filters)
}

// --- Live board-global filter snapshot (strip writes; board-flow + apply effect read) ---

let snapshot: DatabaseFilter[] = []
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

/** Publish applied board-scope filters (empty = show all). */
export function setLiveBoardFilters(filters: DatabaseFilter[]) {
  const next = appliedFilters(filters)
  const same =
    next.length === snapshot.length &&
    next.every(
      (f, i) =>
        f.id === snapshot[i]?.id &&
        f.property === snapshot[i]?.property &&
        f.operator === snapshot[i]?.operator &&
        f.value === snapshot[i]?.value &&
        contentSearchTarget(f) === contentSearchTarget(snapshot[i] ?? f) // Text vs property re-filters
    )
  if (same) return
  snapshot = next
  notify()
}

export function getLiveBoardFilters(): DatabaseFilter[] {
  return snapshot
}

export function subscribeLiveBoardFilters(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/** True when live board filters hide this frame (stack collapse is separate). */
export function isHiddenByLiveBoardFilter(
  meta: Record<string, unknown> | null | undefined,
  content: string
): boolean {
  if (snapshot.length === 0) return false
  return !frameMatchesFilters(meta, content, snapshot)
}

type ThreadEndNode = {
  type?: string | null
  data?: {
    promptMessage?: { content?: string; metadata?: Record<string, unknown> }
  }
}

/** True when this end is a frame the live board filter still shows. No filter → any end. */
export function frameShownByLiveBoardFilter(node: ThreadEndNode | undefined): boolean {
  if (snapshot.length === 0) return true // No filter — threads are unchanged
  if (!node || node.type !== 'chatPanel') return false // Both ends have to be frames
  const meta = node.data?.promptMessage?.metadata
  if (!meta || meta.isBlock !== true) return false
  return !isHiddenByLiveBoardFilter(meta, String(node.data?.promptMessage?.content || ''))
}
