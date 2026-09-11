import {
  ClipboardList,
  LayoutGrid,
  Square,
  GitBranch,
  Share2,
  Sparkles,
  Layers,
  CreditCard,
  Wrench,
  BookOpen,
  type LucideIcon,
} from 'lucide-react'
import type { DocsIconId } from '@/lib/docs/content'

/** Notion-style line icons for docs cards + sidebar */
const ICONS: Record<DocsIconId, LucideIcon> = {
  clipboard: ClipboardList,
  board: LayoutGrid,
  frame: Square,
  thread: GitBranch,
  share: Share2,
  notion: BookOpen,
  sparkles: Sparkles,
  cards: Layers,
  billing: CreditCard,
  wrench: Wrench,
}

export function DocsTopicIcon({
  id,
  className,
}: {
  id: DocsIconId
  className?: string
}) {
  const Icon = ICONS[id]
  return <Icon className={className} aria-hidden strokeWidth={1.5} />
}
