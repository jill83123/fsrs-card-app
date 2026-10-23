import type { CardTemplate, TreeNode } from '@/db/types'

export function childrenOf(nodes: TreeNode[], parentId: string | null): TreeNode[] {
  return nodes
    .filter((n) => n.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

export interface DeckRow {
  node: TreeNode
  /** names from the top-most deck down to this one, joined with " / " */
  path: string
  /**
   * The branches to draw before the name, one character per level: │ a line goes on past this level,
   * a space nothing, and the last one is ├ (more siblings follow) or └ (this is the last). Top-level
   * decks have none.
   */
  tree: string
}

/** Every deck in tree order (each deck followed by its sub-decks), minus the ones `skip` rejects and their sub-decks. */
export function deckRows(nodes: TreeNode[], skip?: (n: TreeNode) => boolean): DeckRow[] {
  const rows: DeckRow[] = []
  const walk = (parentId: string | null, guides: string, path: string[]) => {
    const kids = childrenOf(nodes, parentId).filter((n) => !skip?.(n))
    kids.forEach((n, i) => {
      const last = i === kids.length - 1
      const here = [...path, n.name]
      rows.push({
        node: n,
        path: here.join(' / '),
        tree: parentId ? guides + (last ? '└' : '├') : '',
      })
      walk(n.id, parentId ? guides + (last ? ' ' : '│') : '', here)
    })
  }
  walk(null, '', [])
  return rows
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

/** A deck's daily limits: its own, else the nearest ancestor's, else the global default. */
export function effectiveLimits(
  nodes: TreeNode[],
  id: string | null,
  def: { newPerDay: number; reviewPerDay: number },
) {
  const path = id ? pathTo(nodes, id).reverse() : []
  const newFrom = path.find((n) => n.limits?.newPerDay !== undefined)
  const reviewFrom = path.find((n) => n.limits?.reviewPerDay !== undefined)
  return {
    newPerDay: newFrom?.limits?.newPerDay ?? def.newPerDay,
    reviewPerDay: reviewFrom?.limits?.reviewPerDay ?? def.reviewPerDay,
    /** the deck each value comes from; undefined = the global default */
    newFrom: newFrom?.name,
    reviewFrom: reviewFrom?.name,
  }
}

/** The card template a deck uses: its own, else the nearest ancestor's; undefined = basic. */
export function effectiveTemplate(nodes: TreeNode[], id: string | null): CardTemplate | undefined {
  if (!id) return undefined
  return pathTo(nodes, id)
    .reverse()
    .find((n) => n.defaultCard)?.defaultCard
}
