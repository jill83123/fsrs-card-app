/*
 * Original Piper voices (rhasspy/piper-voices) phonemized with espeak-ng compiled to WASM.
 * Used for Korean; Japanese and English use Kokoro (./kokoro.ts).
 */
import type { InferenceSession } from 'onnxruntime-web'
import type { Lang } from '@/db/types'
import { toNormalizedWav } from './wav'
import { loadPhonemizerAssets, phonemize } from './espeak'
import { clearModelCache, fetchCached, isCached, type DownloadProgress } from './fetchCache'

const VOICES_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main'

export const ESPEAK_VOICES: { id: string; lang: Lang; label: string; path: string }[] = [
  {
    id: 'ko_KR-kss-medium',
    lang: 'ko',
    label: 'KSS（女聲，約 63MB）',
    path: 'ko/ko_KR/kss/medium/ko_KR-kss-medium.onnx',
  },
]

export const isEspeakVoice = (id: string) => ESPEAK_VOICES.some((v) => v.id === id)

interface VoiceConfig {
  audio: { sample_rate: number }
  espeak: { voice: string }
  inference: { noise_scale: number; length_scale: number; noise_w: number }
  phoneme_id_map: Record<string, number[]>
  speaker_id_map: Record<string, number>
}

interface Voice {
  config: VoiceConfig
  session: InferenceSession
  ort: typeof import('onnxruntime-web')
}

export type EspeakProgress = DownloadProgress

const progressListeners = new Set<(voice: string, p: EspeakProgress) => void>()
export function onEspeakProgress(fn: (voice: string, p: EspeakProgress) => void) {
  progressListeners.add(fn)
  return () => progressListeners.delete(fn)
}

/** Map phonemes to ids with the voice's own map: ^ _ p1 _ p2 _ … $ */
function toIds(phonemes: string[], map: VoiceConfig['phoneme_id_map']): number[] {
  const id = (p: string) => map[p] ?? []
  const pad = id('_')
  const ids = [...id('^'), ...pad]
  for (const p of phonemes) {
    const v = map[p]
    if (!v) continue
    ids.push(...v, ...pad)
  }
  ids.push(...id('$'))
  return ids
}

// --- voices ------------------------------------------------------------------
const voices = new Map<string, Promise<Voice>>()

export function loadEspeakVoice(voiceId: string): Promise<Voice> {
  let p = voices.get(voiceId)
  if (!p) {
    p = (async () => {
      const def = ESPEAK_VOICES.find((v) => v.id === voiceId)
      if (!def) throw new Error(`未知的聲音：${voiceId}`)
      const url = `${VOICES_BASE}/${def.path}`
      const [ort, configBuf, model] = await Promise.all([
        import('onnxruntime-web/wasm'),
        fetchCached(`${url}.json`),
        fetchCached(url, (pr) => progressListeners.forEach((fn) => fn(voiceId, pr))),
        loadPhonemizerAssets(),
      ])
      ort.env.wasm.numThreads = 1
      const config = JSON.parse(new TextDecoder().decode(configBuf)) as VoiceConfig
      const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] })
      return { config, session, ort: ort as unknown as Voice['ort'] }
    })()
    p.catch(() => voices.delete(voiceId))
    voices.set(voiceId, p)
  }
  return p
}

export const isEspeakVoiceLoaded = (voiceId: string) => voices.has(voiceId)

export async function isEspeakVoiceDownloaded(voiceId: string) {
  const def = ESPEAK_VOICES.find((v) => v.id === voiceId)
  return !!def && isCached(`${VOICES_BASE}/${def.path}`)
}

export async function clearEspeakCache() {
  voices.clear()
  await clearModelCache()
}

const audioCache = new Map<string, string>()

export async function espeakAudioUrl(text: string, voiceId: string, rate: number) {
  const key = `${voiceId}|${rate}|${text}`
  const hit = audioCache.get(key)
  if (hit) return hit
  const { config, session, ort } = await loadEspeakVoice(voiceId)
  const sentences = await phonemize(text, config.espeak.voice)
  const parts: Float32Array[] = []
  for (const ph of sentences) {
    const ids = toIds(ph, config.phoneme_id_map)
    if (ids.length <= 3) continue
    const feeds: Record<string, InstanceType<typeof ort.Tensor>> = {
      input: new ort.Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
      input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
      scales: new ort.Tensor(
        'float32',
        Float32Array.from([
          config.inference.noise_scale,
          config.inference.length_scale / rate,
          config.inference.noise_w,
        ]),
        [3],
      ),
    }
    if (Object.keys(config.speaker_id_map ?? {}).length) {
      feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1])
    }
    const out = await session.run(feeds)
    parts.push(out.output!.data as Float32Array)
  }
  if (!parts.length) throw new Error('沒有可以朗讀的內容')
  const merged = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    merged.set(p, o)
    o += p.length
  }
  const url = URL.createObjectURL(toNormalizedWav(merged, config.audio.sample_rate))
  audioCache.set(key, url)
  if (audioCache.size > 80) {
    const [k, u] = audioCache.entries().next().value!
    audioCache.delete(k)
    URL.revokeObjectURL(u)
  }
  return url
}
