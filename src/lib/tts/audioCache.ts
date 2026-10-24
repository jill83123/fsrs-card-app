/* Persistent store of synthesized clips, so each word is only generated once. */
const CACHE = 'tts-audio'
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

/** Whether a clip is already stored (without reading it). */
export async function hasAudio(key: string): Promise<boolean> {
  if (urls.has(key)) return true
  if (!('caches' in globalThis)) return false
  try {
    return !!(await (await caches.open(CACHE)).match(keyUrl(key)))
  } catch {
    return false
  }
}

export async function writeAudio(key: string, blob: Blob): Promise<string> {
  const url = URL.createObjectURL(blob)
  urls.set(key, url)
  if ('caches' in globalThis) {
    try {
      const cache = await caches.open(CACHE)
      await cache.put(keyUrl(key), new Response(blob, { headers: { 'Content-Type': blob.type } }))
    } catch (e) {
      console.warn('[tts] could not persist audio', e)
    }
  }
  return url
}

export async function allAudioKeys(): Promise<string[]> {
  if (!('caches' in globalThis)) return []
  const prefix = keyUrl('')
  const reqs = await (await caches.open(CACHE)).keys()
  return reqs.map((r) => decodeURIComponent(r.url.slice(prefix.length)))
}

/** Keys of the stored clips that are not in `keep`. */
export async function unusedAudioKeys(keep: Set<string>): Promise<string[]> {
  return (await allAudioKeys()).filter((k) => !keep.has(k))
}

export async function deleteAudio(keys: string[]) {
  if (!('caches' in globalThis)) return
  const cache = await caches.open(CACHE)
  for (const k of keys) {
    await cache.delete(keyUrl(k))
    const u = urls.get(k)
    if (u) URL.revokeObjectURL(u)
    urls.delete(k)
  }
}

export async function clearAudioCache() {
  for (const u of urls.values()) URL.revokeObjectURL(u)
  urls.clear()
  if ('caches' in globalThis) await caches.delete(CACHE)
}
