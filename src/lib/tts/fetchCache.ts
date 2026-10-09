export interface DownloadProgress {
  loaded: number
  total: number
}

export const MODEL_CACHE = 'tts-models'

/** Fetch with a persistent Cache Storage copy (works with or without the service worker). */
export async function fetchCached(url: string, onProgress?: (p: DownloadProgress) => void) {
  const cache = 'caches' in globalThis ? await caches.open(MODEL_CACHE) : null
  const hit = await cache?.match(url)
  if (hit) return hit.arrayBuffer()
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`下載失敗（${res.status}）：${url}`)
  if (!cache) return res.arrayBuffer()
  const total = Number(res.headers.get('Content-Length') ?? 0)
  let loaded = 0
  // stream straight into Cache Storage: holding the chunks, a Blob and an ArrayBuffer at
  // once tripled the memory of the 92MB model, which makes iOS kill the page
  const counted = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        loaded += chunk.length
        onProgress?.({ loaded, total })
        ctrl.enqueue(chunk)
      },
    }),
  )
  try {
    await cache.put(url, new Response(counted, { headers: res.headers }))
  } catch (e) {
    // a full quota must not break playback; the file is simply fetched again next time
    console.warn('[tts] cache put failed', e)
    return (await fetch(url)).arrayBuffer()
  }
  const saved = await cache.match(url)
  if (!saved) return (await fetch(url)).arrayBuffer()
  return saved.arrayBuffer()
}

export async function isCached(url: string) {
  if (!('caches' in globalThis)) return false
  return !!(await (await caches.open(MODEL_CACHE)).match(url))
}

export async function clearModelCache() {
  if ('caches' in globalThis) await caches.delete(MODEL_CACHE)
}
