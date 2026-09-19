import { Mark, mergeAttributes } from '@tiptap/core' // TipTap mark base + HTML attrs helper

/**
 * Inline "in a set" mark. Renders a span the selected-frame glow CSS can target.
 * The span is always in the document; the halo only paints while the host frame is selected.
 */
export const SetMember = Mark.create({
  name: 'setMember', // Schema name for setSetMember()

  inclusive: false, // Typing at the edges does not keep extending the glow

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
        () =>
        ({ commands }) =>
          commands.setMark(this.name), // Paint the current selection
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    setMember: {
      setSetMember: () => ReturnType // Apply the in-set mark
    }
  }
}
