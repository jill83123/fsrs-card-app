import {
  computeDecayFactor,
  createEmptyCard,
  default_w,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FCard,
  type FSRS,
  type Grade,
  type StepUnit,
} from 'ts-fsrs'
import type { SchedState, SyncedSettings } from '@/db/types'

export { Rating, State }
export type { Grade }

export const GRADES: { grade: Grade; label: string; key: string; tone: string }[] = [
  { grade: Rating.Again, label: '重來', key: '1', tone: 'var(--danger)' },
  { grade: Rating.Hard, label: '困難', key: '2', tone: 'var(--warn)' },
  { grade: Rating.Good, label: '良好', key: '3', tone: 'var(--success)' },
  { grade: Rating.Easy, label: '簡單', key: '4', tone: 'var(--primary)' },
]

export const STATE_LABEL: Record<State, string> = {
  [State.New]: '新卡',
  [State.Learning]: '學習中',
  [State.Review]: '複習',
  [State.Relearning]: '重新學習',
}

const STEP_RE = /^\d+(\.\d+)?[mhd]$/

export function parseSteps(text: string): StepUnit[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => STEP_RE.test(s)) as StepUnit[]
}

export const isValidSteps = (text: string) =>
  text.trim() === '' || text.split(/[\s,]+/).every((s) => s === '' || STEP_RE.test(s))

export function makeScheduler(s: SyncedSettings['fsrs']): FSRS {
  return fsrs(
    generatorParameters({
      request_retention: s.retention,
      maximum_interval: s.maximumInterval,
      enable_fuzz: s.enableFuzz,
      enable_short_term: true,
      learning_steps: parseSteps(s.learningSteps),
      relearning_steps: parseSteps(s.relearningSteps),
    }),
  )
}

export function toFsrs(s: SchedState): FCard {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  }
}

export function fromFsrs(c: FCard): SchedState {
  const out: SchedState = {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
  }
  if (c.last_review) out.last_review = c.last_review.getTime()
  return out
}

export const emptySched = (now = Date.now()): SchedState => fromFsrs(createEmptyCard(new Date(now)))

/** Retrievability 0–1, or null for cards never reviewed. */
export function retrievability(f: FSRS, s: SchedState, now = Date.now()): number | null {
  if (s.state === State.New) return null
  return f.get_retrievability(toFsrs(s), new Date(now), false)
}

/** Interval in ms for each grade if the card were rated now. */
export function previewIntervals(f: FSRS, s: SchedState, now = Date.now()) {
  const p = f.repeat(toFsrs(s), new Date(now))
  const out = {} as Record<Grade, number>
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    out[g] = p[g].card.due.getTime() - now
  }
  return out
}

/**
 * How the review interval (and roughly the workload) changes when the target
 * retention moves away from 90%. Interval ∝ R^(1/decay) − 1 for a given stability.
 */
export function retentionImpact(r: number) {
  const { decay } = computeDecayFactor(default_w)
  const f = (x: number) => Math.pow(x, 1 / decay) - 1
  const intervalRatio = f(r) / f(0.9)
  return { intervalRatio, workloadRatio: 1 / intervalRatio }
}
