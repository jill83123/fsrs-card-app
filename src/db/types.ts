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
  /** shown in lists but not studied, together with its sub-decks; cards keep their own state */
  paused?: boolean
  limits?: DeckLimits
  /** decks only; absent = inherit from the nearest ancestor (basic card at the top) */
  defaultCard?: CardTemplate
  /** decks only; vocab cards also get a meaning → word schedule. absent = inherit (off at the top) */
  reverse?: boolean
  /** decks only; how this deck's card list is sorted (synced, so every device shows the same order) */
  cardSort?: { key: string; desc: boolean }
}

export type DeckColor = 'blue' | 'yellow' | 'pink' | 'orange' | 'green' | 'purple' | 'gray'

export type Lang = 'en' | 'ja' | 'ko'

export interface Example {
  id: string
  sentence: string
  translation: string
  /** parts of the sentence the user colored (usually the studied word in some form) */
  marks?: string[]
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
  /** position in the hand-sorted card list (ascending); absent = after the sorted ones, by creation time */
  order?: number
}

export interface BasicCard extends CardBase {
  type: 'basic'
  front: string
  back: string
}

/** synonyms, antonyms, derived words, easily confused words */
export type RelKind = 'syn' | 'ant' | 'der' | 'conf'
/** ids of the vocab cards related to a card; links are kept on both cards */
export type Relations = Partial<Record<RelKind, string[]>>

/** One meaning of a word with the parts of speech it goes with, e.g. "v. 跑" and "n. 跑步". */
export interface Sense {
  id: string
  pos: string[]
  meaning: string
}

export interface VocabCard extends CardBase {
  type: 'vocab'
  lang: Lang
  word: string
  reading: string
  /** all meanings joined by line breaks; derived from `senses` when saved, what lists, search and spelling read */
  meaning: string
  /** every part of speech used in `senses`; derived like `meaning` */
  pos: string[]
  /** the meanings one by one; absent on older cards, which have just `meaning` and `pos` */
  senses?: Sense[]
  examples: Example[]
  note: string
  rel?: Relations
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
  /** shown small beside the name: the language you look up first, e.g. 日中 = a Japanese word explained in Chinese, 日日 = in Japanese */
  kind?: string
  url: string
  langs: Lang[]
  /** kept in the list but not offered as a link */
  hidden?: boolean
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
  /** how the reading of an English word is written when it is generated */
  reading: { enStyle: 'ipa' | 'kk' }
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
    /** address of the Cloudflare Worker in worker/ (it also supplies the Google client ID) */
    workerUrl: string
    auto: boolean
  }
}

export interface MetaRecord {
  key: string
  value: unknown
  updatedAt: number
}
