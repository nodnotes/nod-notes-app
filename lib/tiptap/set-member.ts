import { Mark, mergeAttributes } from '@tiptap/core' // TipTap mark base + HTML attrs helper

/**
 * Inline "in a set" mark. Renders a span the glow CSS can target.
 * The span stays in the document. The halo paints while the host frame is selected,
 * or while that set is selected in the utility list (`data-set-ids`).
 */
export const SetMember = Mark.create({
  name: 'setMember', // Schema name for setSetMember()

  inclusive: false, // Typing at the edges does not keep extending the glow

  addAttributes() {
    return {
      setIds: {
        default: null, // Space-separated set ids; null on marks saved before sets were selectable
        parseHTML: (element) => element.getAttribute('data-set-ids'), // Restore which sets own this run
        renderHTML: (attributes) =>
          attributes.setIds ? { 'data-set-ids': attributes.setIds } : {}, // Omit when unknown
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-in-set]' }] // Restore from saved HTML
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-in-set': '', // Glow target — empty value, not the "frame" stamp
        class: 'tt-in-set', // Hook for the halo rule
      }),
      0, // Mark content hole
    ]
  },

  addCommands() {
    return {
      setSetMember:
        (setId: string) =>
        ({ tr, state, dispatch }) => {
          const { from, to, empty } = tr.selection // Chain may have just moved the selection
          if (!setId || empty || to <= from) return false // Need a real range and a set
          const type = state.schema.marks.setMember
          if (!type) return false // Extension not registered
          const slices: { from: number; to: number; ids: string }[] = [] // Apply after the walk — don't mutate while iterating
          tr.doc.nodesBetween(from, to, (node, pos) => {
            if (!node.isText) return // Marks live on text
            const start = Math.max(from, pos) // Clip to the selection
            const end = Math.min(to, pos + node.nodeSize)
            if (end <= start) return
            const raw = type.isInSet(node.marks)?.attrs.setIds // Sets already on this slice
            const next = new Set<string>([setId])
            if (typeof raw === 'string') raw.split(/\s+/).forEach((id) => id && next.add(id))
            slices.push({ from: start, to: end, ids: [...next].join(' ') })
          })
          if (!slices.length) return false // Empty block — the block element stamp covers that case
          if (dispatch) {
            for (const slice of slices) {
              tr.removeMark(slice.from, slice.to, type) // Replace, don't stack two setMember marks
              tr.addMark(slice.from, slice.to, type.create({ setIds: slice.ids }))
            }
            dispatch(tr)
          }
          return true
        },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setMember: {
      setSetMember: (setId: string) => ReturnType // Apply the in-set mark for this set
    }
  }
}
