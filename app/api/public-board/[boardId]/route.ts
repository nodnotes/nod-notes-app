import { NextResponse } from 'next/server'
import { fetchPublicBoard } from '@/lib/public-board-fetch'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params
    const payload = await fetchPublicBoard(boardId)

    if (!payload) {
      return NextResponse.json({ error: 'Board not found or not public' }, { status: 404 })
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error in public-board API:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
