// Wrap only the changed spans for Notion sync review (grey marks — not the whole frame)

import {
  htmlToPlainLoose,
  inferReplacementsFromPlain,
} from '@/lib/ai/apply-replacements'

/** Match only paragraph/heading text — never li/div (breaks TipTap taskItem contentDOM). */
const TEXT_BLOCK_RE =
  /(<(?:p|h[1-4])(?:\s[^>]*)?>)([\s\S]*?)(<\/(?:p|h[1-4])>)/gi

/** Top-level TipTap / Notion body blocks for structural diff. */
const TOP_BLOCK_RE =
  /<(p|h[1-4]|ul|ol|blockquote|pre|table|hr)(\s[^>]*)?>[\s\S]*?<\/\1>|<hr\s*\/?>|<div[^>]*data-type=["'][^"']+["'][^>]*>[\s\S]*?<\/div>/gi

/** True when HTML has Notion sync pending spans. */
export function htmlHasNotionSync(html: string | null | undefined): boolean {
  return !!html && /data-notion-sync=["']true["']/.test(html)
}

/** True when a fragment is safe to nest inside an inline notion-sync <span>. */
function isInlineHtmlFragment(html: string): boolean {
  // Block tags inside a mark span are dropped by TipTap — highlights vanish
  return !/<(?:p|h[1-6]|ul|ol|li|div|blockquote|pre|table|hr|tr|td|th)\b/i.test(html)
}

/** Wrap plain (or simple HTML) replacement text in a grey Notion sync mark. */
function notionWrap(inner: string): string {
  if (!inner) return inner
  // Only skip when the whole fragment is already a single sync mark
  const trimmed = inner.trim()
  if (
    /^<span\b[^>]*data-notion-sync=["']true["'][^>]*>[\s\S]*<\/span>$/i.test(trimmed)
  ) {
    return inner
  }
  return `<span data-notion-sync="true" class="tt-notion-sync">${inner}</span>`
}

/** True when this p/h inner should stay unmarked (empty / nested / atoms). */
function shouldSkipTextInner(inner: string): boolean {
  if (/data-notion-sync=/.test(inner)) return true // Already marked
  const stripped = String(inner).replace(/^\s+|\s+$/g, '')
  if (!stripped || stripped === '<br>' || stripped === '<br/>') return true
  if (/^<(?:ul|ol|li|div|table|blockquote)\b/i.test(stripped)) return true
  if (/data-type=["'](?:boardLink|databaseBlock|propertyBlock)["']/i.test(stripped)) return true
  return false
}

/** Wrap text insides of every p/h block (last-resort full mark). */
function wrapAllTextBlocks(html: string): string {
  return html.replace(TEXT_BLOCK_RE, (_m, open, inner, close) => {
    if (shouldSkipTextInner(inner)) return `${open}${inner}${close}`
    return `${open}${notionWrap(inner)}${close}`
  })
}

/**
 * Collect normalized plain text of every p/h in HTML (list items included).
 * Used so a one-line list edit does not grey-mark sibling bullets.
 */
function collectTextBlockPlains(html: string): Set<string> {
  const plains = new Set<string>()
  const re = new RegExp(TEXT_BLOCK_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const plain = blockPlain(m[2] ?? '')
    if (plain) plains.add(plain)
  }
  return plains
}

/**
 * Wrap only p/h whose plain text is not already in `originalHtml`.
 * Keeps unchanged list items clear when the parent `<ul>`/`<ol>` is the top-level diff unit.
 */
function wrapChangedTextBlocksOnly(originalHtml: string, html: string): string {
  const origPlains = collectTextBlockPlains(originalHtml)
  let wrapped = 0
  const next = html.replace(TEXT_BLOCK_RE, (_m, open, inner, close) => {
    if (shouldSkipTextInner(inner)) return `${open}${inner}${close}`
    const plain = blockPlain(inner)
    if (!plain || origPlains.has(plain)) return `${open}${inner}${close}` // Unchanged line
    wrapped += 1
    return `${open}${notionWrap(inner)}${close}`
  })
  // If nothing matched (total rewrite / plain mismatch), fall back to marking all text
  if (wrapped === 0) return wrapAllTextBlocks(html)
  return next
}

/** Split HTML into top-level block strings (best-effort). */
function topLevelBlocks(html: string): string[] {
  const blocks: string[] = []
  const re = new RegExp(TOP_BLOCK_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    blocks.push(m[0])
  }
  if (blocks.length === 0 && html.trim()) return [html]
  return blocks
}

/** Plain text of a block for equality checks. */
function blockPlain(html: string): string {
  return htmlToPlainLoose(html).replace(/\s+/g, ' ').trim()
}

/**
 * Mark only Notion blocks whose plain text isn’t already in the original.
 * Unchanged paragraphs stay unmarked. For lists, mark only changed items
 * (top-level unit is the whole `<ul>`/`<ol>`, so wrap by inner p/h plain).
 */
function markChangedBlocksOnly(originalHtml: string, notionHtml: string): string {
  const origPlains = new Set(
    topLevelBlocks(originalHtml)
      .map(blockPlain)
      .filter(Boolean)
  )
  const notionBlocks = topLevelBlocks(notionHtml)
  if (notionBlocks.length === 0) return wrapChangedTextBlocksOnly(originalHtml, notionHtml)

  let changed = 0
  const out = notionBlocks.map((block) => {
    const plain = blockPlain(block)
    // Atoms / empty — leave alone
    if (!plain) return block
    if (origPlains.has(plain)) return block // Identical content — no highlight
    changed += 1
    // Mark only p/h lines that aren’t already in the original (list siblings stay clear)
    return wrapChangedTextBlocksOnly(originalHtml, block)
  })

  // If every block looked changed (noise / total rewrite), still better than marking
  // one giant span — keep per-block marks. If nothing changed, fall back to full mark.
  if (changed === 0) return wrapChangedTextBlocksOnly(originalHtml, notionHtml)
  return out.join('')
}

/** Remove Notion sync wrapper spans while keeping inner HTML (accept / heal path). */
export function unwrapNotionSync(html: string): string {
  let prev = ''
  let next = html || ''
  // Nested review marks from repeated syncs — peel until stable
  while (prev !== next) {
    prev = next
    next = next.replace(
      /<span[^>]*data-notion-sync=["']true["'][^>]*>([\s\S]*?)<\/span>/gi,
      '$1'
    )
  }
  return next
}

/** Strip leftover review marks so diffs / Accept don’t start from dirty HTML. */
export function sanitizeNotionSyncHtml(html: string): string {
  return unwrapNotionSync(html || '')
}

/**
 * Find the HTML slice in `html` whose loose plain text equals `plain`.
 * Used so surgical sync keeps Notion bold/links instead of escaped plain text.
 */
function htmlSliceForPlain(html: string, plain: string): string | null {
  if (!plain || !html) return null
  let matched = 0
  let htmlStart = -1
  let htmlEnd = -1
  let i = 0

  const advanceMatch = (plainCh: string, from: number, to: number): boolean => {
    if (plainCh === plain[matched]) {
      if (matched === 0) htmlStart = from
      matched += 1
      if (matched === plain.length) {
        htmlEnd = to
        return true
      }
    } else if (plainCh === plain[0]) {
      htmlStart = from
      matched = 1
      if (matched === plain.length) {
        htmlEnd = to
        return true
      }
    } else {
      matched = 0
      htmlStart = -1
    }
    return false
  }

  while (i < html.length) {
    if (html[i] === '<') {
      const slice = html.slice(i)
      const br = slice.match(/^<br\s*\/?>/i)
      const pClose = slice.match(/^<\/p>/i)
      if (br || pClose) {
        const tagLen = (br?.[0] || pClose![0]).length
        if (advanceMatch('\n', i, i + tagLen)) break
        i += tagLen
        continue
      }
      const tagEnd = html.indexOf('>', i)
      if (tagEnd < 0) break
      i = tagEnd + 1
      continue
    }

    let plainCh = html[i]
    let advance = 1
    if (plainCh === '&') {
      if (html.startsWith('&nbsp;', i)) {
        plainCh = ' '
        advance = 6
      } else if (html.startsWith('&amp;', i)) {
        plainCh = '&'
        advance = 5
      } else if (html.startsWith('&lt;', i)) {
        plainCh = '<'
        advance = 4
      } else if (html.startsWith('&gt;', i)) {
        plainCh = '>'
        advance = 4
      }
    }

    if (advanceMatch(plainCh, i, i + advance)) break
    i += advance
  }

  if (htmlStart < 0 || htmlEnd < 0) return null
  return html.slice(htmlStart, htmlEnd)
}

/**
 * Apply a plain old→new replacement inside HTML, wrapping only `newText` with notion-sync.
 * When `notionHtml` is provided, prefer Notion’s formatted slice for `newText` so Accept
 * keeps bold/links instead of escaped plain text.
 */
function applyNotionReplacement(
  html: string,
  oldText: string,
  newText: string,
  notionHtml?: string
): string | null {
  if (!oldText) return null
  const markedInner = (() => {
    if (!newText) return ''
    // Prefer Notion’s inline formatting for the new text — never block-level slices
    // (those break TipTap marks and kill grey highlights on re-sync).
    const fromNotion = notionHtml ? htmlSliceForPlain(notionHtml, newText) : null
    if (fromNotion && fromNotion.length > 0 && isInlineHtmlFragment(fromNotion)) {
      return fromNotion
    }
    return escapePlainAsHtml(newText)
  })()

  // Prefer raw substring when oldText has no tags / newlines
  if (!oldText.includes('\n') && html.includes(oldText)) {
    return html.replace(oldText, notionWrap(markedInner))
  }

  // Walk HTML with the same plain projection as htmlToPlainLoose
  let matched = 0
  let htmlStart = -1
  let htmlEnd = -1
  let i = 0

  const advanceMatch = (plainCh: string, from: number, to: number): boolean => {
    if (plainCh === oldText[matched]) {
      if (matched === 0) htmlStart = from
      matched += 1
      if (matched === oldText.length) {
        htmlEnd = to
        return true // Done
      }
    } else if (plainCh === oldText[0]) {
      htmlStart = from
      matched = 1
      if (matched === oldText.length) {
        htmlEnd = to
        return true
      }
    } else {
      matched = 0
      htmlStart = -1
    }
    return false
  }

  while (i < html.length) {
    if (html[i] === '<') {
      const slice = html.slice(i)
      const br = slice.match(/^<br\s*\/?>/i)
      const pClose = slice.match(/^<\/p>/i)
      if (br || pClose) {
        const tagLen = (br?.[0] || pClose![0]).length
        if (advanceMatch('\n', i, i + tagLen)) break
        i += tagLen
        continue
      }
      const tagEnd = html.indexOf('>', i)
      if (tagEnd < 0) break
      i = tagEnd + 1 // Strip other tags (same as htmlToPlainLoose)
      continue
    }

    let plainCh = html[i]
    let advance = 1
    if (plainCh === '&') {
      if (html.startsWith('&nbsp;', i)) {
        plainCh = ' '
        advance = 6
      } else if (html.startsWith('&amp;', i)) {
        plainCh = '&'
        advance = 5
      } else if (html.startsWith('&lt;', i)) {
        plainCh = '<'
        advance = 4
      } else if (html.startsWith('&gt;', i)) {
        plainCh = '>'
        advance = 4
      }
    }

    if (advanceMatch(plainCh, i, i + advance)) break
    i += advance
  }

  if (htmlStart < 0 || htmlEnd < 0) return null
  return html.slice(0, htmlStart) + notionWrap(markedInner) + html.slice(htmlEnd)
}

/** Escape plain text for safe insertion as HTML text nodes. */
function escapePlainAsHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

/**
 * Build proposed HTML for Notion sync review: mark only what changed.
 * Structural marks on Notion HTML first (reliable grey highlights after Keep mine
 * re-sync). Surgical patch of local HTML is a fallback when it still produces marks.
 */
export function buildNotionSyncProposedHtml(
  originalHtml: string,
  notionHtml: string
): string {
  // Always start clean — leftover review marks corrupt diffs and Accept formatting
  const original = sanitizeNotionSyncHtml(originalHtml || '')
  const notion = sanitizeNotionSyncHtml(notionHtml || '')
  if (!notion.trim()) return notion

  const norm = (s: string) => htmlToPlainLoose(s).replace(/\s+/g, ' ').trim()
  if (norm(original) && norm(notion) && norm(original) === norm(notion)) {
    // Body text matches — nothing to highlight
    return notion
  }

  // 1) Structural: mark changed Notion blocks (survives TipTap parse; re-sync safe)
  const structural = markChangedBlocksOnly(original, notion)
  if (htmlHasNotionSync(structural)) return structural

  // 2) Surgical: patch local HTML so boardLinks stay; only keep if marks survive
  const origPlain = htmlToPlainLoose(original)
  const notionPlain = htmlToPlainLoose(notion)
  const inferred = inferReplacementsFromPlain(origPlain, notionPlain)
  if (inferred.length > 0) {
    let next = original
    let applied = 0
    for (const r of inferred) {
      const oldText = (r.oldText || '').trim()
      if (!oldText) continue
      const patched = applyNotionReplacement(next, oldText, r.newText ?? '', notion)
      if (patched) {
        next = patched
        applied += 1
      }
    }
    if (applied > 0 && htmlHasNotionSync(next)) return next
  }

  // 3) Pure insertion: mark the new suffix inside Notion HTML
  if (origPlain && notionPlain.startsWith(origPlain) && notionPlain.length > origPlain.length) {
    const inserted = notionPlain.slice(origPlain.length)
    if (inserted.trim()) {
      const marked = applyNotionReplacement(notion, inserted, inserted, notion)
      if (marked && htmlHasNotionSync(marked)) return marked
    }
  }

  // 4) Last resort — grey every text block on the Notion body
  const forced = wrapAllTextBlocks(notion)
  if (htmlHasNotionSync(forced)) return forced
  return structural
}

/** @deprecated Prefer buildNotionSyncProposedHtml — marks the whole body. */
export function markHtmlWithNotionSync(html: string): string {
  if (!html?.trim()) return html
  if (htmlHasNotionSync(html)) return html
  return wrapAllTextBlocks(sanitizeNotionSyncHtml(html))
}
