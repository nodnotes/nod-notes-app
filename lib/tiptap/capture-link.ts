// captureLink — inline chip linking to a saved board capture (paste URL → name; click → view).

import { mergeAttributes, Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CaptureLinkView } from '@/components/capture-link-view'

export const CaptureLink = Node.create({
  name: 'captureLink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      captureId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-capture-id'),
        renderHTML: (attrs) => (attrs.captureId ? { 'data-capture-id': attrs.captureId } : {}),
      },
      boardId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-board-id'),
        renderHTML: (attrs) => (attrs.boardId ? { 'data-board-id': attrs.boardId } : {}),
      },
      title: {
        default: 'Capture',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-title') || 'Capture',
        renderHTML: (attrs) => ({ 'data-title': attrs.title || 'Capture' }),
      },
      viewportX: {
        default: 0,
        parseHTML: (el) => Number((el as HTMLElement).getAttribute('data-x') || 0),
        renderHTML: (attrs) => ({ 'data-x': String(attrs.viewportX ?? 0) }),
      },
      viewportY: {
        default: 0,
        parseHTML: (el) => Number((el as HTMLElement).getAttribute('data-y') || 0),
        renderHTML: (attrs) => ({ 'data-y': String(attrs.viewportY ?? 0) }),
      },
      viewportZoom: {
        default: 1,
        parseHTML: (el) => Number((el as HTMLElement).getAttribute('data-z') || 1),
        renderHTML: (attrs) => ({ 'data-z': String(attrs.viewportZoom ?? 1) }),
      },
      rotation: {
        default: 0,
        parseHTML: (el) => Number((el as HTMLElement).getAttribute('data-rot') || 0),
        renderHTML: (attrs) =>
          Math.abs(Number(attrs.rotation || 0)) > 0.05 ? { 'data-rot': String(attrs.rotation) } : {},
      },
      scrollMode: {
        default: 'scroll',
        parseHTML: (el) => (el as HTMLElement).getAttribute('data-nav') || 'scroll',
        renderHTML: (attrs) =>
          attrs.scrollMode === 'zoom' ? { 'data-nav': 'zoom' } : { 'data-nav': 'scroll' },
      },
    }
  },

  parseHTML() {
    return [
      { tag: 'span[data-type="captureLink"]' },
      { tag: 'div[data-type="captureLink"]' }, // Legacy block-shaped saves
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'captureLink', class: 'tt-capture-link' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CaptureLinkView)
  },
})
