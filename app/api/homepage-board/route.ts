import { NextResponse } from 'next/server'
import { fetchPublicBoard } from '@/lib/public-board-fetch'

// Legacy route — redirects to shared public-board fetch for the homepage board id.
export async function GET() {
  try {
    const homepageBoardId = process.env.NEXT_PUBLIC_HOMEPAGE_BOARD_ID || process.env.HOMEPAGE_BOARD_ID

    if (!homepageBoardId) {
      return NextResponse.json({ error: 'HOMEPAGE_BOARD_ID not configured' }, { status: 500 })
    }

    const payload = await fetchPublicBoard(homepageBoardId)
    if (!payload) {
      return NextResponse.json({ error: 'Homepage board not found' }, { status: 404 })
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error in homepage-board API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
