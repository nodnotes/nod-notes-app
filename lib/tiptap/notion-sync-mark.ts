// TipTap mark for Notion→NodNotes sync review (grey sheer / strikethrough until save/discard)
import { Mark, mergeAttributes, type Editor } from '@tiptap/core'

/** Proposed Notion sync — grey sheer (ins) or strikethrough (del) until save/discard. */
export const NotionSyncPending = Mark.create({
  name: 'notionSyncPending',
  inclusive: false,
  excludes: '',
  addAttributes() {
    return {
      // Local text before Notion’s change — Keep non red restores this for inserts
      prev: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-notion-prev'),
        renderHTML: (attrs) =>
          attrs.prev != null && attrs.prev !== ''
            ? { 'data-notion-prev': attrs.prev }
            : {},
      },
      // Click-selected for Keep non red (light red)
      selected: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-notion-sync-selected') === 'true',
        renderHTML: (attrs) =>
          attrs.selected ? { 'data-notion-sync-selected': 'true' } : {},
      },
      // ins = Notion addition (highlight); del = local text Notion removed (strike)
      kind: {
        default: 'ins',
        parseHTML: (el) => el.getAttribute('data-notion-sync-kind') || 'ins',
        renderHTML: (attrs) => ({
          'data-notion-sync-kind': attrs.kind === 'del' ? 'del' : 'ins',
        }),
      },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-notion-sync="true"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    const kind = HTMLAttributes['data-notion-sync-kind'] === 'del' ? 'del' : 'ins'
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-notion-sync': 'true',
        'data-notion-sync-kind': kind,
        class: kind === 'del' ? 'tt-notion-sync tt-notion-sync-del' : 'tt-notion-sync',
      }),
      0,
    ]
  },
  addCommands() {
    return {
      setNotionSyncPending:
        () =>
        ({ commands }) =>
          commands.setMark(this.name),
      unsetNotionSyncPending:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    notionSyncPending: {
      setNotionSyncPending: () => ReturnType
      unsetNotionSyncPending: () => ReturnType
    }
  }
}

/** Toggle `selected` on the notionSyncPending mark covering `spanEl`. */
export function toggleNotionSyncMarkSelected(editor: Editor, spanEl: Element): boolean {
  const markType = editor.schema.marks.notionSyncPending
  if (!markType || editor.isDestroyed || !editor.view) return false
  let from = -1
  let to = -1
  let currentSelected = false
  let currentPrev: string | null = null
  let currentKind: string = 'ins'
  try {
    const start = editor.view.posAtDOM(spanEl, 0)
    const end = editor.view.posAtDOM(spanEl, spanEl.childNodes.length)
    editor.state.doc.nodesBetween(start, end, (node, pos) => {
      if (!node.isText) return
      const mark = markType.isInSet(node.marks)
      if (!mark) return
      if (from < 0) from = pos
      to = pos + node.nodeSize
      currentSelected = mark.attrs.selected === true
      currentPrev =
        typeof mark.attrs.prev === 'string' ? mark.attrs.prev : currentPrev
      currentKind = mark.attrs.kind === 'del' ? 'del' : 'ins'
    })
  } catch {
    return false
  }
  if (from < 0 || to < 0 || from >= to) return false
  const nextSelected = !currentSelected
  editor
    .chain()
    .command(({ tr, dispatch }) => {
      if (!dispatch) return true
      tr.removeMark(from, to, markType)
      tr.addMark(
        from,
        to,
        markType.create({
          prev: currentPrev,
          selected: nextSelected,
          kind: currentKind,
        })
      )
      dispatch(tr)
      return true
    })
    .run()
  return nextSelected
}

type SyncRange = {
  from: number
  to: number
  prev: string | null
  kind: 'ins' | 'del'
}

/**
 * Reject selected notion-sync marks:
 * - del → keep local text (remove strike only)
 * - ins with prev → restore prev (and drop adjacent preceding del of that prev)
 * - ins without prev → delete Notion insertion
 * Never wipe text that has a known old version.
 */
export function rejectSelectedNotionSyncMarks(editor: Editor): number {
  const markType = editor.schema.marks.notionSyncPending
  if (!markType || editor.isDestroyed) return 0
  const ranges: SyncRange[] = []
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) return
    const mark = markType.isInSet(node.marks)
    if (!mark || mark.attrs.selected !== true) return
    const prev = typeof mark.attrs.prev === 'string' ? mark.attrs.prev : null
    const kind: 'ins' | 'del' = mark.attrs.kind === 'del' ? 'del' : 'ins'
    const last = ranges[ranges.length - 1]
    if (last && last.to === pos && last.prev === prev && last.kind === kind) {
      last.to = pos + node.nodeSize
    } else {
      ranges.push({ from: pos, to: pos + node.nodeSize, prev, kind })
    }
  })
  if (ranges.length === 0) return 0

  // Coalesce selected del+ins replacement pairs → single restore of prev
  const coalesced: SyncRange[] = []
  for (const r of ranges) {
    const last = coalesced[coalesced.length - 1]
    if (
      last &&
      last.kind === 'del' &&
      r.kind === 'ins' &&
      last.to === r.from &&
      r.prev != null &&
      r.prev !== '' &&
      editor.state.doc.textBetween(last.from, last.to) === r.prev
    ) {
      last.to = r.to
      last.prev = r.prev
      last.kind = 'ins'
      continue
    }
    coalesced.push({ ...r })
  }

  let tr = editor.state.tr
  for (let i = coalesced.length - 1; i >= 0; i--) {
    const { from, to, prev, kind } = coalesced[i]
    if (kind === 'del') {
      // Keep old local text; drop paired following ins (same prev) so old isn't duplicated
      const delText = tr.doc.textBetween(from, to)
      let insTo = to
      tr.doc.nodesBetween(to, Math.min(tr.doc.content.size, to + delText.length + 64), (node, pos) => {
        if (!node.isText || pos < to) return
        const mark = markType.isInSet(node.marks)
        if (!mark || mark.attrs.kind === 'del') return false
        const p = typeof mark.attrs.prev === 'string' ? mark.attrs.prev : null
        if (p !== delText) return false
        if (pos === insTo || pos === to) insTo = pos + node.nodeSize
        return
      })
      if (insTo > to) {
        tr = tr.removeMark(from, insTo, markType)
        tr = tr.insertText(delText, from, insTo) // Old only
      } else {
        tr = tr.removeMark(from, to, markType)
      }
      continue
    }
    if (prev != null && prev !== '') {
      // Drop adjacent preceding del of the same prev so we don't leave a duplicate
      let delFrom = from
      tr.doc.nodesBetween(Math.max(0, from - prev.length - 8), from, (node, pos) => {
        if (!node.isText) return
        const mark = markType.isInSet(node.marks)
        if (!mark || mark.attrs.kind !== 'del') return
        if (pos + node.nodeSize > from) return
        if (delFrom === from || pos + node.nodeSize === delFrom) delFrom = pos
      })
      const replaceFrom =
        delFrom < from && tr.doc.textBetween(delFrom, from) === prev ? delFrom : from
      tr = tr.removeMark(replaceFrom, to, markType)
      tr = tr.insertText(prev, replaceFrom, to)
    } else {
      // Pure Notion insertion with no local prior — remove it
      tr = tr.delete(from, to)
    }
  }
  editor.view.dispatch(tr)
  return coalesced.length
}
