// POST — claim a private copy of a homepage showcase master for the signed-in user.
import { NextRequest, NextResponse } from 'next/server'
import { claimShowcaseBoard } from '@/lib/claim-showcase-board'
import { isPublicBoardId } from '@/lib/public-showcase-boards'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => null)) as {
      masterBoardId?: string
    } | null
    const masterBoardId = body?.masterBoardId?.trim() || ''
    if (!masterBoardId || !isPublicBoardId(masterBoardId)) {
      return NextResponse.json({ error: 'Invalid showcase board' }, { status: 400 })
    }

    const result = await claimShowcaseBoard(supabase, user.id, masterBoardId)
    return NextResponse.json(result, { status: result.created ? 201 : 200 })
  } catch (error) {
    console.error('showcase-board claim failed:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
