// Persist a Smart Draw result (straightened ink or a shape) into canvas_nodes.
import type { QueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import {
  isCanvasNodeErased,
  putCanvasNodeInQueryCache,
  removeFailedSave,
} from '@/components/freehand/erase-persist'

type SaveRow = {
  id: string
  nodeType: 'freehand' | 'shape'
  x: number
  y: number
  width: number
  height: number
  data: unknown
}

/** Remember a failed insert in the same list Freehand retries on reconnect. */
function storeFailed(conversationId: string, row: SaveRow) {
  try {
    const key = `nodnotes-failed-canvas-saves-${conversationId}`
    const failed = JSON.parse(localStorage.getItem(key) || '[]') as unknown[]
    failed.push({
      node: {
        id: row.id,
        type: row.nodeType, // retryFailedSaves reads this so shapes don’t come back as ink
        position: { x: row.x, y: row.y },
        width: row.width,
        height: row.height,
        data: row.data,
      },
      conversationId,
      timestamp: Date.now(),
    })
    localStorage.setItem(key, JSON.stringify(failed.slice(-50)))
  } catch {
    // Private mode / full storage — the live node is still on the board
  }
}

/** Insert one canvas node. No-op without a board id (empty /board stays local). */
export async function saveSmartCanvasNode(
  conversationId: string | undefined,
  row: SaveRow,
  queryClient?: QueryClient,
): Promise<void> {
  if (!conversationId) return
  if (isCanvasNodeErased(row.id)) return
  if (queryClient) {
    putCanvasNodeInQueryCache(queryClient, conversationId, {
      id: row.id,
      node_type: row.nodeType,
      position_x: row.x,
      position_y: row.y,
      width: row.width,
      height: row.height,
      data: row.data,
    })
  }
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      storeFailed(conversationId, row)
      return
    }
    if (isCanvasNodeErased(row.id)) return
    const { error } = await supabase.from('canvas_nodes').insert({
      id: row.id,
      conversation_id: conversationId,
      user_id: user.id,
      node_type: row.nodeType,
      position_x: row.x,
      position_y: row.y,
      width: row.width,
      height: row.height,
      data: row.data,
    })
    if (error) {
      console.error('Smart draw: failed to save canvas node', error)
      storeFailed(conversationId, row)
      return
    }
    removeFailedSave(row.id)
  } catch (err) {
    console.error('Smart draw: save threw', err)
    storeFailed(conversationId, row)
  }
}

/** `#rrggbbaa` → `#rrggbb` so shape fill/stroke stay opaque. */
export function opaqueInkHex(hex: string | undefined): string {
  const t = (hex || '').trim()
  if (/^#[0-9a-fA-F]{8}$/.test(t)) return t.slice(0, 7)
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t
  return '#111827'
}
