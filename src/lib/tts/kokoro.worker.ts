/*
 * Kokoro-82M (Apache-2.0) synthesis, off the main thread.
 * Text → Kokoro phonemes (./jaG2p or ./enG2p, ports of misaki) → onnxruntime-web.
 */
import type { InferenceSession } from 'onnxruntime-web'
import { fetchCached } from './fetchCache'
import { japaneseToPhonemes, preloadJapaneseG2p } from './jaG2p'
import { englishToPhonemes, preloadEnglishG2p } from './enG2p'
import { toNormalizedWav } from './wav'

export type KokoroBackend = 'wasm' | 'webgpu'

export type KokoroRequest =
  | { id: number; type: 'load'; backend: KokoroBackend; voice: string }
  | {
      id: number
      type: 'synth'
      backend: KokoroBackend
      text: string
      voice: string
      speed: number
      phonemes?: string
    }

export type KokoroResponse =
  | { id: number; type: 'done'; wav?: Blob }
  | { id: number; type: 'error'; message: string }
  | { type: 'progress'; loaded: number; total: number }

const REPO = 'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main'
// q8 runs on the CPU; on WebGPU only the fp32 weights are both fast and correct
// (the q8 graph falls back to the CPU there and fp16 produces NaNs)
const MODEL_FILE: Record<KokoroBackend, string> = {
  wasm: 'model_quantized.onnx',
  webgpu: 'model.onnx',
}
const SAMPLE_RATE = 24000
const STYLE_DIM = 256
const MAX_TOKENS = 510

interface Model {
  session: InferenceSession
  ort: typeof import('onnxruntime-web')
  vocab: Record<string, number>
}

const post = (m: KokoroResponse) => self.postMessage(m)

const models = new Map<KokoroBackend, Promise<Model>>()
function loadModel(backend: KokoroBackend): Promise<Model> {
  let m = models.get(backend)
  if (!m) {
    m = (async () => {
      const ort = (backend === 'webgpu'
        ? await import('onnxruntime-web/webgpu')
        : await import('onnxruntime-web/wasm')) as unknown as Model['ort']
      ort.env.wasm.numThreads = 1
      const [weights, tokenizer] = await Promise.all([
        fetchCached(`${REPO}/onnx/${MODEL_FILE[backend]}`, (p) => post({ type: 'progress', ...p })),
        fetchCached(`${REPO}/tokenizer.json`),
      ])
      const vocab = (
        JSON.parse(new TextDecoder().decode(tokenizer)) as {
          model: { vocab: Record<string, number> }
        }
      ).model.vocab
      const session = await ort.InferenceSession.create(weights, {
        executionProviders: [backend],
      })
      return { session, ort, vocab }
    })()
    m.catch(() => models.delete(backend))
    models.set(backend, m)
  }
  return m
}

const styles = new Map<string, Promise<Float32Array>>()
function loadStyle(voice: string) {
  let s = styles.get(voice)
  if (!s) {
    s = fetchCached(`${REPO}/voices/${voice}.bin`).then((b) => new Float32Array(b))
    s.catch(() => styles.delete(voice))
    styles.set(voice, s)
  }
  return s
}

// voice names start with their language: a = American English, j = Japanese
const isEnglish = (voice: string) => voice.startsWith('a')
const toPhonemes = (text: string, voice: string) =>
  isEnglish(voice) ? englishToPhonemes(text) : japaneseToPhonemes(text)
const preloadG2p = (voice: string) =>
  isEnglish(voice) ? preloadEnglishG2p() : preloadJapaneseG2p()

/** Split long phoneme strings at sentence ends so each chunk fits Kokoro's context. */
function chunk(phonemes: string, max = MAX_TOKENS - 2): string[] {
  if (phonemes.length <= max) return [phonemes]
  const out: string[] = []
  let cur = ''
  for (const p of phonemes.match(/[^.!?]+[.!?]*\s*/g) ?? [phonemes]) {
    if ((cur + p).length > max && cur) {
      out.push(cur)
      cur = ''
    }
    cur += p
  }
  if (cur) out.push(cur)
  return out.flatMap((c) => (c.length > max ? c.match(new RegExp(`.{1,${max}}`, 'gs'))! : [c]))
}

async function synth(
  backend: KokoroBackend,
  text: string,
  voice: string,
  speed: number,
  given?: string,
) {
  const [{ session, ort, vocab }, style] = await Promise.all([loadModel(backend), loadStyle(voice)])
  let phonemes = (given ?? (await toPhonemes(text, voice))).trim()
  if (!phonemes) throw new Error('沒有可以朗讀的內容')
  // without closing punctuation Kokoro cuts the last sound short ("arrange" loses its "ge")
  if (!/[.!?…。！？]$/.test(phonemes)) phonemes += '.'
  const parts: Float32Array[] = []
  for (const c of chunk(phonemes)) {
    const ids = [...c].map((ch) => vocab[ch]).filter((v): v is number => v !== undefined)
    const input = [0, ...ids, 0]
    // the voice pack holds one style vector per phoneme count (row = count - 1, as in
    // the reference KPipeline)
    const row = Math.min(Math.max(ids.length - 1, 0), style.length / STYLE_DIM - 1)
    const out = await session.run({
      input_ids: new ort.Tensor('int64', BigInt64Array.from(input.map(BigInt)), [1, input.length]),
      style: new ort.Tensor('float32', style.slice(row * STYLE_DIM, (row + 1) * STYLE_DIM), [
        1,
        STYLE_DIM,
      ]),
      speed: new ort.Tensor('float32', Float32Array.from([speed]), [1]),
    })
    parts.push(out.waveform!.data as Float32Array)
  }
  const merged = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    merged.set(p, o)
    o += p.length
  }
  return toNormalizedWav(merged, SAMPLE_RATE)
}

// requests are handled one at a time so a burst of prefetches cannot starve memory
let queue: Promise<unknown> = Promise.resolve()

self.onmessage = (e: MessageEvent<KokoroRequest>) => {
  const req = e.data
  queue = queue.then(async () => {
    try {
      if (req.type === 'load') {
        await Promise.all([loadModel(req.backend), preloadG2p(req.voice), loadStyle(req.voice)])
        post({ id: req.id, type: 'done' })
      } else {
        const wav = await synth(req.backend, req.text, req.voice, req.speed, req.phonemes)
        post({ id: req.id, type: 'done', wav })
      }
    } catch (err) {
      post({ id: req.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  })
}
