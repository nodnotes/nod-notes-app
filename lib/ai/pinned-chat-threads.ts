// Pinned AI chats — local order hint for the thread picker (not persisted server-side yet)

const PINNED_KEY = 'thinktable-pinned-ai-threads'

export function getPinnedChatThreadIds(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((id): id is string => typeof id === 'string'))
  } catch {
    return new Set()
  }
}

export function togglePinnedChatThread(threadId: string): Set<string> {
  const next = getPinnedChatThreadIds()
  if (next.has(threadId)) next.delete(threadId)
  else next.add(threadId)
  localStorage.setItem(PINNED_KEY, JSON.stringify([...next]))
  return next
}

export function sortThreadsWithPins<T extends { id: string }>(threads: T[]): T[] {
  const pinned = getPinnedChatThreadIds()
  if (pinned.size === 0) return threads
  const pinnedRows: T[] = []
  const rest: T[] = []
  for (const t of threads) {
    if (pinned.has(t.id)) pinnedRows.push(t)
    else rest.push(t)
  }
  return [...pinnedRows, ...rest]
}
