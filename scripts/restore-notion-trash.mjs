// Restore trashed Notion pages/DBs. Token is never printed.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
for (const rel of ['.env.local', 'apps/web/.env.local', '.env']) {
  const p = resolve(ROOT, rel)
  if (!existsSync(p)) continue
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m || process.env[m[1]]) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const NOTION_VERSION = '2025-09-03'
const PAGE_IDS = [
  '3ad05da7-d805-80cc-ba21-c234d2246393', // Tasks toggle that held the folders
  '3ae05da7-d805-8028-bdc3-f3afbf701005', // All tasks - folder
  '3b405da7-d805-8028-b80d-ff7d8680d73f', // Shortlist tasks - folder
  '3ae05da7-d805-802e-9b5a-f5a527cd2099', // Sort tasks - folder
  '3ae05da7-d805-80c9-aa16-dcd72e1f5cca', // Main tasks - folder
  '3ae05da7-d805-8030-b189-f7cb8900bb56', // Work tasks - folder
  '3ae05da7-d805-8043-a42a-ded56f30f870', // Scotty tasks - folder
  '3ae05da7-d805-80f8-84d7-eee0a536f21e', // Bored tasks - folder
  '3ae05da7-d805-8061-a952-eff198c4507d', // To-get tasks - folder
  '3a505da7-d805-8055-aea1-ebf049defc38', // Sort tasks - list
  '3ab05da7-d805-801d-bcc5-ecc3261a82a9', // Work tasks - list
  '3a505da7-d805-805c-97fb-d557499163c5', // Main tasks - list
  '1c48aa0a-81e3-43ee-b812-8a9cf1f350ac', // To-get tasks - list
  '3b405da7-d805-8056-9654-d549eca83f70', // Quick tasks - list (shortlist folder)
  '3a505da7-d805-808c-b948-ebaa2d29b0d0', // Scotty tasks - list
  '3ae05da7-d805-8079-850f-f79a3b7966b0', // Everything shower
  '3a705da7-d805-80fd-b41a-f91ef1dd8a81', // personal Shopping
]

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing Supabase admin env')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})
const { data: rows, error } = await admin.from('notion_connections').select('access_token')
if (error || !rows?.length) {
  console.error('No Notion connection')
  process.exit(1)
}

const token = rows[0].access_token
const headers = {
  Authorization: `Bearer ${token}`,
  'Notion-Version': NOTION_VERSION,
  'Content-Type': 'application/json',
}
const body = JSON.stringify({ in_trash: false })
const paths = (id) => [
  `https://api.notion.com/v1/pages/${id}`,
  `https://api.notion.com/v1/blocks/${id}`,
  `https://api.notion.com/v1/databases/${id}`,
]

let ok = 0
let fail = 0
for (const id of PAGE_IDS) {
  let restored = false
  let last = ''
  for (const url of paths(id)) {
    const res = await fetch(url, { method: 'PATCH', headers, body })
    if (res.ok) {
      restored = true
      console.log('restored', id, url.split('/v1/')[1].split('/')[0])
      break
    }
    const payload = await res.json().catch(() => ({}))
    last = `${payload?.code || res.status} ${payload?.message || ''}`
  }
  if (restored) ok += 1
  else {
    fail += 1
    console.log('failed', id, last)
  }
}
console.log(`done restored=${ok} failed=${fail}`)

const TRASH_IDS = [
  '3dd05da7-d805-8088-b908-e55205479b58', // Empty "New database" stub left on Tasks after the wipe
]
for (const id of TRASH_IDS) {
  const trashBody = JSON.stringify({ in_trash: true })
  let done = false
  let last = ''
  for (const url of paths(id)) {
    const res = await fetch(url, { method: 'PATCH', headers, body: trashBody })
    if (res.ok) {
      done = true
      console.log('trashed stub', id)
      break
    }
    const payload = await res.json().catch(() => ({}))
    last = `${payload?.code || res.status} ${payload?.message || ''}`
  }
  if (!done) console.log('trash-failed', id, last)
}
