// Public showcase boards for the marketing homepage — ids from env, copy in code.

export type ShowcaseBoardSlot = {
  slug: string
  title: string
  description: string
  envKey: string
}

export const SHOWCASE_BOARD_SLOTS: ShowcaseBoardSlot[] = [
  {
    slug: 'brainstorm',
    envKey: 'NEXT_PUBLIC_SHOWCASE_BRAINSTORM_BOARD_ID',
    title: 'Notes and presentations',
    description:
      'Capture ideas as frames on a board, then rearrange them into a clear presentation without leaving the same space.',
  },
  {
    slug: 'workflow',
    envKey: 'NEXT_PUBLIC_SHOWCASE_WORKFLOW_BOARD_ID',
    title: 'Brainstorm with AI',
    description:
      'Start a conversation and watch ideas branch into a visual map. Each thought becomes a frame, and relationships appear as you go.',
  },
  {
    slug: 'research',
    envKey: 'NEXT_PUBLIC_SHOWCASE_RESEARCH_BOARD_ID',
    title: 'Connections and frame automations',
    description:
      'Link frames with threads, then let automations keep related work in sync as your board grows.',
  },
]

function readEnvId(key: string): string {
  const value = process.env[key]
  const bare = key.replace(/^NEXT_PUBLIC_/, '')
  const raw = value || process.env[bare] || ''
  // Trim whitespace and literal "\n" / "\r" pastes from Vercel/env editors
  return raw.trim().replace(/(?:\\r|\\n|\r|\n)+$/g, '').trim()
}

/** All board ids that may be fetched without auth (homepage + showcase slots). */
export function getPublicBoardIds(): string[] {
  const ids = new Set<string>()
  const homepageId = readEnvId('NEXT_PUBLIC_HOMEPAGE_BOARD_ID')
  if (homepageId) ids.add(homepageId)
  for (const slot of SHOWCASE_BOARD_SLOTS) {
    const id = readEnvId(slot.envKey)
    if (id) ids.add(id)
  }
  return Array.from(ids)
}

export function isPublicBoardId(boardId: string): boolean {
  return getPublicBoardIds().includes(boardId)
}

export type ResolvedShowcaseBoard = ShowcaseBoardSlot & { id: string }

/** Showcase boards with configured ids — homepage id fills empty slots so all layouts can show. */
export function getResolvedShowcaseBoards(): ResolvedShowcaseBoard[] {
  const homepageId = readEnvId('NEXT_PUBLIC_HOMEPAGE_BOARD_ID')
  const resolved: ResolvedShowcaseBoard[] = []

  for (const slot of SHOWCASE_BOARD_SLOTS) {
    const id = readEnvId(slot.envKey) || homepageId
    if (id) resolved.push({ ...slot, id })
  }

  if (resolved.length === 0 && homepageId) {
    resolved.push({
      slug: 'featured',
      envKey: 'NEXT_PUBLIC_HOMEPAGE_BOARD_ID',
      title: 'See Nod Notes in action',
      description:
        'Explore a live board — AI chat, frames, and threads working together on one infinite canvas.',
      id: homepageId,
    })
  }

  return resolved
}
