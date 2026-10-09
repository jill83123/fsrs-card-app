/* Main-thread client for the Kokoro worker (see ./kokoro.worker.ts). */
import { reactive } from 'vue'
import { isCached, type DownloadProgress } from './fetchCache'
import { kokoroModelUrl } from './kokoroConfig'
import type { Lang } from '@/db/types'
import type { KokoroBackend, KokoroRequest, KokoroResponse } from './kokoro.worker'

export type { KokoroBackend }

export const KOKORO_VOICES: { id: string; lang: Lang; label: string }[] = [
  { id: 'kokoro:af_heart', lang: 'en', label: 'Kokoro Heart（美式，女聲）' },
  { id: 'kokoro:af_aoede', lang: 'en', label: 'Kokoro Aoede（美式，女聲）' },
  { id: 'kokoro:af_bella', lang: 'en', label: 'Kokoro Bella（美式，女聲）' },
  { id: 'kokoro:af_kore', lang: 'en', label: 'Kokoro Kore（美式，女聲）' },
  { id: 'kokoro:am_fenrir', lang: 'en', label: 'Kokoro Fenrir（美式，男聲）' },
  { id: 'kokoro:am_michael', lang: 'en', label: 'Kokoro Michael（美式，男聲）' },
  { id: 'kokoro:am_puck', lang: 'en', label: 'Kokoro Puck（美式，男聲）' },
  { id: 'kokoro:jf_alpha', lang: 'ja', label: 'Kokoro α（女聲）' },
  { id: 'kokoro:jf_gongitsune', lang: 'ja', label: 'Kokoro ごんぎつね（女聲）' },
  { id: 'kokoro:jf_nezumi', lang: 'ja', label: 'Kokoro ねずみ（女聲）' },
  { id: 'kokoro:jm_kumo', lang: 'ja', label: 'Kokoro くも（男聲）' },
]

export const isKokoroVoice = (id: string) => id.startsWith('kokoro:')

export const KOKORO_SIZE_MB: Record<KokoroBackend, number> = { wasm: 92, webgpu: 326 }

export async function webgpuAvailable() {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu
    return !!(await gpu?.requestAdapter())
  } catch {
    return false
  }
}

const progressListeners = new Set<(p: DownloadProgress) => void>()
export function onKokoroProgress(fn: (p: DownloadProgress) => void) {
  progressListeners.add(fn)
  return () => progressListeners.delete(fn)
}

// Where the last model load / first synthesis got to. If the page is killed (iOS drops a
// web process that uses too much memory without any error) the last stage stays in
// localStorage, so the next launch can show where it stopped.
const DIAG_KEY = 'kokoro-diag'
export interface KokoroDiag {
  backend: KokoroBackend
  stage: string
  at: number
}

export function getKokoroDiag(): KokoroDiag | null {
  try {
    return JSON.parse(localStorage.getItem(DIAG_KEY) ?? 'null') as KokoroDiag | null
  } catch {
    return null
  }
}

export function clearKokoroDiag() {
  try {
    localStorage.removeItem(DIAG_KEY)
  } catch {
    /* storage unavailable */
  }
}

function saveStage(backend: KokoroBackend, stage: string) {
  try {
    localStorage.setItem(DIAG_KEY, JSON.stringify({ backend, stage, at: Date.now() }))
  } catch {
    /* storage unavailable */
  }
}

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (wav?: Blob) => void; reject: (e: Error) => void }>()

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./kokoro.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<KokoroResponse>) => {
      const m = e.data
      if (m.type === 'stage') {
        saveStage(m.backend, m.stage)
        return
      }
      if (m.type === 'progress') {
        progressListeners.forEach((fn) => fn(m))
        return
      }
      const p = pending.get(m.id)
      if (!p) return
      pending.delete(m.id)
      if (m.type === 'done') p.resolve(m.wav)
      else p.reject(new Error(m.message))
    }
  }
  return worker
}

type RequestBody =
  | { type: 'load'; backend: KokoroBackend; voice: string }
  | {
      type: 'synth'
      backend: KokoroBackend
      text: string
      voice: string
      speed: number
      phonemes?: string
    }

function request(body: RequestBody) {
  const id = ++seq
  return new Promise<Blob | undefined>((resolve, reject) => {
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, ...body } as KokoroRequest)
  })
}

// reactive so the settings page's button label follows the model state
const loaded = reactive(new Set<KokoroBackend>())

/** Download the model plus what `voiceId` needs (its style and its language's dictionaries). */
export async function loadKokoro(backend: KokoroBackend, voiceId: string) {
  await request({ type: 'load', backend, voice: voiceId.replace(/^kokoro:/, '') })
  loaded.add(backend)
}

export const isKokoroLoaded = (backend: KokoroBackend) => loaded.has(backend)

export async function kokoroWav(
  text: string,
  voiceId: string,
  rate: number,
  backend: KokoroBackend,
  /** ready-made phonemes (from a card's reading) instead of converting `text` */
  phonemes?: string,
) {
  const wav = await request({
    type: 'synth',
    backend,
    text,
    voice: voiceId.replace(/^kokoro:/, ''),
    speed: rate,
    phonemes,
  })
  loaded.add(backend)
  if (!wav) throw new Error('Kokoro 沒有輸出')
  return wav
}

/** Whether the model file is already stored on this device (even if it is not loaded yet). */
export const isKokoroModelCached = (backend: KokoroBackend) => isCached(kokoroModelUrl(backend))

/**
 * Drop the loaded model: stop the worker so the session and the weights leave memory
 * (call after the stored files are deleted, otherwise the model keeps working from memory).
 */
export function resetKokoro() {
  worker?.terminate()
  worker = null
  for (const p of pending.values()) p.reject(new Error('Kokoro 已重設'))
  pending.clear()
  loaded.clear()
}
