/*
 * espeak-ng compiled to WASM (piper-phonemize). Turns text into IPA phonemes for the
 * Piper voices and for English words missing from Kokoro's dictionaries. Works on the
 * main thread and in workers: the wasm and its data are handed over as buffers.
 */
import createPiperPhonemize from '@diffusionstudio/piper-wasm/build/piper_phonemize.js'
import phonemizeWasmUrl from '@diffusionstudio/piper-wasm/build/piper_phonemize.wasm?url'
import phonemizeDataUrl from '@diffusionstudio/piper-wasm/build/piper_phonemize.data?url'

let phonemizerAssets: Promise<{ wasm: ArrayBuffer; data: ArrayBuffer }> | null = null

export function loadPhonemizerAssets() {
  phonemizerAssets ??= Promise.all([
    fetch(phonemizeWasmUrl).then((r) => r.arrayBuffer()),
    fetch(phonemizeDataUrl).then((r) => r.arrayBuffer()),
  ])
    .then(([wasm, data]) => ({ wasm, data }))
    .catch((e) => {
      phonemizerAssets = null
      throw e
    })
  return phonemizerAssets
}

// each call allocates a whole wasm instance, so calls run one at a time to keep the
// peak memory low (iOS kills the page when several are alive at once)
let phonemizeQueue: Promise<unknown> = Promise.resolve()

/** Run espeak-ng and return the IPA phonemes of each sentence. */
export function phonemize(text: string, espeakVoice: string): Promise<string[][]> {
  const run = phonemizeQueue.then(() => phonemizeNow(text, espeakVoice))
  phonemizeQueue = run.catch(() => {})
  return run
}

async function phonemizeNow(text: string, espeakVoice: string): Promise<string[][]> {
  const { wasm, data } = await loadPhonemizerAssets()
  const lines: string[] = []
  const errors: string[] = []
  // the Emscripten program exits after main(), so a fresh instance is created per call
  const mod = await createPiperPhonemize({
    print: (line: string) => lines.push(line),
    printErr: (line: string) => errors.push(line),
    wasmBinary: wasm,
    getPreloadedPackage: () => data,
    locateFile: (f: string) => (f.endsWith('.data') ? phonemizeDataUrl : phonemizeWasmUrl),
  })
  mod.callMain([
    '-l',
    espeakVoice,
    '--input',
    JSON.stringify([{ text }]),
    '--espeak_data',
    '/espeak-ng-data',
  ])
  if (!lines.length) throw new Error(errors.join('\n') || 'espeak-ng 沒有輸出')
  const out = JSON.parse(lines.join('')) as { phonemes?: string[] | string[][] }
  const ph = out.phonemes ?? []
  // older builds return one flat list; newer ones return one list per sentence
  return Array.isArray(ph[0]) ? (ph as string[][]) : [ph as string[]]
}
