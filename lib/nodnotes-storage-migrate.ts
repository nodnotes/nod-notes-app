/** One-time copy of legacy `thinktable-*` localStorage keys → `nodnotes-*`. */
export function migrateNodNotesStorageKeys(): void {
  if (typeof window === 'undefined') return
  try {
    if (localStorage.getItem('nodnotes-storage-migrated') === '1') return

    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('thinktable-')) continue
      const newKey = key.replace(/^thinktable-/, 'nodnotes-')
      if (localStorage.getItem(newKey) == null) {
        const value = localStorage.getItem(key)
        if (value != null) localStorage.setItem(newKey, value)
      }
    }

    const draftsKey = 'nodnotes-ai-agent-drafts'
    const oldDrafts = localStorage.getItem('thinktable-ai-agent-drafts')
    if (oldDrafts && !localStorage.getItem(draftsKey)) {
      const migrated = oldDrafts
        .replace(/workspace-thinktable-agent/g, 'workspace-nodnotes-agent')
        .replace(/thinktable-copilot/g, 'nodnotes-copilot')
        .replace(/Thinktable Copilot/g, 'Nod Notes Copilot')
        .replace(/ThinkTable agent/g, 'Nod Notes agent')
      localStorage.setItem(draftsKey, migrated)
    }

    localStorage.setItem('nodnotes-storage-migrated', '1')
  } catch {
    // Quota / private mode — skip
  }
}
