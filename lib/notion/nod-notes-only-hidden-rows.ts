// Rows removed from NodNotes only (still live in Notion) — hide until user clears storage.

const STORAGE_KEY = 'nodnotes-notion-hidden-rows'

function norm(id: string): string {
  return id.replace(/-/g, '').toLowerCase()
}

function readMap(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string[]>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, string[]>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // Quota / private mode — ignore
  }
}

/** Page ids hidden for this database in NodNotes (not archived in Notion). */
export function readNodNotesHiddenRowIds(databaseId: string): Set<string> {
  const map = readMap()
  const list = map[norm(databaseId)] || []
  return new Set(list.map(norm))
}

/** Hide a row in NodNotes only — it may reappear if storage is cleared or on another device. */
export function hideRowNodNotesOnly(databaseId: string, pageId: string): void {
  const key = norm(databaseId)
  const id = norm(pageId)
  const map = readMap()
  const prev = new Set((map[key] || []).map(norm))
  prev.add(id)
  map[key] = [...prev]
  writeMap(map)
}

/** Clear hidden rows for one database (e.g. after restoring from Notion). */
export function clearNodNotesHiddenRows(databaseId: string): void {
  const map = readMap()
  delete map[norm(databaseId)]
  writeMap(map)
}
