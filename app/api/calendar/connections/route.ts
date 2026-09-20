// Create, read, and revoke Apple / Google calendar subscription links for the signed-in user.

import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  CALENDAR_APPLE_TOKEN_KEY,
  CALENDAR_GOOGLE_TOKEN_KEY,
  calendarFeedUrl,
  feedTokenKey,
  readNotionCalendarDatabase,
  readProfileMetadata,
  type CalendarFeedProvider,
} from '@/lib/calendar-connections'
import { getSiteUrl } from '@/lib/notion/config'

function isProvider(value: unknown): value is CalendarFeedProvider {
  return value === 'apple' || value === 'google'
}

/** Subscription status for both calendars, plus the linked Notion dates database. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('profiles').select('metadata').eq('id', user.id).single()
  if (error) return NextResponse.json({ error: 'Failed to load connections' }, { status: 500 })

  const meta = readProfileMetadata(data?.metadata)
  const site = getSiteUrl()
  const apple = typeof meta[CALENDAR_APPLE_TOKEN_KEY] === 'string' ? (meta[CALENDAR_APPLE_TOKEN_KEY] as string) : null
  const google = typeof meta[CALENDAR_GOOGLE_TOKEN_KEY] === 'string' ? (meta[CALENDAR_GOOGLE_TOKEN_KEY] as string) : null

  return NextResponse.json({
    apple: { connected: Boolean(apple), url: apple ? calendarFeedUrl(site, apple) : null },
    google: { connected: Boolean(google), url: google ? calendarFeedUrl(site, google) : null },
    notionDb: readNotionCalendarDatabase(meta),
  })
}

/** Mint a secret feed URL for Apple Calendar or Google Calendar. */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { provider?: unknown } | null
  if (!isProvider(body?.provider)) {
    return NextResponse.json({ error: 'Choose Apple Calendar or Google Calendar' }, { status: 400 })
  }

  const { data, error } = await supabase.from('profiles').select('metadata').eq('id', user.id).single()
  if (error) return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })

  const meta = readProfileMetadata(data?.metadata)
  const key = feedTokenKey(body.provider)
  const existing = typeof meta[key] === 'string' ? (meta[key] as string) : null
  const token = existing ?? randomBytes(24).toString('hex') // Reuse so a second click does not break an added calendar
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ metadata: { ...meta, [key]: token } })
    .eq('id', user.id)
  if (updateError) return NextResponse.json({ error: 'Failed to save connection' }, { status: 500 })

  return NextResponse.json({
    connected: true,
    url: calendarFeedUrl(getSiteUrl(), token),
  })
}

/** Drop a feed secret so the old subscription URL stops resolving. */
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { provider?: unknown } | null
  if (!isProvider(body?.provider)) {
    return NextResponse.json({ error: 'Choose Apple Calendar or Google Calendar' }, { status: 400 })
  }

  const { data, error } = await supabase.from('profiles').select('metadata').eq('id', user.id).single()
  if (error) return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })

  const meta = readProfileMetadata(data?.metadata)
  const key = feedTokenKey(body.provider)
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ metadata: { ...meta, [key]: null } })
    .eq('id', user.id)
  if (updateError) return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })

  return NextResponse.json({ connected: false })
}
