import { defineStore } from 'pinia'
import { liveQuery, type Subscription } from 'dexie'
import { computed, ref, shallowRef, watch } from 'vue'
import { db, markLocalChange, stamp } from '@/db'
import type { Card, DeckColor, ReviewLogRecord, TreeNode } from '@/db/types'
import { addDays, studyDayEnd, studyDayOf, studyDayStart } from '@/lib/date'
import { uid } from '@/lib/id'
import { activeSides, isStudyable, schedOf, type Side } from '@/lib/cards'
import { childrenOf, decksInScope, effectiveReverse, subtreeIds } from '@/lib/tree'
import { purgeExpired, type ArchivedDeck, type DeletedDeck } from '@/lib/purge'
import { makeScheduler, State, toFsrs, fromFsrs, type Grade } from '@/lib/fsrs'
import { useSettings } from './settings'

export interface ScopeStats {
  total: number
  due: number
  dueAvail: number
  learning: number
  /** learning cards due later today (not yet reviewable) */
  learningWaiting: number
  /** earliest due time among the waiting learning cards (Infinity if none) */
  nextDue: number
  newTotal: number
  newAvail: number
  drafts: number
}

const emptyStats = (): ScopeStats => ({
  total: 0,
  due: 0,
  dueAvail: 0,
  learning: 0,
  learningWaiting: 0,
  nextDue: Infinity,
  newTotal: 0,
  newAvail: 0,
  drafts: 0,
})

