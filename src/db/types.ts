import type { State } from 'ts-fsrs'

/** Fields every synced record carries. */
export interface SyncFields {
  id: string
  createdAt: number
  updatedAt: number
  deleted?: boolean
  /** permanently deleted by hand: content wiped, only this synced marker remains until it expires */
  purged?: boolean
}

/** Every node is a deck; 'folder' only appears in data from older versions. */
export type NodeKind = 'folder' | 'deck'

export interface DeckLimits {
  newPerDay?: number
  reviewPerDay?: number
}

/** Which template "new card" opens with; `lang` absent = the last language used. */
export interface CardTemplate {
  type: 'basic' | 'vocab'
  lang?: Lang
}

export interface TreeNode extends SyncFields {
  kind: NodeKind
  parentId: string | null
  name: string
  color: DeckColor
  order: number
  /** hidden from lists and study together with its sub-decks; review history is kept */
  archived?: boolean
  limits?: DeckLimits
  /** decks only; absent = inherit from the nearest ancestor (basic card at the top) */
  defaultCard?: CardTemplate
  /** decks only; vocab cards also get a meaning → word schedule. absent = inherit (off at the top) */
  reverse?: boolean
}

export type DeckColor = 'blue' | 'yellow' | 'pink' | 'orange' | 'green' | 'purple' | 'gray'

export type Lang = 'en' | 'ja' | 'ko'

export interface Example {
  id: string
  sentence: string
  translation: string
}

/** FSRS state stored on a card (dates as epoch ms so it is JSON friendly). */
export interface SchedState {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: State
  last_review?: number
}

interface CardBase extends SyncFields {
  deckId: string
  starred: boolean
  suspended: boolean
  sched: SchedState
  /** schedule of the reverse (meaning → word) side; absent = never reviewed (new) */
  rsched?: SchedState
}

export interface BasicCard extends CardBase {
  type: 'basic'
  front: string
  back: string
}

export interface VocabCard extends CardBase {
  type: 'vocab'
  lang: Lang
  word: string
  reading: string
  meaning: string
  pos: string[]
  examples: Example[]
  note: string
}

export type Card = BasicCard | VocabCard

export interface ReviewLogRecord extends SyncFields {
  cardId: string
  /** 'r' = the review was of the reverse side; absent = forward */
  side?: 'r'
  rating: number
  state: State
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  last_elapsed_days: number
  scheduled_days: number
  learning_steps: number
  /** time of review (epoch ms) */
  review: number
  /** study day this review belongs to (YYYY-MM-DD) */
  studyDay: string
  /** card schedule before this review, used for undo / re-rating */
  prev: SchedState
}

export interface Dictionary {
  id: string
  name: string
  url: string
  langs: Lang[]
}

export interface PosOption {
  id: string
  label: string
  /** default options cannot be deleted, only hidden from the card editor */
  hidden?: boolean
}

/** Settings that sync across devices. */
export interface SyncedSettings {
  appearance: {
    primary: string
    theme: 'system' | 'light' | 'dark'
  }
  study: {
    rolloverHour: number
    newPerDay: number
    reviewPerDay: number
    newOrder: 'created' | 'random'
  }
  fsrs: {
    retention: number
    maximumInterval: number
    enableFuzz: boolean
    learningSteps: string
    relearningSteps: string
  }
  pos: Record<Lang, PosOption[]>
  dictionaries: Dictionary[]
}

export type TtsEngine = 'piper' | 'system'

export interface TtsLangSettings {
  engine: TtsEngine
  piperModel: string
  systemVoice: string
  rate: number
}

/** Settings that stay on this device. */
export interface DeviceSettings {
  tts: Record<Lang, TtsLangSettings> & { autoPlay: boolean; kokoroBackend: 'wasm' | 'webgpu' }
  sync: {
    clientId: string
    auto: boolean
  }
}

export interface MetaRecord {
  key: string
  value: unknown
  updatedAt: number
}
