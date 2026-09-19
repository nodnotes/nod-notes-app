// Board body font — Default / Serif / Mono (More menu + conversations.metadata)

export const BOARD_FONT_IDS = ['default', 'serif', 'mono'] as const
export type BoardFontId = (typeof BOARD_FONT_IDS)[number]

export function parseBoardFontId(value: unknown): BoardFontId | null {
  return typeof value === 'string' && (BOARD_FONT_IDS as readonly string[]).includes(value)
    ? (value as BoardFontId)
    : null
}

/** localStorage key for one board's More-menu prefs (font lives in this blob). */
export function boardPrefsStorageKey(conversationId?: string) {
  return conversationId ? `nodnotes-prefs-${conversationId}` : 'nodnotes-prefs-default' // /board has no id
}

/** Font already saved for this board. Missing/invalid → Default. SSR → Default (no window). */
export function readStoredBoardFont(conversationId?: string): BoardFontId {
  if (typeof window === 'undefined') return 'default' // Server render has no localStorage
  try {
    const raw = JSON.parse(localStorage.getItem(boardPrefsStorageKey(conversationId)) || '{}').boardFont // Saved More-menu font
    return parseBoardFontId(raw) ?? 'default' // Unknown value is Default
  } catch {
    return 'default' // Corrupt JSON — don't throw into the board
  }
}

/** Paint font before React state catches up. CSS keys off this, not the late `data-board-font`. */
export function publishBoardFont(font: BoardFontId) {
  if (typeof document === 'undefined') return // SSR
  document.documentElement.setAttribute('data-nn-board-font', font) // html attr wins over the SSR default
}
