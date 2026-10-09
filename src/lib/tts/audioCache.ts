/* Persistent store of synthesized clips, so each word is only generated once. */
const CACHE = 'tts-audio'
const MAX_ENTRIES = 4000
const keyUrl = (key: string) => `https://tts-audio.invalid/${encodeURIComponent(key)}`

const urls = new Map<string, string>()

export async function readAudio(key: string): Promise<string | null> {
  const mem = urls.get(key)
  if (mem) return mem
  if (!('caches' in globalThis)) return null
  try {
    const hit = await (await caches.open(CACHE)).match(keyUrl(key))
    if (!hit) return null
    const url = URL.createObjectURL(await hit.blob())
    urls.set(key, url)
    return url
  } catch {
    return null
  }
}

let writes = 0

export async function writeAudio(key: string, blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  urls.set(key, url)
  if ('caches' in globalThis) {
    try {
      const cache = await caches.open(CACHE)
      await cache.put(keyUrl(key), new Response(blob, { headers: { 'Content-Type': blob.type } }))
      // occasionally drop the oldest clips
      if (++writes % 50 === 0) {
        const keys = await cache.keys()
        for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(k)
      }
    } catch (e) {
      console.warn('[tts] could not persist audio', e)
    }
  }
  return url
}

export async function clearAudioCache() {
  for (const u of urls.values()) URL.revokeObjectURL(u)
  urls.clear()
  if ('caches' in globalThis) await caches.delete(CACHE)
}
