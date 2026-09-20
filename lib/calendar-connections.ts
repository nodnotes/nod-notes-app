// Account-menu calendar destinations stored on profiles.metadata (owner-only).
// Apple and Google get a secret iCal URL. Notion gets a database id the user adds to Notion Calendar.

export const CALENDAR_APPLE_TOKEN_KEY = 'calendar_apple_token' // Secret segment of the Apple subscription URL
export const CALENDAR_GOOGLE_TOKEN_KEY = 'calendar_google_token' // Secret segment of the Google subscription URL
export const CALENDAR_NOTION_DB_KEY = 'calendar_notion_db' // Created Notion database that holds NodNotes dates

export type CalendarFeedProvider = 'apple' | 'google'

export type NotionCalendarDatabase = {
  id: string // Notion database id
  url: string | null // Open-in-Notion link
  title: string // Database title shown in Connections
  workspaceId: string | null // Workspace the database was created in
}

/** profiles.metadata object, or empty when the column is null. */
export function readProfileMetadata(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
}

/** Which metadata key holds this feed's secret. */
export function feedTokenKey(provider: CalendarFeedProvider): string {
  return provider === 'apple' ? CALENDAR_APPLE_TOKEN_KEY : CALENDAR_GOOGLE_TOKEN_KEY
}

/** Parse a stored Notion dates database, or null when it was never created. */
export function readNotionCalendarDatabase(meta: Record<string, unknown>): NotionCalendarDatabase | null {
  const raw = meta[CALENDAR_NOTION_DB_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  if (typeof row.id !== 'string' || !row.id) return null
  return {
    id: row.id,
    url: typeof row.url === 'string' ? row.url : null,
    title: typeof row.title === 'string' && row.title ? row.title : 'NodNotes dates',
    workspaceId: typeof row.workspaceId === 'string' ? row.workspaceId : null,
  }
}

/** Public iCal URL calendar apps fetch with no NodNotes session. */
export function calendarFeedUrl(siteUrl: string, token: string): string {
  return `${siteUrl.replace(/\/$/, '')}/api/calendar/feed/${token}`
}

/** Empty calendar. Dated events are added when NodNotes dates are written to the feed. */
export function emptyCalendarIcs(name: string): string {
  const safe = name.replace(/[\r\n]/g, ' ')
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NodNotes//Dates//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${safe}`,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
