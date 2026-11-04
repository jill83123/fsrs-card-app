import type { Card, TreeNode } from '@/db/types'
import type { Side } from './cards'
import { studyDayEnd, studyDayOf } from './date'
import { buildSession } from './session'

/** One reminder: when it goes off and how many cards will be waiting then. */
export interface ReminderSlot {
  t: number
  review: number
  fresh: number
}

export interface ReminderInput {
  now: number
  /** "HH:MM" */
  time: string
  review: boolean
  learn: boolean
  rolloverHour: number
  newOrder: 'created' | 'random'
  nodes: TreeNode[]
  cardsByDeck: Map<string, Card[]>
  limitsOf: (deckId: string) => { newPerDay: number; reviewPerDay: number }
  doneToday: Map<string, { newDone: number; reviewDone: number }>
  sidesOf: (card: Card) => Side[]
  paused: Set<string>
}

/** How many days ahead are planned; the Worker only sends what was uploaded, so opening the app renews it. */
export const REMINDER_DAYS = 7

/**
 * The reminders for the next days. For a day's reminder the counts are what would be waiting
 * if nothing else were studied before then: the study session's own queue, limits included.
 */
export function reminderSlots(i: ReminderInput): ReminderSlot[] {
  const [h = 20, m = 0] = i.time.split(':').map(Number)
  const today = studyDayOf(i.now, i.rolloverHour)
  const slots: ReminderSlot[] = []
  for (let d = 0; d <= REMINDER_DAYS; d++) {
    const at = new Date(i.now)
    at.setDate(at.getDate() + d)
    at.setHours(h, m, 0, 0)
    if (at.getTime() <= i.now) continue
    const day = studyDayOf(at, i.rolloverHour)
    const base = {
      scope: null,
      nodes: i.nodes,
      cardsByDeck: i.cardsByDeck,
      limitsOf: i.limitsOf,
      // only what is left of today can be counted; later days start from nothing
      doneToday: day === today ? i.doneToday : new Map(),
      newOrder: i.newOrder,
      sidesOf: i.sidesOf,
      dayEnd: studyDayEnd(day, i.rolloverHour),
      paused: i.paused,
    }
    const count = (mode: 'review' | 'learn') => {
      const s = buildSession('reminder', { ...base, mode })
      return s.main.length + s.learning.length
    }
    slots.push({
      t: at.getTime(),
      review: i.review ? count('review') : 0,
      fresh: i.learn ? count('learn') : 0,
    })
  }
  return slots
}
