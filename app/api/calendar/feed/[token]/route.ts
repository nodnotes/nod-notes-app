// Public iCal document. Apple Calendar and Google Calendar fetch this with the secret in the path.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  CALENDAR_APPLE_TOKEN_KEY,
  CALENDAR_GOOGLE_TOKEN_KEY,
  emptyCalendarIcs,
} from '@/lib/calendar-connections'

type Params = { params: Promise<{ token: string }> }

/** True when this token is still stored on a profile (disconnect clears it). */
async function feedIsLive(token: string): Promise<boolean> {
  if (!/^[a-f0-9]{32,64}$/i.test(token)) return false // Reject anything that is not a minted secret
  const admin = createAdminClient()
  for (const key of [CALENDAR_APPLE_TOKEN_KEY, CALENDAR_GOOGLE_TOKEN_KEY]) {
    const { data, error } = await admin
      .from('profiles')
      .select('id')
      .eq(`metadata->>${key}`, token)
      .limit(1)
    if (error) throw error
    if (data?.length) return true
  }
  return false
}

export async function GET(_request: Request, { params }: Params) {
  const { token } = await params
  try {
    const live = await feedIsLive(token)
    if (!live) return new NextResponse('Not found', { status: 404 })
  } catch (error) {
    console.error('Calendar feed lookup failed:', error)
    return new NextResponse('Feed unavailable', { status: 500 })
  }

  return new NextResponse(emptyCalendarIcs('NodNotes'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache', // Disconnect should stop showing the calendar on the next fetch
    },
  })
}