export const useData = defineStore('data', () => {
  const settings = useSettings()

  /** every non-deleted node / card, archived ones included */
  const allNodes = shallowRef<TreeNode[]>([])
  const allCards = shallowRef<Card[]>([])
  const todayLogs = shallowRef<ReviewLogRecord[]>([])
  const ready = ref(false)

  // --- clock / study day -------------------------------------------------
  const now = ref(Date.now())
  setInterval(() => (now.value = Date.now()), 30_000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') now.value = Date.now()
  })
  const rollover = computed(() => settings.synced.study.rolloverHour)
  const today = computed(() => studyDayOf(now.value, rollover.value))
  const dayEnd = computed(() => studyDayEnd(today.value, rollover.value))

  // --- live queries --------------------------------------------------------
  let started = false
  let logsSub: Subscription | undefined
  function start() {
    if (started) return
    started = true
    let pending = 2
    const done = () => {
      if (--pending === 0) ready.value = true
    }
    // folders were merged into decks: convert old ones (also those synced in later)
    liveQuery(() => db.nodes.filter((n) => !n.deleted).toArray()).subscribe((v) => {
      allNodes.value = v.map((n) => (n.kind === 'deck' ? n : { ...n, kind: 'deck' }))
      if (v.some((n) => n.kind !== 'deck')) void migrateFolders()
      done()
    })
    liveQuery(() => db.cards.filter((c) => !c.deleted).toArray()).subscribe((v) => {
      allCards.value = v
      done()
    })
    void purgeExpired().then((n) => n && markLocalChange())
    watch(
      today,
      (day) => {
        logsSub?.unsubscribe()
        logsSub = liveQuery(() =>
          db.logs
            .where('studyDay')
            .equals(day)
            .filter((l) => !l.deleted)
            .toArray(),
        ).subscribe((v) => (todayLogs.value = v))
      },
      { immediate: true },
    )
  }

  async function migrateFolders() {
    const n = await db.nodes
      .filter((x) => x.kind !== 'deck')
      .modify({ kind: 'deck', updatedAt: stamp() })
    if (n) markLocalChange()
  }

  /** ids inside an archived deck (the archived deck itself included) */
  const archivedIds = computed(() => {
    const hidden = new Set<string>()
    for (const n of allNodes.value) {
      if (n.archived) for (const id of subtreeIds(allNodes.value, n.id)) hidden.add(id)
    }
    return hidden
  })
  /** active decks / cards: what every list, study session and stat works on */
  const nodes = computed(() =>
    archivedIds.value.size
      ? allNodes.value.filter((n) => !archivedIds.value.has(n.id))
      : allNodes.value,
  )
  const cards = computed(() =>
    archivedIds.value.size
      ? allCards.value.filter((c) => !archivedIds.value.has(c.deckId))
      : allCards.value,
  )
  /** the archived decks themselves (not their sub-decks) */
  const archivedNodes = computed(() =>
    allNodes.value
      .filter((n) => n.archived && !(n.parentId && archivedIds.value.has(n.parentId)))
      .sort((a, b) => a.name.localeCompare(b.name)),
  )
  /** archived decks with their sub-decks nested, for the settings list */
  const archivedTree = computed<ArchivedDeck[]>(() => {
    const kids = new Map<string, TreeNode[]>()
    for (const n of allNodes.value) {
      if (!n.parentId) continue
      const list = kids.get(n.parentId) ?? []
      list.push(n)
      kids.set(n.parentId, list)
    }
    const count = new Map<string, number>()
    for (const c of allCards.value) count.set(c.deckId, (count.get(c.deckId) ?? 0) + 1)
    const build = (n: TreeNode): ArchivedDeck => {
      const children = (kids.get(n.id) ?? [])
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(build)
      return {
        node: n,
        decks: 1 + children.reduce((s, c) => s + c.decks, 0),
        cards: (count.get(n.id) ?? 0) + children.reduce((s, c) => s + c.cards, 0),
        children,
      }
    }
    return archivedNodes.value.map(build)
  })

  const nodeById = computed(() => new Map(nodes.value.map((n) => [n.id, n])))
  const cardById = computed(() => new Map(cards.value.map((c) => [c.id, c])))
  const cardsByDeck = computed(() => {
    const m = new Map<string, Card[]>()
    for (const c of cards.value) {
      const arr = m.get(c.deckId)
      if (arr) arr.push(c)
      else m.set(c.deckId, [c])
    }
    return m
  })

  /** decks that also schedule the reverse side of their vocab cards */
  const reverseDecks = computed(
    () => new Set(nodes.value.filter((n) => effectiveReverse(nodes.value, n.id)).map((n) => n.id)),
  )
  const sidesOf = (c: Card) => activeSides(c, reverseDecks.value.has(c.deckId))

  const scheduler = computed(() => makeScheduler(settings.synced.fsrs))

  function limitsOf(deckId: string) {
    const d = nodeById.value.get(deckId)
    return {
      newPerDay: d?.limits?.newPerDay ?? settings.synced.study.newPerDay,
      reviewPerDay: d?.limits?.reviewPerDay ?? settings.synced.study.reviewPerDay,
    }
  }

  /** Reviews already done today, per deck. */
  const doneToday = computed(() => {
    const m = new Map<string, { newDone: number; reviewDone: number; all: number }>()
    for (const l of todayLogs.value) {
      const c = cardById.value.get(l.cardId)
      if (!c) continue
      const e = m.get(c.deckId) ?? { newDone: 0, reviewDone: 0, all: 0 }
      e.all++
      // the reverse side is not counted against the daily limits
      if (l.side !== 'r') {
        if (l.prev.state === State.New) e.newDone++
        else if (l.prev.state === State.Review) e.reviewDone++
      }
      m.set(c.deckId, e)
    }
    return m
  })

  function deckStats(deckId: string): ScopeStats {
    const list = cardsByDeck.value.get(deckId) ?? []
    const s: ScopeStats = { ...emptyStats(), total: list.length }
    let reviewDue = 0
    // reverse cards are not limited per day, so they are counted apart
    let revNew = 0
    let revReviewDue = 0
    for (const c of list) {
      if (!isStudyable(c)) {
        if (!c.suspended) s.drafts++
        continue
      }
      for (const side of sidesOf(c)) {
        const sched = schedOf(c, side)
        const st = sched.state
        const rev = side === 'r'
        if (st === State.New) {
          s.newTotal++
          if (rev) revNew++
        } else if (sched.due < dayEnd.value) {
          if (st === State.Review) {
            reviewDue++
            if (rev) revReviewDue++
          } else {
            s.learning++
            if (sched.due > now.value) {
              s.learningWaiting++
              s.nextDue = Math.min(s.nextDue, sched.due)
            }
          }
        }
      }
    }
    const lim = limitsOf(deckId)
    const done = doneToday.value.get(deckId) ?? { newDone: 0, reviewDone: 0, all: 0 }
    s.due = reviewDue + s.learning
    s.dueAvail =
      Math.min(reviewDue - revReviewDue, Math.max(0, lim.reviewPerDay - done.reviewDone)) +
      revReviewDue +
      s.learning
    s.newAvail = Math.min(s.newTotal - revNew, Math.max(0, lim.newPerDay - done.newDone)) + revNew
    return s
  }

  const statsCache = computed(() => {
    const m = new Map<string, ScopeStats>()
    for (const n of nodes.value) m.set(n.id, deckStats(n.id))
    return m
  })

  function scopeStats(scopeId: string | null): ScopeStats {
    return decksStats(decksInScope(nodes.value, scopeId))
  }

  function decksStats(deckIds: string[]): ScopeStats {
    const acc = emptyStats()
    for (const id of deckIds) {
      const s = statsCache.value.get(id)
      if (!s) continue
      for (const k of Object.keys(acc) as (keyof ScopeStats)[]) {
        acc[k] = k === 'nextDue' ? Math.min(acc[k], s[k]) : acc[k] + s[k]
      }
    }
    return acc
  }

  // refresh the clock exactly when the next waiting learning card becomes due
  let dueTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => scopeStats(null).nextDue,
    (next) => {
      clearTimeout(dueTimer)
      if (Number.isFinite(next)) {
        dueTimer = setTimeout(() => (now.value = Date.now()), Math.max(0, next - Date.now()) + 50)
      }
    },
  )

  /** Share of today's work finished in a scope (0–1), or null if there was nothing to do. */
  function scopeProgress(scopeId: string | null): { done: number; ratio: number | null } {
    let done = 0
    for (const id of decksInScope(nodes.value, scopeId)) done += doneToday.value.get(id)?.all ?? 0
    const s = scopeStats(scopeId)
    const total = done + s.dueAvail + s.newAvail
    return { done, ratio: total ? done / total : null }
  }

  const cardsInScope = (scopeId: string | null) => cardsInDecks(decksInScope(nodes.value, scopeId))
  const cardsInDecks = (deckIds: string[]) =>
    deckIds.flatMap((id) => cardsByDeck.value.get(id) ?? [])

  // --- node mutations ------------------------------------------------------
  async function createNode(parentId: string | null, name: string, color: DeckColor) {
    const t = stamp()
    const siblings = childrenOf(nodes.value, parentId)
    const node: TreeNode = {
      id: uid(),
      kind: 'deck',
      parentId,
      name,
      color,
      order: (siblings.at(-1)?.order ?? 0) + 1,
      createdAt: t,
      updatedAt: t,
    }
    await db.nodes.put(node)
    markLocalChange()
    return node
  }

  async function updateNode(id: string, patch: Partial<TreeNode>) {
    await db.nodes.update(id, { ...patch, updatedAt: stamp() })
    markLocalChange()
  }

  async function reorderNodes(ids: string[]) {
    await db.transaction('rw', db.nodes, async () => {
      for (const [i, id] of ids.entries())
        await db.nodes.update(id, { order: i + 1, updatedAt: stamp() })
    })
    markLocalChange()
  }

  async function setArchived(id: string, archived: boolean) {
    await db.nodes.update(id, { archived: archived || undefined, updatedAt: stamp() })
    markLocalChange()
  }

  /**
   * Soft delete: the deck, its sub-decks, cards and review logs are tombstoned with one
   * shared timestamp, so `restoreNode` can bring back exactly this batch. Tombstones older
   * than DELETED_KEEP_DAYS are purged for good (see `purgeExpired`).
   */
  async function deleteNode(id: string) {
    const ids = subtreeIds(allNodes.value, id)
    const t = stamp()
    await db.transaction('rw', db.nodes, db.cards, db.logs, async () => {
      await db.nodes.where('id').anyOf(ids).modify({ deleted: true, updatedAt: t })
      const cardIds = await db.cards
        .where('deckId')
        .anyOf(ids)
        .filter((c) => !c.deleted)
        .primaryKeys()
      await db.cards.where('id').anyOf(cardIds).modify({ deleted: true, updatedAt: t })
      await db.logs
        .where('cardId')
        .anyOf(cardIds)
        .filter((l) => !l.deleted)
        .modify({ deleted: true, updatedAt: t })
    })
    markLocalChange()
  }

  /** Decks deleted within the last DELETED_KEEP_DAYS days (the top-most of each batch). */
  async function listDeleted(): Promise<DeletedDeck[]> {
    const gone = await db.nodes.filter((n) => !!n.deleted).toArray()
    const byId = new Map(gone.map((n) => [n.id, n]))
    const stamps = new Set(gone.map((n) => n.updatedAt))
    const cardsByDeck = new Map<string, number>()
    for (const c of await db.cards.filter((c) => !!c.deleted && stamps.has(c.updatedAt)).toArray()) {
      const key = `${c.updatedAt}|${c.deckId}`
      cardsByDeck.set(key, (cardsByDeck.get(key) ?? 0) + 1)
    }
    const kids = new Map<string, TreeNode[]>()
    const isRoot = (n: TreeNode) => {
      const parent = n.parentId ? byId.get(n.parentId) : undefined
      return !(parent && parent.updatedAt === n.updatedAt)
    }
    for (const n of gone) {
      if (isRoot(n)) continue
      const list = kids.get(n.parentId!) ?? []
      list.push(n)
      kids.set(n.parentId!, list)
    }
    const build = (n: TreeNode): DeletedDeck => {
      const children = (kids.get(n.id) ?? [])
        .map(build)
        .sort((a, b) => a.node.name.localeCompare(b.node.name))
      return {
        node: n,
        decks: 1 + children.reduce((s, c) => s + c.decks, 0),
        cards:
          (cardsByDeck.get(`${n.updatedAt}|${n.id}`) ?? 0) +
          children.reduce((s, c) => s + c.cards, 0),
        deletedAt: n.updatedAt,
        children,
      }
    }
    return gone
      .filter(isRoot)
      .map(build)
      .sort((a, b) => b.deletedAt - a.deletedAt)
  }

  async function restoreNode(id: string) {
    const root = await db.nodes.get(id)
    if (!root?.deleted) return
    const batchT = root.updatedAt
    const batch = await db.nodes.filter((n) => !!n.deleted && n.updatedAt === batchT).toArray()
    const ids = subtreeIds(batch, id)
    const t = stamp()
    // back under its old parent only if that still exists and may hold sub-decks
    const parent = root.parentId ? allNodes.value.find((n) => n.id === root.parentId) : undefined
    const parentOk = !!parent && !(cardsByDeckAll(parent.id) > 0)
    await db.transaction('rw', db.nodes, db.cards, db.logs, async () => {
      await db.nodes.where('id').anyOf(ids).modify({ deleted: undefined, updatedAt: t })
      if (!parentOk) await db.nodes.update(id, { parentId: null })
      const cardIds = await db.cards
        .where('deckId')
        .anyOf(ids)
        .filter((c) => !!c.deleted && c.updatedAt === batchT)
        .primaryKeys()
      await db.cards.where('id').anyOf(cardIds).modify({ deleted: undefined, updatedAt: t })
      await db.logs
        .where('cardId')
        .anyOf(cardIds)
        .filter((l) => !!l.deleted && l.updatedAt === batchT)
        .modify({ deleted: undefined, updatedAt: t })
    })
    markLocalChange()
  }

  const cardsByDeckAll = (deckId: string) =>
    allCards.value.reduce((n, c) => n + (c.deckId === deckId ? 1 : 0), 0)

  /** Permanently remove a deleted deck and its deleted sub-decks right now. */
  async function purgeDeleted(id: string) {
    const root = await db.nodes.get(id)
    if (!root?.deleted) return
    const batchT = root.updatedAt
    const batch = await db.nodes.filter((n) => !!n.deleted && n.updatedAt === batchT).toArray()
    const ids = subtreeIds(batch, id)
    await db.transaction('rw', db.nodes, db.cards, db.logs, async () => {
      const cardIds = await db.cards
        .where('deckId')
        .anyOf(ids)
        .filter((c) => !!c.deleted && c.updatedAt === batchT)
        .primaryKeys()
      await db.logs.where('cardId').anyOf(cardIds).delete()
      await db.cards.bulkDelete(cardIds)
      await db.nodes.bulkDelete(ids)
    })
    markLocalChange()
  }

  // --- card mutations ------------------------------------------------------
  async function saveCard(card: Card) {
    const copy = JSON.parse(JSON.stringify(card)) as Card
    copy.updatedAt = stamp()
    await db.cards.put(copy)
    markLocalChange()
    return copy
  }

  async function patchCards(
    ids: string[],
    patch: Partial<Pick<Card, 'starred' | 'suspended' | 'deckId' | 'deleted'>>,
  ) {
    const t = stamp()
    await db.cards
      .where('id')
      .anyOf(ids)
      .modify({ ...patch, updatedAt: t })
    markLocalChange()
  }

  async function resetCards(ids: string[]) {
    const t = stamp()
    await db.transaction('rw', db.cards, db.logs, async () => {
      for (const id of ids) {
        const c = await db.cards.get(id)
        if (!c) continue
        const f = scheduler.value.forget(toFsrs(c.sched), new Date(), true)
        // the reverse side starts over too; undefined removes the field
        await db.cards.update(id, { sched: fromFsrs(f.card), rsched: undefined, updatedAt: t })
      }
    })
    markLocalChange()
  }

  // --- reviews -------------------------------------------------------------
  async function applyRating(cardId: string, grade: Grade, side: Side = 'f', at = Date.now()) {
    const card = await db.cards.get(cardId)
    if (!card) throw new Error('card not found')
    const prev = schedOf(card, side)
    const res = scheduler.value.next(toFsrs(prev), new Date(at), grade)
    const t = stamp()
    const log: ReviewLogRecord = {
      id: uid(),
      cardId,
      ...(side === 'r' ? { side } : {}),
      rating: res.log.rating,
      state: res.log.state,
      due: res.log.due.getTime(),
      stability: res.log.stability,
      difficulty: res.log.difficulty,
      elapsed_days: res.log.elapsed_days,
      last_elapsed_days: res.log.last_elapsed_days,
      scheduled_days: res.log.scheduled_days,
      learning_steps: res.log.learning_steps,
      review: at,
      studyDay: studyDayOf(at, rollover.value),
      prev,
      createdAt: t,
      updatedAt: t,
    }
    const sched = fromFsrs(res.card)
    await db.transaction('rw', db.cards, db.logs, async () => {
      await db.logs.put(log)
      await db.cards.update(
        cardId,
        side === 'r' ? { rsched: sched, updatedAt: t } : { sched, updatedAt: t },
      )
    })
    markLocalChange()
    return { log, sched }
  }

  /** Revert a card to the state before `logId`. Only allowed for the card's latest log. */
  async function undoLog(logId: string) {
    const log = await db.logs.get(logId)
    if (!log || log.deleted) return
    const t = stamp()
    await db.transaction('rw', db.cards, db.logs, async () => {
      await db.logs.update(logId, { deleted: true, updatedAt: t })
      await db.cards.update(
        log.cardId,
        log.side === 'r' ? { rsched: log.prev, updatedAt: t } : { sched: log.prev, updatedAt: t },
      )
    })
    markLocalChange()
  }

  async function latestLog(cardId: string, side: Side = 'f') {
    const logs = await db.logs
      .where('cardId')
      .equals(cardId)
      .filter((l) => !l.deleted && (l.side ?? 'f') === side)
      .sortBy('review')
    return logs.at(-1)
  }

  /** Re-rate a card's latest review, if that review happened in the current study day. */
  async function rerate(cardId: string, grade: Grade, side: Side = 'f') {
    const log = await latestLog(cardId, side)
    if (!log || log.studyDay !== today.value) throw new Error('只能重評今天的最後一次紀錄')
    await undoLog(log.id)
    return applyRating(cardId, grade, side)
  }

  /** After changing the rollover hour, re-bucket only yesterday's and today's logs. */
  async function rebucketRecentLogs(oldHour: number, newHour: number) {
    const oldToday = studyDayOf(Date.now(), oldHour)
    const from = Math.min(
      studyDayStart(addDays(oldToday, -1), oldHour),
      studyDayStart(addDays(studyDayOf(Date.now(), newHour), -1), newHour),
    )
    const t = stamp()
    await db.logs
      .where('review')
      .aboveOrEqual(from)
      .modify((l) => {
        const day = studyDayOf(l.review, newHour)
        if (day !== l.studyDay) {
          l.studyDay = day
          l.updatedAt = t
        }
      })
    markLocalChange()
  }

  return {
    nodes,
    cards,
    archivedNodes,
    archivedTree,
    todayLogs,
    ready,
    now,
    today,
    dayEnd,
    nodeById,
    cardById,
    cardsByDeck,
    scheduler,
    reverseDecks,
    sidesOf,
    start,
    limitsOf,
    doneToday,
    deckStats,
    scopeStats,
    decksStats,
    scopeProgress,
    cardsInScope,
    cardsInDecks,
    createNode,
    updateNode,
    reorderNodes,
    deleteNode,
    setArchived,
    listDeleted,
    restoreNode,
    purgeDeleted,
    saveCard,
    patchCards,
    resetCards,
    applyRating,
    undoLog,
    latestLog,
    rerate,
    rebucketRecentLogs,
  }
})
