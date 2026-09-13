/**
 * Hocuspocus WebSocket server for multiplayer boards.
 * Auth: Supabase JWT. Authorize: user_board_access_role (view+ join; edit+ write).
 *
 * Run: npm run collab
 * Env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_*), HOCUSPOCUS_PORT
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { Server } from '@hocuspocus/server'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

/** Load KEY=value lines from .env.local / .env into process.env (no overwrite). */
function loadEnvFile(name) {
  const path = resolve(root, name)
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvFile('.env.local')
loadEnvFile('.env')

const PORT = Number(process.env.HOCUSPOCUS_PORT || 1234)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('[collab] Missing NEXT_PUBLIC_SUPABASE_URL or anon key')
  process.exit(1)
}

const ROLE_RANK = { view: 1, comment: 2, edit: 3, owner: 4 }

/** Parse board:{uuid} room names. */
function boardIdFromDocumentName(documentName) {
  const m = /^board:([0-9a-f-]{36})$/i.exec(documentName || '')
  return m ? m[1] : null
}

/** User-scoped client carrying the caller's JWT (RLS + auth.uid() RPCs). */
function userClient(token) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

const server = new Server({
  port: PORT,
  quiet: false,

  async onAuthenticate({ token, documentName, connectionConfig }) {
    if (!token || typeof token !== 'string') {
      throw new Error('Unauthorized')
    }
    const boardId = boardIdFromDocumentName(documentName)
    if (!boardId) {
      throw new Error('Invalid document')
    }

    const supabase = userClient(token)
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token)
    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    const { data: role, error: roleError } = await supabase.rpc('user_board_access_role', {
      p_board_id: boardId,
    })
    if (roleError || !role || !ROLE_RANK[role]) {
      throw new Error('Forbidden')
    }

    const canEdit = ROLE_RANK[role] >= 3
    // Must mutate connectionConfig — returning readOnly only puts it on context
    connectionConfig.readOnly = !canEdit

    // Return value is merged into connection context (available after auth)
    return {
      user: {
        id: user.id,
        email: user.email ?? null,
        role,
      },
    }
  },

  async connected({ documentName, context, connectionConfig }) {
    const who = context?.user?.email || context?.user?.id || 'anon'
    console.log(
      `[collab] connected ${documentName} as ${who} (role=${context?.user?.role}, readOnly=${connectionConfig?.readOnly})`
    )
  },

  async onDisconnect({ documentName }) {
    console.log(`[collab] disconnect ${documentName}`)
  },
})

server.listen().then(() => {
  console.log(`[collab] Hocuspocus listening on ws://127.0.0.1:${PORT}`)
  console.log(`[collab] Set NEXT_PUBLIC_HOCUSPOCUS_URL=ws://127.0.0.1:${PORT}`)
})
