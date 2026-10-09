import type { DeckColor, DeviceSettings, Lang, PosOption, SyncedSettings } from './types'

export const LANGS: { id: Lang; label: string; short: string; bcp47: string }[] = [
  { id: 'en', label: '英文', short: 'EN', bcp47: 'en-US' },
  { id: 'ja', label: '日文', short: 'JA', bcp47: 'ja-JP' },
  { id: 'ko', label: '韓文', short: 'KO', bcp47: 'ko-KR' },
]

export const langLabel = (l: Lang) => LANGS.find((x) => x.id === l)?.label ?? l

export const PRIMARY_PRESETS = [
  '#5f93c4', // blue (default)
  '#a8644a', // terracotta
  '#e58aa6', // pink
  '#6fae7d', // green
  '#9b84d6', // purple
  '#e3a33f', // amber
  '#4aa3a3', // teal
  '#5b6472', // slate
]

export const DECK_COLORS: Record<DeckColor, string> = {
  blue: '#98d5e8',
  yellow: '#f9e46f',
  pink: '#fdc7db',
  orange: '#fdcd87',
  green: '#b8dca6',
  purple: '#cdc2ec',
  gray: '#d6d4cf',
}

export const DECK_COLOR_KEYS = Object.keys(DECK_COLORS) as DeckColor[]

/** CSS color for a deck tint that adapts to dark mode. */
export const deckColorCss = (c: DeckColor) =>
  `color-mix(in oklab, ${DECK_COLORS[c]} var(--tint-amount), var(--tint-base))`

/**
 * Default parts of speech. Cards store these ids, so an id must never change once
 * released: to rename a default, change only its label; to add one, give it a new id.
 */
export const DEFAULT_POS: Record<Lang, PosOption[]> = {
  en: [
    { id: 'p0-名詞 n.', label: '名詞 n.' },
    { id: 'p1-動詞 v.', label: '動詞 v.' },
    { id: 'p2-形容詞 adj.', label: '形容詞 adj.' },
    { id: 'p3-副詞 adv.', label: '副詞 adv.' },
    { id: 'p4-代名詞 pron.', label: '代名詞 pron.' },
    { id: 'p5-介系詞 prep.', label: '介系詞 prep.' },
    { id: 'p6-連接詞 conj.', label: '連接詞 conj.' },
    { id: 'p7-感嘆詞 int.', label: '感嘆詞 int.' },
    { id: 'p8-片語 phr.', label: '片語 phr.' },
    { id: 'p9-片語動詞 phr. v.', label: '片語動詞 phr. v.' },
  ],
  ja: [
    { id: 'p0-名詞', label: '名詞' },
    { id: 'p1-動詞（五段）', label: '動詞（五段）' },
    { id: 'p2-動詞（一段）', label: '動詞（一段）' },
    { id: 'p3-動詞（する）', label: '動詞（する）' },
    { id: 'p4-動詞（不規則）', label: '動詞（不規則）' },
    { id: 'p5-い形容詞', label: 'い形容詞' },
    { id: 'p6-な形容詞', label: 'な形容詞' },
    { id: 'p7-副詞', label: '副詞' },
    { id: 'p8-助詞', label: '助詞' },
    { id: 'p9-接續詞', label: '接續詞' },
    { id: 'p10-感嘆詞', label: '感嘆詞' },
    { id: 'p11-連體詞', label: '連體詞' },
    { id: 'p12-慣用語', label: '慣用語' },
  ],
  ko: [
    { id: 'p0-名詞', label: '名詞' },
    { id: 'p1-動詞', label: '動詞' },
    { id: 'p2-形容詞', label: '形容詞' },
    { id: 'p3-副詞', label: '副詞' },
    { id: 'p4-代名詞', label: '代名詞' },
    { id: 'p5-助詞', label: '助詞' },
    { id: 'p6-冠形詞', label: '冠形詞' },
    { id: 'p7-感嘆詞', label: '感嘆詞' },
    { id: 'p8-數詞', label: '數詞' },
    { id: 'p9-慣用語', label: '慣用語' },
  ],
}

export const DEFAULT_POS_IDS = new Set(
  Object.values(DEFAULT_POS).flatMap((l) => l.map((o) => o.id)),
)
export const isDefaultPos = (id: string) => DEFAULT_POS_IDS.has(id)

export const DEFAULT_DICTIONARIES = [
  {
    id: 'mazii',
    name: 'Mazii',
    url: 'https://mazii.net/zh-TW/search/word/jatw/{word}',
    langs: ['ja'] as Lang[],
  },
  {
    id: 'cambridge',
    name: '劍橋詞典',
    url: 'https://dictionary.cambridge.org/zht/詞典/英語-漢語-繁體/{word}',
    langs: ['en'] as Lang[],
  },
  {
    id: 'naver',
    name: 'Naver 韓中',
    url: 'https://korean.dict.naver.com/kozhdict/#/search?query={word}',
    langs: ['ko'] as Lang[],
  },
]

export const defaultSynced = (): SyncedSettings => ({
  appearance: { primary: PRIMARY_PRESETS[0]!, theme: 'system' },
  study: { rolloverHour: 4, newPerDay: 20, reviewPerDay: 200, newOrder: 'created' },
  fsrs: {
    retention: 0.9,
    maximumInterval: 36500,
    enableFuzz: true,
    learningSteps: '1m 10m',
    relearningSteps: '10m',
  },
  pos: structuredClone(DEFAULT_POS),
  dictionaries: structuredClone(DEFAULT_DICTIONARIES),
})

export const defaultDevice = (): DeviceSettings => ({
  tts: {
    en: { engine: 'piper', piperModel: 'kokoro:af_heart', systemVoice: '', rate: 1 },
    ja: { engine: 'piper', piperModel: 'kokoro:jf_alpha', systemVoice: '', rate: 1 },
    ko: { engine: 'piper', piperModel: 'ko_KR-kss-medium', systemVoice: '', rate: 1 },
    autoPlay: false,
    kokoroBackend: 'wasm',
  },
  sync: {
    clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
    auto: true,
  },
})
