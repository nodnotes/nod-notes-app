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

/** Wrap plain (or simple HTML) replacement text in a grey Notion sync mark. */
function notionWrap(inner: string): string {
  if (!inner) return inner
  if (/data-notion-sync=/.test(inner)) return inner
  return `<span data-notion-sync="true" class="tt-notion-sync">${inner}</span>`
}

/** Wrap text insides of p/h blocks (fallback when surgical diff fails). */
function wrapAllTextBlocks(html: string): string {
  return html.replace(TEXT_BLOCK_RE, (_m, open, inner, close) => {
    if (/data-notion-sync=/.test(inner)) return `${open}${inner}${close}`
    const stripped = String(inner).replace(/^\s+|\s+$/g, '')
    if (!stripped || stripped === '<br>' || stripped === '<br/>') return `${open}${inner}${close}`
    if (/^<(?:ul|ol|li|div|table|blockquote)\b/i.test(stripped)) return `${open}${inner}${close}`
    if (/data-type=["'](?:boardLink|databaseBlock|propertyBlock)["']/i.test(stripped)) {
      return `${open}${inner}${close}`
    }
    return `${open}${notionWrap(inner)}${close}`
  })
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
 * Unchanged paragraphs stay unmarked.
 */
function markChangedBlocksOnly(originalHtml: string, notionHtml: string): string {
  const origPlains = new Set(
    topLevelBlocks(originalHtml)
      .map(blockPlain)
      .filter(Boolean)
  )
  const notionBlocks = topLevelBlocks(notionHtml)
  if (notionBlocks.length === 0) return wrapAllTextBlocks(notionHtml)

  let changed = 0
  const out = notionBlocks.map((block) => {
    const plain = blockPlain(block)
    // Atoms / empty — leave alone
    if (!plain) return block
    if (origPlains.has(plain)) return block // Identical content — no highlight
    changed += 1
    // Wrap text insides of this block only (p/h); lists get inner wrap when possible
    return wrapAllTextBlocks(block)
  })

  // If every block looked changed (noise / total rewrite), still better than marking
  // one giant span — keep per-block marks. If nothing changed, fall back to full mark.
  if (changed === 0) return wrapAllTextBlocks(notionHtml)
  return out.join('')
}

/**
 * Apply a plain old→new replacement inside HTML, wrapping only `newText` with notion-sync.
 * Mirrors AI surgical replace, but with grey marks.
 */
function applyNotionReplacement(
  html: string,
  oldText: string,
  newText: string
): string | null {
  if (!oldText) return null
  // Prefer raw substring when oldText has no tags
  if (html.includes(oldText)) {
    return html.replace(oldText, notionWrap(escapePlainAsHtml(newText)))
  }

  // Walk HTML, match plain projection (same approach as AI apply-replacements)
  let matched = 0
  let htmlStart = -1
  let htmlEnd = -1
  let inTag = false

  for (let i = 0; i < html.length; i++) {
    const ch = html[i]
    if (ch === '<') {
      inTag = true
      continue
    }
    if (ch === '>') {
      inTag = false
      continue
    }
    if (inTag) continue

    let plainCh = ch
    let advance = 1
    if (ch === '&') {
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

    if (plainCh === oldText[matched]) {
      if (matched === 0) htmlStart = i
      matched += 1
      if (matched === oldText.length) {
        htmlEnd = i + advance
        break
      }
    } else if (plainCh === oldText[0]) {
      htmlStart = i
      matched = 1
    } else {
      matched = 0
      htmlStart = -1
    }
    i += advance - 1
  }

  if (htmlStart < 0 || htmlEnd < 0) return null
  return html.slice(0, htmlStart) + notionWrap(escapePlainAsHtml(newText)) + html.slice(htmlEnd)
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
 * Prefers surgical plain-text diff on the original; else per-block marks on Notion HTML.
 */
export function buildNotionSyncProposedHtml(
  originalHtml: string,
  notionHtml: string
): string {
  const original = originalHtml || ''
  const notion = notionHtml || ''
  if (!notion.trim()) return notion
  if (htmlHasNotionSync(notion)) return notion

  const origPlain = htmlToPlainLoose(original)
  const notionPlain = htmlToPlainLoose(notion)
  if (origPlain && notionPlain && origPlain === notionPlain) {
    // Timestamps differ but body text matches — no visible change to highlight
    return notion
  }

  // 1) Surgical: patch original so only the changed span is grey (AI-style)
  const inferred = inferReplacementsFromPlain(origPlain, notionPlain)
  if (inferred.length > 0) {
    let next = original
    let applied = 0
    for (const r of inferred) {
      const oldText = (r.oldText || '').trim()
      if (!oldText) continue
      const patched = applyNotionReplacement(next, oldText, r.newText ?? '')
      if (patched) {
        next = patched
        applied += 1
      }
    }
    if (applied > 0 && htmlHasNotionSync(next)) return next
  }

  // 2) Pure insertion (empty oldText): mark the new suffix inside Notion HTML
  if (origPlain && notionPlain.startsWith(origPlain) && notionPlain.length > origPlain.length) {
    const inserted = notionPlain.slice(origPlain.length)
    if (inserted.trim()) {
      const marked = applyNotionReplacement(notion, inserted, inserted)
      // apply looks for oldText=inserted and replaces with wrapped — works when inserted is unique
      if (marked && htmlHasNotionSync(marked)) return marked
      // Fallback: wrap trailing text blocks that aren’t in original
      return markChangedBlocksOnly(original, notion)
    }
  }

  // 3) Structural / multi-block: mark only Notion blocks that aren’t already local
  return markChangedBlocksOnly(original, notion)
}

/** @deprecated Prefer buildNotionSyncProposedHtml — marks the whole body. */
export function markHtmlWithNotionSync(html: string): string {
  if (!html?.trim()) return html
  if (htmlHasNotionSync(html)) return html
  return wrapAllTextBlocks(html)
}

/** Remove Notion sync wrapper spans while keeping inner HTML (accept path). */
export function unwrapNotionSync(html: string): string {
  return html.replace(
    /<span[^>]*data-notion-sync=["']true["'][^>]*>([\s\S]*?)<\/span>/gi,
    '$1'
  )
}
