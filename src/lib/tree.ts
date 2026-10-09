import type { CardTemplate, TreeNode } from '@/db/types'

export function childrenOf(nodes: TreeNode[], parentId: string | null): TreeNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

/** All descendant node ids, including the node itself. */
export function subtreeIds(nodes: TreeNode[], rootId: string): string[] {
  const out = [rootId]
  for (let i = 0; i < out.length; i++) {
    for (const n of nodes) if (n.parentId === out[i]) out.push(n.id)
  }
  return out
}

/** Deck ids inside a scope, including the scope itself (null = everything). */
export function decksInScope(nodes: TreeNode[], scopeId: string | null): string[] {
  const ids = scopeId ? new Set(subtreeIds(nodes, scopeId)) : null
  return nodes.filter((n) => !ids || ids.has(n.id)).map((n) => n.id)
}

/** Decks chosen for study via the `decks` query (undefined = whole scope). */
export function pickedDecks(
  query: unknown,
  nodes: TreeNode[],
  scopeId: string | null,
): string[] | undefined {
  if (typeof query !== 'string') return undefined
  const ids = new Set(query.split(','))
  return decksInScope(nodes, scopeId).filter((id) => ids.has(id))
}

export function pathTo(nodes: TreeNode[], id: string): TreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out: TreeNode[] = []
  let cur = byId.get(id)
  while (cur) {
    out.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return out
}

/** Nodes that may become the parent of `node` without creating a cycle or breaking rules. */
export function validParents(
  nodes: TreeNode[],
  nodeId: string,
  deckHasCards: (deckId: string) => boolean,
): TreeNode[] {
  const banned = new Set(subtreeIds(nodes, nodeId))
  // a deck can contain sub-decks only if it holds no cards
  return nodes.filter((p) => !banned.has(p.id) && !deckHasCards(p.id))
}

/** Whether a deck also schedules the reverse side: its own setting, else the nearest ancestor's. */
export function effectiveReverse(nodes: TreeNode[], id: string | null): boolean {
  if (!id) return false
  return (
    pathTo(nodes, id)
      .reverse()
      .find((n) => n.reverse !== undefined)?.reverse ?? false
  )
}

/** The card template a deck uses: its own, else the nearest ancestor's; undefined = basic. */
export function effectiveTemplate(nodes: TreeNode[], id: string | null): CardTemplate | undefined {
  if (!id) return undefined
  return pathTo(nodes, id)
    .reverse()
    .find((n) => n.defaultCard)?.defaultCard
}
