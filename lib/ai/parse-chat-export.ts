// Parse ChatGPT data-export conversations.json into Thinktable AI turns

export type ParsedChatTurn = {
  role: 'user' | 'assistant' // Only user/assistant are imported
  content: string // Plain text body
  createdAt: string | null // ISO when the export includes a timestamp
}

export type ParsedChatConversation = {
  title: string // Chat title from the export
  turns: ParsedChatTurn[] // Chronological transcript
}

type ChatGptMappingNode = {
  id?: string
  message?: {
    author?: { role?: string }
    content?: { parts?: unknown[]; content_type?: string }
    create_time?: number
  } | null
  parent?: string | null
  children?: string[]
}

type ChatGptConversation = {
  title?: string
  create_time?: number
  mapping?: Record<string, ChatGptMappingNode>
}

function textFromParts(parts: unknown[] | undefined): string {
  if (!parts?.length) return ''
  return parts
    .map((p) => (typeof p === 'string' ? p : ''))
    .join('')
    .trim()
}

function isoFromUnixSeconds(sec: number | undefined): string | null {
  if (typeof sec !== 'number' || !Number.isFinite(sec)) return null
  return new Date(sec * 1000).toISOString()
}

/** Walk one ChatGPT conversation mapping in branch order (root → children). */
function turnsFromMapping(mapping: Record<string, ChatGptMappingNode>): ParsedChatTurn[] {
  const nodes = Object.values(mapping).filter((n) => n?.id)
  if (!nodes.length) return []

  const byId = new Map<string, ChatGptMappingNode>()
  for (const n of nodes) {
    if (n.id) byId.set(n.id, n)
  }

  const roots = nodes.filter((n) => !n.parent || !byId.has(n.parent))
  const start = roots[0]?.id
  if (!start) return []

  const turns: ParsedChatTurn[] = []
  const seen = new Set<string>()
  const stack = [start]

  while (stack.length) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const node = byId.get(id)
    if (!node) continue

    const role = node.message?.author?.role
    const content = textFromParts(node.message?.content?.parts)
    if ((role === 'user' || role === 'assistant') && content) {
      turns.push({
        role,
        content,
        createdAt: isoFromUnixSeconds(node.message?.create_time),
      })
    }

    const children = node.children || []
    for (let i = children.length - 1; i >= 0; i--) {
      const childId = children[i]
      if (childId && byId.has(childId)) stack.push(childId)
    }
  }

  return turns
}

function parseConversation(raw: ChatGptConversation): ParsedChatConversation | null {
  const mapping = raw.mapping
  if (!mapping || typeof mapping !== 'object') return null
  const turns = turnsFromMapping(mapping)
  if (!turns.length) return null
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Imported chat'
  return { title, turns }
}

/** Accept ChatGPT `conversations.json` (array or single conversation object). */
export function parseChatExportJson(data: unknown): ParsedChatConversation[] {
  const list: ChatGptConversation[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? [data as ChatGptConversation]
      : []

  const out: ParsedChatConversation[] = []
  for (const item of list) {
    const parsed = parseConversation(item)
    if (parsed) out.push(parsed)
  }
  return out
}
