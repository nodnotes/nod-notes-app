// TipTap mark for Notion→NodNotes sync review (grey sheer until save/discard)
import { Mark, mergeAttributes } from '@tiptap/core'

/** Proposed Notion sync — grey sheer mask until save/discard. */
export const NotionSyncPending = Mark.create({
  name: 'notionSyncPending',
  inclusive: false,
  excludes: '',
  parseHTML() {
    return [{ tag: 'span[data-notion-sync="true"]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-notion-sync': 'true',
        class: 'tt-notion-sync',
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
