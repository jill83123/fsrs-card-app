import { ref } from 'vue'
import { LANGS } from '@/db/defaults'
import type { Lang, TtsLangSettings } from '@/db/types'
import { espeakAudioUrl, isEspeakVoice } from './espeakPiper'
import { isKokoroVoice, kokoroWav, type KokoroBackend } from './kokoro'
import { readAudio, writeAudio } from './audioCache'
import { speechInput, type SpeechInput } from './reading'

export const speaking = ref<string | null>(null)
export const ttsError = ref<string | null>(null)

let current: HTMLAudioElement | null = null

export function stopSpeaking() {
  current?.pause()
  current = null
  if ('speechSynthesis' in window) speechSynthesis.cancel()
  speaking.value = null
}

export function systemVoices(lang?: Lang): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return []
  const all = speechSynthesis.getVoices()
  if (!lang) return all
  return all.filter((v) => v.lang.toLowerCase().startsWith(lang))
}

/** Voices load asynchronously in most browsers. */
export function onVoicesChanged(fn: () => void) {
  if (!('speechSynthesis' in window)) return () => {}
  speechSynthesis.addEventListener('voiceschanged', fn)
  return () => speechSynthesis.removeEventListener('voiceschanged', fn)
}

function speakSystem(text: string, lang: Lang, cfg: TtsLangSettings, token: string) {
  return new Promise<void>((resolve, reject) => {
    if (!('speechSynthesis' in window)) return reject(new Error('此瀏覽器不支援系統語音'))
    speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = LANGS.find((l) => l.id === lang)!.bcp47
    u.rate = cfg.rate
    const voice = systemVoices().find((v) => v.voiceURI === cfg.systemVoice)
    if (voice) u.voice = voice
    u.onend = () => resolve()
    u.onerror = (e) =>
      e.error === 'interrupted' || e.error === 'canceled' ? resolve() : reject(new Error(e.error))
    if (speaking.value === token) speechSynthesis.speak(u)
  })
}

let kokoroBackend: KokoroBackend = 'wasm'
export const setKokoroBackend = (b: KokoroBackend) => (kokoroBackend = b)

const KOKORO_REV = 2
const inflight = new Map<string, Promise<string>>()

/** Blob URL of the clip for `input`, generated once and then served from the cache. */
function neuralAudioUrl(input: SpeechInput, lang: Lang, cfg: TtsLangSettings): Promise<string> {
  const model = cfg.piperModel
  const { text, phonemes } = input
  // English readings only change Kokoro's phonemes; Piper keeps reading the word
  const usesPhonemes = !!phonemes && isKokoroVoice(model)
  // bump KOKORO_REV when Kokoro's output changes so cached clips are made again
  const rev = isKokoroVoice(model) ? `k${KOKORO_REV}|` : ''
  const key = `${rev}${model}|${lang}|${cfg.rate}|${text}${usesPhonemes ? `|/${phonemes}/` : ''}`
  let p = inflight.get(key)
  if (!p) {
    p = (async () => {
      const hit = await readAudio(key)
      if (hit) return hit
      let blob: Blob
      if (isKokoroVoice(model)) {
        blob = await kokoroWav(
          text,
          model,
          cfg.rate,
          kokoroBackend,
          usesPhonemes ? phonemes : undefined,
        )
      } else if (isEspeakVoice(model)) {
        blob = await (await fetch(await espeakAudioUrl(text, model, cfg.rate))).blob()
      } else throw new Error(`不支援的聲音：${model}`)
      return writeAudio(key, blob)
    })()
    p.finally(() => inflight.delete(key)).catch(() => {})
    inflight.set(key, p)
  }
  return p
}

/**
 * Generate a clip in the background so tapping the speaker plays instantly.
 * `reading` is a vocab card's reading, used for the pronunciation when it is usable.
 */
export function prefetchSpeech(text: string, lang: Lang, cfg: TtsLangSettings, reading?: string) {
  const clean = text.replace(/\|\|/g, '').trim()
  if (!clean || cfg.engine !== 'piper') return
  neuralAudioUrl(speechInput(clean, lang, reading), lang, cfg).catch(() => {})
}

async function speakPiper(input: SpeechInput, lang: Lang, cfg: TtsLangSettings, token: string) {
  const url = await neuralAudioUrl(input, lang, cfg)
  if (speaking.value !== token) return
  const audio = new Audio(url)
  current = audio
  await audio.play()
  await new Promise<void>((resolve) => {
    audio.onended = () => resolve()
    audio.onpause = () => resolve()
  })
}

/** Play a pre-rendered clip at the given speed (pitch is preserved). */
export async function playClip(url: string, rate = 1) {
  stopSpeaking()
  const token = `clip:${url}:${Date.now()}`
  speaking.value = token
  try {
    const audio = new Audio(url)
    audio.playbackRate = rate
    current = audio
    await audio.play()
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve()
      audio.onpause = () => resolve()
    })
  } finally {
    if (speaking.value === token) speaking.value = null
  }
}

/**
 * Speak `text` with the configured neural voice (Kokoro or an original Piper
 * voice via espeak-ng) and fall back to the system voice if that fails.
 * `reading` is a vocab card's reading, used for the pronunciation when it is usable.
 */
export async function speak(text: string, lang: Lang, cfg: TtsLangSettings, reading?: string) {
  const clean = text.replace(/\|\|/g, '').trim()
  if (!clean) return
  const input = speechInput(clean, lang, reading)
  stopSpeaking()
  const token = `${lang}:${clean}:${Date.now()}`
  speaking.value = token
  ttsError.value = null
  try {
    if (cfg.engine === 'piper') {
      try {
        await speakPiper(input, lang, cfg, token)
      } catch (e) {
        console.warn('[tts] piper failed, falling back to system voice', e)
        if (speaking.value === token) await speakSystem(input.text, lang, cfg, token)
      }
    } else {
      await speakSystem(input.text, lang, cfg, token)
    }
  } catch (e) {
    ttsError.value = e instanceof Error ? e.message : String(e)
  } finally {
    if (speaking.value === token) speaking.value = null
  }
}
