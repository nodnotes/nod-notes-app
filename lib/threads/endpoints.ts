// Thread endpoints: frames (messages) or canvas nodes (drawings / shapes).

import type { Node } from 'reactflow'

/** One end of a panel_edges row — either a frame message or a canvas_nodes row. */
export type ThreadEndpoint =
  | { kind: 'message'; id: string } // Frame message id (RF panel-* node)
  | { kind: 'canvas'; id: string } // canvas_nodes.id (== RF freehand/shape node id)

/** Saved panel_edges row shape used by board load / fetch. */
export type SavedPanelEdge = {
  source_message_id?: string | null
  target_message_id?: string | null
  source_canvas_node_id?: string | null
  target_canvas_node_id?: string | null
  metadata?: unknown
}

/** Resolve a connectable RF node to a durable thread endpoint. */
export function threadEndpointFromNode(node: Node | undefined | null): ThreadEndpoint | null {
  if (!node) return null
  if (node.type === 'freehand' || node.type === 'shape') {
    return { kind: 'canvas', id: node.id } // Drawing / shape id is the canvas_nodes primary key
  }
  const messageId = (node.data as { promptMessage?: { id?: string } } | undefined)?.promptMessage?.id
  if (typeof messageId === 'string' && messageId.length > 0) {
    return { kind: 'message', id: messageId }
  }
  return null
}

/** True when this frame endpoint is a flashcard (threads must not attach). */
export function endpointIsFlashcard(node: Node | undefined | null): boolean {
  if (!node || node.type === 'freehand' || node.type === 'shape') return false
  return (
    (node.data as { promptMessage?: { metadata?: { isFlashcard?: boolean } } } | undefined)
      ?.promptMessage?.metadata?.isFlashcard === true
  )
}

/** Columns for insert/update — opposite kind left null so the CHECK constraint passes. */
export function panelEdgeEndpointColumns(source: ThreadEndpoint, target: ThreadEndpoint) {
  return {
    source_message_id: source.kind === 'message' ? source.id : null,
    target_message_id: target.kind === 'message' ? target.id : null,
    source_canvas_node_id: source.kind === 'canvas' ? source.id : null,
    target_canvas_node_id: target.kind === 'canvas' ? target.id : null,
  }
}

/** PostgREST `.or(...)` filter matching this pair in either direction. */
export function panelEdgesMatchOrFilter(source: ThreadEndpoint, target: ThreadEndpoint): string {
  const fwd = andEndpointEq(source, target)
  const rev = andEndpointEq(target, source)
  return `${fwd},${rev}`
}

function andEndpointEq(a: ThreadEndpoint, b: ThreadEndpoint): string {
  const aCol = a.kind === 'message' ? 'source_message_id' : 'source_canvas_node_id'
  const bCol = b.kind === 'message' ? 'target_message_id' : 'target_canvas_node_id'
  return `and(${aCol}.eq.${a.id},${bCol}.eq.${b.id})`
}

/** Find RF nodes that match one saved endpoint (message id or canvas node id). */
export function nodesForSavedEndpoint(
  nodes: Node[],
  endpoint: ThreadEndpoint | null
): Node[] {
  if (!endpoint) return []
  if (endpoint.kind === 'message') {
    return nodes.filter(
      (n) =>
        (n.data as { promptMessage?: { id?: string } } | undefined)?.promptMessage?.id ===
        endpoint.id
    )
  }
  return nodes.filter(
    (n) => (n.type === 'freehand' || n.type === 'shape') && n.id === endpoint.id
  )
}

/** Parse durable endpoints from a panel_edges row. */
export function endpointsFromSavedEdge(edge: SavedPanelEdge): {
  source: ThreadEndpoint | null
  target: ThreadEndpoint | null
} {
  const source: ThreadEndpoint | null = edge.source_message_id
    ? { kind: 'message', id: edge.source_message_id }
    : edge.source_canvas_node_id
      ? { kind: 'canvas', id: edge.source_canvas_node_id }
      : null
  const target: ThreadEndpoint | null = edge.target_message_id
    ? { kind: 'message', id: edge.target_message_id }
    : edge.target_canvas_node_id
      ? { kind: 'canvas', id: edge.target_canvas_node_id }
      : null
  return { source, target }
}

/** Stable signature fragment for load-effect dedupe (includes canvas ends). */
export function savedEdgePairKey(edge: SavedPanelEdge): string {
  const { source, target } = endpointsFromSavedEdge(edge)
  const s = source ? `${source.kind[0]}:${source.id}` : '?'
  const t = target ? `${target.kind[0]}:${target.id}` : '?'
  return `${s}>${t}`
}
