/*
 * Pre-rendered recordings of each neural voice reading the settings sample sentence
 * (public/tts-samples). The preview button plays these instantly, without downloading
 * a model. Regenerate them with the same voices whenever SAMPLE_TEXT changes.
 */
import type { Lang } from '@/db/types'

export const SAMPLE_TEXT: Record<Lang, string> = {
  en: 'Practice makes perfect.',
  ja: '継続は力なり。',
  ko: '천 리 길도 한 걸음부터.',
}

export const sampleFile = (voiceId: string) => `${voiceId.replace(/[^\w-]/g, '-')}.wav`

export const sampleUrl = (voiceId: string) =>
  `${import.meta.env.BASE_URL}tts-samples/${sampleFile(voiceId)}`
