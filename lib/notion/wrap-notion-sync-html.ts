// Inline Notion sync review: highlight inserts, strikethrough deletes (not whole blocks).

import { htmlToPlainLoose } from '@/lib/ai/apply-replacements'

/** True when HTML has Notion sync pending spans. */
export function htmlHasNotionSync(html: string | null | undefined): boolean {
  return !!html && /data-notion-sync=["']true["']/.test(html)
}

/** Escape plain text for data-notion-prev attribute. */
export function encodeNotionPrevAttr(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Escape plain text for safe insertion as HTML text nodes. */
function escapePlainAsHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

/** True when a fragment is safe to nest inside an inline notion-sync <span>. */
function isInlineHtmlFragment(html: string): boolean {
  return !/<(?:p|h[1-6]|ul|ol|li|div|blockquote|pre|table|hr|tr|td|th)\b/i.test(html)
}

/** Notion insert / replacement (grey). `prev` = local text to restore on Keep non red. */
function notionInsWrap(inner: string, prev?: string | null): string {
  if (!inner) return inner
  const trimmed = inner.trim()
  if (/^<span\b[^>]*data-notion-sync=["']true["'][^>]*>[\s\S]*<\/span>$/i.test(trimmed)) {
    return inner
  }
  const prevAttr =
    prev != null && prev !== ''
      ? ` data-notion-prev="${encodeNotionPrevAttr(prev)}"`
      : ''
  return `<span data-notion-sync="true" data-notion-sync-kind="ins" class="tt-notion-sync"${prevAttr}>${inner}</span>`
}

/** Local text Notion removed — strikethrough; Keep non red keeps it (unstrikes). */
function notionDelWrap(inner: string): string {
  if (!inner) return inner
  const trimmed = inner.trim()
  if (/^<span\b[^>]*data-notion-sync-kind=["']del["'][^>]*>[\s\S]*<\/span>$/i.test(trimmed)) {
    return inner
  }
  return `<span data-notion-sync="true" data-notion-sync-kind="del" class="tt-notion-sync tt-notion-sync-del">${inner}</span>`
}

type DiffOp = { type: 'eq' | 'del' | 'ins'; text: string }

/** Split into words + whitespace tokens so diffs stay readable. */
function tokenizeWords(s: string): string[] {
  return s.split(/(\s+)/).filter((t) => t.length > 0)
}

/** Merge adjacent same-type ops. */
function mergeOps(ops: DiffOp[]): DiffOp[] {
  const out: DiffOp[] = []
  for (const op of ops) {
    const last = out[out.length - 1]
    if (last && last.type === op.type) last.text += op.text
    else out.push({ ...op })
  }
  return out
}

/** Word-level LCS diff (local → Notion). */
function diffWords(a: string, b: string): DiffOp[] {
  const A = tokenizeWords(a)
  const B = tokenizeWords(b)
  const n = A.length
  const m = B.length
  if (n === 0 && m === 0) return []
  if (n === 0) return [{ type: 'ins', text: b }]
  if (m === 0) return [{ type: 'del', text: a }]

  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const ops: DiffOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      ops.push({ type: 'eq', text: A[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: A[i] })
      i += 1
    } else {
      ops.push({ type: 'ins', text: B[j] })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ type: 'del', text: A[i] })
    i += 1
  }
  while (j < m) {
    ops.push({ type: 'ins', text: B[j] })
    j += 1
  }
  return mergeOps(ops)
}

type InlineEdit = {
  /** Plain text to find in the current HTML (empty for pure insert). */
  find: string
  /** HTML to insert in place of `find` (or after anchor for pure insert). */
  replacement: string
  /** For pure insert: plain text that precedes the insertion (eq token before). */
  after?: string
}

/** Turn word-diff ops into HTML edits on the local document. */
function opsToInlineEdits(ops: DiffOp[], notionHtml: string): InlineEdit[] {
  const edits: InlineEdit[] = []
  let i = 0
  while (i < ops.length) {
    if (ops[i].type === 'eq') {
      i += 1
      continue
    }
    const afterEq = (() => {
      for (let k = i - 1; k >= 0; k--) {
        if (ops[k].type === 'eq') return ops[k].text
      }
      return ''
    })()

    let del = ''
    let ins = ''
    while (i < ops.length && ops[i].type === 'del') {
      del += ops[i].text
      i += 1
    }
    while (i < ops.length && ops[i].type === 'ins') {
      ins += ops[i].text
      i += 1
    }
    // Ins then del in LCS order is unusual; absorb trailing dels into this hunk
    while (i < ops.length && ops[i].type === 'del' && !ins) {
      del += ops[i].text
      i += 1
    }

    if (del && ins) {
      const newInner =
        (isInlineHtmlFragment(ins) && htmlSliceForPlain(notionHtml, ins)) ||
        escapePlainAsHtml(ins)
      edits.push({
        find: del,
        replacement: notionDelWrap(escapePlainAsHtml(del)) + notionInsWrap(newInner, del),
      })
    } else if (del) {
      edits.push({
        find: del,
        replacement: notionDelWrap(escapePlainAsHtml(del)),
      })
    } else if (ins) {
      const newInner =
        (isInlineHtmlFragment(ins) && htmlSliceForPlain(notionHtml, ins)) ||
        escapePlainAsHtml(ins)
      edits.push({
        find: '',
        replacement: notionInsWrap(newInner, ''),
        after: afterEq,
      })
    }
  }
  return edits
}

/**
 * Find the HTML slice in `html` whose loose plain text equals `plain`.
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

/** Map a plain substring to HTML [start,end) in `html` (first match). */
function plainRangeInHtml(html: string, plain: string): { start: number; end: number } | null {
  if (!plain) return null
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
  return { start: htmlStart, end: htmlEnd }
}

/** Apply one find→replacement edit on HTML (plain projection). */
function applyInlineEdit(html: string, edit: InlineEdit): string | null {
  if (edit.find) {
    if (!edit.find.includes('\n') && html.includes(edit.find)) {
      return html.replace(edit.find, edit.replacement)
    }
    const range = plainRangeInHtml(html, edit.find)
    if (!range) return null
    return html.slice(0, range.start) + edit.replacement + html.slice(range.end)
  }
  // Pure insert after `after` plain (or at start)
  if (edit.after) {
    const range = plainRangeInHtml(html, edit.after)
    if (!range) return null
    return html.slice(0, range.end) + edit.replacement + html.slice(range.end)
  }
  // Insert at first text position inside first p/h
  const m = html.match(/<(?:p|h[1-4])(?:\s[^>]*)?>/i)
  if (!m || m.index == null) return null
  const at = m.index + m[0].length
  return html.slice(0, at) + edit.replacement + html.slice(at)
}

/** Paragraph / heading / list-item inners — TipTap-safe mark targets. */
const TEXT_INNER_RE =
  /(<(?:p|h[1-4]|li)(?:\s[^>]*)?>)([\s\S]*?)(<\/(?:p|h[1-4]|li)>)/gi

type BlockChunk = { html: string; plain: string }

/** Split TipTap HTML into top-level blocks for structural diff. */
function splitTopLevelBlocks(html: string): BlockChunk[] {
  const trimmed = (html || '').trim()
  if (!trimmed) return []
  const pieces = trimmed
    .split(/(?=<(?:p|h[1-4]|ul|ol|blockquote|pre|table|hr)\b)/i)
    .map((p) => p.trim())
    .filter(Boolean)
  return pieces.map((blockHtml) => ({
    html: blockHtml,
    plain: htmlToPlainLoose(blockHtml).replace(/\s+/g, ' ').trim(),
  }))
}

type SeqOp =
  | { type: 'eq'; ai: number; bi: number }
  | { type: 'del'; ai: number }
  | { type: 'ins'; bi: number }

/** LCS over block plain-text keys. */
function diffBlockSequences(A: string[], B: string[]): SeqOp[] {
  const n = A.length
  const m = B.length
  if (n === 0 && m === 0) return []
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: SeqOp[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) {
      ops.push({ type: 'eq', ai: i, bi: j })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', ai: i })
      i += 1
    } else {
      ops.push({ type: 'ins', bi: j })
      j += 1
    }
  }
  while (i < n) {
    ops.push({ type: 'del', ai: i })
    i += 1
  }
  while (j < m) {
    ops.push({ type: 'ins', bi: j })
    j += 1
  }
  return ops
}

/** Mark every text-bearing inner in a block as Notion insert (new block). */
function markBlockAsIns(blockHtml: string): string {
  let marked = false
  const next = blockHtml.replace(TEXT_INNER_RE, (_m, open, inner, close) => {
    if (/data-notion-sync=/.test(inner)) return `${open}${inner}${close}`
    const stripped = String(inner).replace(/^\s+|\s+$/g, '')
    if (!stripped || /^<br\s*\/?>$/i.test(stripped)) return `${open}${inner}${close}`
    marked = true
    return `${open}${notionInsWrap(inner)}${close}`
  })
  if (marked) return next
  // Non text-block (hr, empty) — leave as-is; still visible as new structure
  return next
}

/** Mark every text-bearing inner in a local block as deletion (Notion removed it). */
function markBlockAsDel(blockHtml: string): string {
  return blockHtml.replace(TEXT_INNER_RE, (_m, open, inner, close) => {
    if (/data-notion-sync=/.test(inner)) return `${open}${inner}${close}`
    const stripped = String(inner).replace(/^\s+|\s+$/g, '')
    if (!stripped || /^<br\s*\/?>$/i.test(stripped)) return `${open}${inner}${close}`
    return `${open}${notionDelWrap(inner)}${close}`
  })
}

/**
 * Word-level proposed HTML within one (or few) blocks — inserts highlighted, dels struck.
 */
function buildWordLevelProposedHtml(originalHtml: string, notionHtml: string): string {
  const original = originalHtml || ''
  const notion = notionHtml || ''
  const origPlain = htmlToPlainLoose(original)
  const notionPlain = htmlToPlainLoose(notion)
  const ops = diffWords(origPlain, notionPlain)
  const edits = opsToInlineEdits(ops, notion)
  if (edits.length === 0) return notion

  let next = original
  let applied = 0
  for (let i = edits.length - 1; i >= 0; i--) {
    // Block-level inserts (newlines / multi-block) can't nest in a mark span
    const edit = edits[i]
    if (!edit.find && edit.replacement && !isInlineHtmlFragment(edit.replacement)) {
      continue
    }
    if (
      edit.find &&
      edit.replacement.includes('data-notion-sync-kind="ins"') &&
      !isInlineHtmlFragment(
        edit.replacement.replace(/<span[^>]*data-notion-sync[^>]*>|<\/span>/gi, '')
      )
    ) {
      // Fall through to block path caller
      continue
    }
    const patched = applyInlineEdit(next, edit)
    if (patched) {
      next = patched
      applied += 1
    }
  }

  if (applied > 0 && htmlHasNotionSync(next)) return next

  const inferredDel = ops.filter((o) => o.type === 'del').map((o) => o.text).join('')
  const inferredIns = ops.filter((o) => o.type === 'ins').map((o) => o.text).join('')
  if (inferredDel) {
    const newInner =
      (inferredIns &&
        isInlineHtmlFragment(inferredIns) &&
        htmlSliceForPlain(notion, inferredIns)) ||
      escapePlainAsHtml(inferredIns || '')
    const replacement =
      (inferredDel ? notionDelWrap(escapePlainAsHtml(inferredDel)) : '') +
      (inferredIns ? notionInsWrap(newInner || '', inferredDel) : '')
    const patched = applyInlineEdit(original, { find: inferredDel, replacement })
    if (patched && htmlHasNotionSync(patched)) return patched
  }

  // Pure Notion additions with no local anchor — mark Notion blocks as inserts
  if (!inferredDel && inferredIns) {
    return markBlockAsIns(notion)
  }

  return next
}

/**
 * Build proposed HTML for Notion sync review:
 * - New / removed **blocks** get TipTap-safe grey / strike on their text
 * - In-place edits use word-level highlight + strikethrough
 */
export function buildNotionSyncProposedHtml(
  originalHtml: string,
  notionHtml: string
): string {
  const original = sanitizeNotionSyncHtml(originalHtml || '')
  const notion = sanitizeNotionSyncHtml(notionHtml || '')
  if (!notion.trim()) return notion

  const origPlain = htmlToPlainLoose(original)
  const notionPlain = htmlToPlainLoose(notion)
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  if (norm(origPlain) && norm(notionPlain) && norm(origPlain) === norm(notionPlain)) {
    return notion
  }

  const origBlocks = splitTopLevelBlocks(original)
  const notionBlocks = splitTopLevelBlocks(notion)

  // Single-block (or unstructured) → word-level only
  if (origBlocks.length <= 1 && notionBlocks.length <= 1) {
    return buildWordLevelProposedHtml(original || '<p></p>', notion)
  }

  const ops = diffBlockSequences(
    origBlocks.map((b) => b.plain),
    notionBlocks.map((b) => b.plain)
  )

  const parts: string[] = []
  let i = 0
  while (i < ops.length) {
    const op = ops[i]
    if (op.type === 'eq') {
      parts.push(origBlocks[op.ai].html) // Keep local markup when text matches
      i += 1
      continue
    }

    // Adjacent del+ins → treat as in-place edit (word-level inside the pair)
    if (op.type === 'del' && ops[i + 1]?.type === 'ins') {
      const delOp = op
      const insOp = ops[i + 1] as Extract<SeqOp, { type: 'ins' }>
      const localHtml = origBlocks[delOp.ai].html
      const remoteHtml = notionBlocks[insOp.bi].html
      const mixed = buildWordLevelProposedHtml(localHtml, remoteHtml)
      if (htmlHasNotionSync(mixed)) {
        parts.push(mixed)
      } else {
        // Word path failed — show struck local + highlighted Notion block
        parts.push(markBlockAsDel(localHtml))
        parts.push(markBlockAsIns(remoteHtml))
      }
      i += 2
      continue
    }

    if (op.type === 'del') {
      parts.push(markBlockAsDel(origBlocks[op.ai].html))
      i += 1
      continue
    }

    // New Notion block(s)
    parts.push(markBlockAsIns(notionBlocks[op.bi].html))
    i += 1
  }

  const proposed = parts.join('')
  return htmlHasNotionSync(proposed) ? proposed : markBlockAsIns(notion)
}

/**
 * Accept Notion: drop deletion proposals, unwrap insert highlights.
 */
export function acceptNotionSyncHtml(html: string): string {
  let next = html || ''
  // Notion deleted these — remove struck local text
  next = next.replace(
    /<span[^>]*data-notion-sync-kind=["']del["'][^>]*>[\s\S]*?<\/span>/gi,
    ''
  )
  return unwrapNotionSync(next)
}

/** Remove Notion sync wrapper spans while keeping inner HTML (heal / Keep mine path). */
export function unwrapNotionSync(html: string): string {
  let prev = ''
  let next = html || ''
  while (prev !== next) {
    prev = next
    next = next.replace(
      /<span[^>]*data-notion-sync=["']true["'][^>]*>([\s\S]*?)<\/span>/gi,
      '$1'
    )
  }
  return next
}

/**
 * Strip leftover review marks for heal / Keep mine baseline.
 * Keeps visible text (including former deletions).
 */
export function sanitizeNotionSyncHtml(html: string): string {
  return unwrapNotionSync(html || '')
}

/** @deprecated Prefer buildNotionSyncProposedHtml. */
export function markHtmlWithNotionSync(html: string): string {
  if (!html?.trim()) return html
  if (htmlHasNotionSync(html)) return html
  return markBlockAsIns(html)
}
