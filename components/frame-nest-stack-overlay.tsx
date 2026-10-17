'use client'

// Edge-align preview used to paint a stack diamond in the gap.
// Stack is thread-menu only now — magnetize keeps the park, not the icon.

import type { FrameNestStackUi } from '@/components/use-frame-nest-stack-drag'

/** No-op: align magnet has no stack chrome. Kept so board-flow mount stays stable. */
export function FrameNestStackOverlay(_props: { ui: FrameNestStackUi | null }) {
  return null
}
