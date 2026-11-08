import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
// @ts-expect-error plain JS module of the Worker
import { PushGroup } from '../../../worker/src/push.js'

const b64u = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** A real P-256 key pair so the payload encryption has something valid to work with. */
async function subscription(endpoint: string) {
  const k = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const p256dh = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey)))
  return { endpoint, keys: { p256dh, auth: b64u(crypto.getRandomValues(new Uint8Array(16))) } }
}

/** The bits of a Durable Object context the class uses, kept in memory. */
function fakeCtx() {
  const data = new Map<string, unknown>()
  let alarm: number | null = null
  return {
    get alarm() {
      return alarm
    },
    storage: {
      get: async (k: string) => structuredClone(data.get(k)),
      put: async (k: string, v: unknown) => void data.set(k, structuredClone(v)),
      deleteAll: async () => data.clear(),
      getAlarm: async () => alarm,
      setAlarm: async (t: number) => void (alarm = t),
      deleteAlarm: async () => void (alarm = null),
    },
  }
}

let env: Record<string, string>
beforeAll(async () => {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
  env = {
    VAPID_PRIVATE_JWK: JSON.stringify(await crypto.subtle.exportKey('jwk', k.privateKey)),
    VAPID_PUBLIC_KEY: 'pub',
  }
})
afterEach(() => vi.unstubAllGlobals())

const post = (g: InstanceType<typeof PushGroup>, path: string, body: unknown) =>
  g.fetch(new Request('https://push.internal' + path, { method: 'POST', body: JSON.stringify(body) }))

describe('PushGroup', () => {
  it('sends the slot to every device and lets one device update it for all', async () => {
    const sent: string[] = []
    vi.stubGlobal('fetch', async (url: string) => (sent.push(url), new Response(null, { status: 201 })))
    const ctx = fakeCtx()
    const g = new PushGroup(ctx, env)
    const phone = await subscription('https://fcm.googleapis.com/phone')
    const pc = await subscription('https://fcm.googleapis.com/pc')
    const t = Date.now() + 1000

    // the PC planned 5 cards and then was never opened again
    await post(g, '/sync', { subscription: pc, slots: [{ t, review: 5, fresh: 0 }] })
    // the phone studied them all: it replaces the slots for the whole group
    await post(g, '/sync', { subscription: phone, slots: [{ t, review: 0, fresh: 0 }] })
    expect(ctx.alarm).toBe(t)

    vi.useFakeTimers({ now: t + 1 })
    await g.alarm()
    vi.useRealTimers()
    expect(sent).toEqual([]) // nothing left to study: no notification anywhere

    await post(g, '/sync', { subscription: phone, slots: [{ t: t + 86400000, review: 3, fresh: 0 }] })
    vi.useFakeTimers({ now: t + 86400000 + 1 })
    await g.alarm()
    vi.useRealTimers()
    expect(sent.sort()).toEqual(['https://fcm.googleapis.com/pc', 'https://fcm.googleapis.com/phone'])
  })

  it('retries only the devices that failed, and drops expired ones', async () => {
    const calls: string[] = []
    let phoneDown = true
    vi.stubGlobal('fetch', async (url: string) => {
      calls.push(url)
      if (url.endsWith('/gone')) return new Response(null, { status: 410 })
      if (url.endsWith('/phone') && phoneDown) return new Response(null, { status: 503 })
      return new Response(null, { status: 201 })
    })
    const ctx = fakeCtx()
    const g = new PushGroup(ctx, env)
    const t = Date.now() + 1000
    const subs = {
      phone: await subscription('https://fcm.googleapis.com/phone'),
      pc: await subscription('https://fcm.googleapis.com/pc'),
      gone: await subscription('https://fcm.googleapis.com/gone'),
    }
    for (const s of Object.values(subs))
      await post(g, '/sync', { subscription: s, slots: [{ t, review: 2, fresh: 0 }] })

    vi.useFakeTimers({ now: t + 1 })
    await g.alarm()
    expect(ctx.alarm).toBe(t + 1 + 5 * 60 * 1000) // retry soon

    calls.length = 0
    phoneDown = false
    vi.setSystemTime(t + 5 * 60 * 1000 + 2)
    await g.alarm()
    vi.useRealTimers()
    expect(calls).toEqual(['https://fcm.googleapis.com/phone']) // the PC is not sent twice

    const rec = (await ctx.storage.get('rec')) as { subs: Record<string, unknown>; sent: number }
    expect(Object.keys(rec.subs).sort()).toEqual([
      'https://fcm.googleapis.com/pc',
      'https://fcm.googleapis.com/phone',
    ])
    expect(rec.sent).toBe(t)
  })

  it('unsubscribing the last device clears the group', async () => {
    const ctx = fakeCtx()
    const g = new PushGroup(ctx, env)
    const a = await subscription('https://fcm.googleapis.com/a')
    const b = await subscription('https://fcm.googleapis.com/b')
    const slots = [{ t: Date.now() + 1000, review: 1, fresh: 0 }]
    await post(g, '/sync', { subscription: a, slots })
    await post(g, '/sync', { subscription: b, slots })
    await post(g, '/unsubscribe', { endpoint: a.endpoint })
    expect(await ctx.storage.get('rec')).toBeTruthy()
    await post(g, '/unsubscribe', { endpoint: b.endpoint })
    expect(await ctx.storage.get('rec')).toBeUndefined()
    expect(ctx.alarm).toBeNull()
  })
})
