/**
 * Daily study reminders over Web Push.
 *
 * The app uploads its push subscription together with the reminder slots it worked out
 * (a time plus how many cards will be waiting then). Each device gets its own Durable Object,
 * which sets an alarm for its next slot and sends it when the time has come. Only the
 * subscription and counts are stored, never card content.
 *
 *   GET  /push/key                              -> { publicKey }
 *   POST /push/sync   { subscription, slots }   -> {}
 *   POST /push/unsubscribe { endpoint }         -> {}
 *   POST /push/test   { endpoint }              -> {}
 *
 * slot = { t: epoch ms, review: number, fresh: number }
 */

/** a slot this long past its time is dropped instead of sent (the phone was unreachable) */
const SLOT_GRACE_MS = 6 * 60 * 60 * 1000
const MAX_SLOTS = 14
/** a device's storage is wiped after this long without an upload from it */
const RECORD_TTL_MS = 30 * 24 * 60 * 60 * 1000
/** retry delay after a temporary push-service failure */
const RETRY_MS = 5 * 60 * 1000
/** an unchanged upload only refreshes the "last seen" time when it is older than this */
const TOUCH_MS = 24 * 60 * 60 * 1000
/** only the push services of the browsers are sent to, never an address a client made up */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
]

const enc = new TextEncoder()

function b64uDecode(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

function b64uEncode(bytes) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function sha256Hex(text) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))
  return [...d].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8),
  )
}

/** RFC 8291 payload encryption (aes128gcm) for one push subscription. */
async function encrypt(sub, payload) {
  const uaPublic = b64uDecode(sub.keys.p256dh)
  const authSecret = b64uDecode(sub.keys.auth)
  const ecdh = { name: 'ECDH', namedCurve: 'P-256' }
  const eph = await crypto.subtle.generateKey(ecdh, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, ecdh, false, [])
  const secret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256),
  )
  const prk = await hkdf(
    authSecret,
    secret,
    concat(enc.encode('WebPush: info\0'), uaPublic, asPublic),
    32,
  )
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, prk, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, prk, enc.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // a single record: the payload followed by the 0x02 "last record" delimiter
  const body = concat(enc.encode(JSON.stringify(payload)), new Uint8Array([2]))
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, body))
  // header: salt, record size 4096, key id length, sender public key
  return concat(salt, new Uint8Array([0, 0, 0x10, 0, asPublic.length]), asPublic, cipher)
}

async function vapidHeader(env, endpoint) {
  const key = await crypto.subtle.importKey(
    'jwk',
    JSON.parse(env.VAPID_PRIVATE_JWK),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const part = (o) => b64uEncode(enc.encode(JSON.stringify(o)))
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  })}`
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)),
  )
  return `vapid t=${unsigned}.${b64uEncode(sig)}, k=${env.VAPID_PUBLIC_KEY}`
}

/** Resolves true when delivered, false when the subscription is gone, throws on a temporary failure. */
async function send(env, sub, payload) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(env, sub.endpoint),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '21600',
      Urgency: 'normal',
    },
    body: await encrypt(sub, payload),
  })
  if (res.status === 404 || res.status === 410) return false
  if (!res.ok) throw new Error(`push service answered ${res.status}`)
  return true
}

export function messageOf(slot) {
  const parts = []
  if (slot.review > 0) parts.push(`${slot.review} 張卡片待複習`)
  if (slot.fresh > 0) parts.push(`${slot.fresh} 張新卡可以學習`)
  return parts.length ? { title: '今日學習提醒', body: parts.join('，'), url: './' } : null
}

function pushHost(endpoint) {
  try {
    const url = new URL(endpoint)
    return (
      url.protocol === 'https:' &&
      PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))
    )
  } catch {
    return false
  }
}

const validSub = (s) =>
  s &&
  typeof s.endpoint === 'string' &&
  s.endpoint.length <= 1000 &&
  pushHost(s.endpoint) &&
  typeof s.keys?.p256dh === 'string' &&
  s.keys.p256dh.length <= 200 &&
  typeof s.keys?.auth === 'string' &&
  s.keys.auth.length <= 100

const dueSlot = (slots, sent, now) =>
  slots.filter((s) => s.t <= now && s.t > sent && now - s.t < SLOT_GRACE_MS).at(-1)

const validSlot = (s) =>
  s && Number.isFinite(s.t) && Number.isInteger(s.review) && Number.isInteger(s.fresh)

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * One Durable Object per device (named by the SHA-256 of its push endpoint).
 * Storage holds a single record: { sub, slots, sent, touched }.
 * The alarm is set to the next unsent slot, or to the clean-up time when nothing is pending.
 */
export class PushDevice {
  constructor(ctx, env) {
    this.ctx = ctx
    this.env = env
  }

  /** Point the alarm at the next pending slot, or at the clean-up time. Only writes when it moves. */
  async schedule(rec, now = Date.now()) {
    const pending = rec.slots.filter((s) => s.t > rec.sent && now - s.t < SLOT_GRACE_MS)
    const at = pending.length ? Math.min(...pending.map((s) => s.t)) : rec.touched + RECORD_TTL_MS
    if ((await this.ctx.storage.getAlarm()) !== at) await this.ctx.storage.setAlarm(at)
  }

  async wipe() {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
  }

  async fetch(request) {
    const path = new URL(request.url).pathname
    const body = await request.json().catch(() => ({}))
    const old = await this.ctx.storage.get('rec')
    const now = Date.now()

    if (path === '/sync') {
      const { endpoint, keys } = body.subscription
      const sub = { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }
      const sent = old?.sent ?? 0
      const slots = body.slots.filter((s) => s.t > sent)
      const same = old && JSON.stringify([old.sub, old.slots]) === JSON.stringify([sub, slots])
      // identical upload: skip the write, only refresh the "last seen" time now and then
      if (same && now - old.touched < TOUCH_MS) return json({})
      const rec = { sub, slots, sent, touched: now }
      await this.ctx.storage.put('rec', rec)
      await this.schedule(rec, now)
      return json({})
    }

    if (path === '/unsubscribe') {
      await this.wipe()
      return json({})
    }

    if (path === '/test') {
      if (!old) return json({ error: 'not_subscribed' }, 404)
      try {
        const ok = await send(this.env, old.sub, {
          title: '測試通知',
          body: '收到這則通知，每日提醒就能正常運作。',
          url: './',
        })
        if (!ok) {
          await this.wipe()
          return json({ error: 'subscription_expired' }, 410)
        }
        return json({})
      } catch {
        return json({ error: 'push_failed' }, 502)
      }
    }

    return json({ error: 'not_found' }, 404)
  }

  /** Send the slot that is due, then set the alarm for the next one. */
  async alarm() {
    const rec = await this.ctx.storage.get('rec')
    if (!rec) return
    const now = Date.now()
    if (now - rec.touched >= RECORD_TTL_MS && !dueSlot(rec.slots, rec.sent, now)) {
      await this.wipe() // the device stopped syncing long ago
      return
    }
    const slot = dueSlot(rec.slots, rec.sent, now)
    if (slot) {
      const message = messageOf(slot)
      try {
        const ok = message ? await send(this.env, rec.sub, message) : true
        if (!ok) {
          await this.wipe() // subscription is gone
          return
        }
      } catch {
        // temporary failure: retry in a few minutes, until the slot's grace time is over
        await this.ctx.storage.setAlarm(now + RETRY_MS)
        return
      }
      rec.sent = slot.t
      rec.slots = rec.slots.filter((s) => s.t > rec.sent)
      await this.ctx.storage.put('rec', rec)
    }
    await this.schedule(rec, now)
  }
}

/** Validate a /push route and hand it to the device's Durable Object. Returns null when not a push path. */
export async function handlePush(request, env, path, body, reply) {
  if (!path.startsWith('/push/')) return null
  if (!env.PUSH || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_JWK)
    return reply({ error: 'push_not_configured' }, 500)

  if (path === '/push/key' && request.method === 'GET')
    return reply({ publicKey: env.VAPID_PUBLIC_KEY }, 200)
  if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405)

  let endpoint
  let payload
  if (path === '/push/sync') {
    if (!validSub(body.subscription) || !Array.isArray(body.slots))
      return reply({ error: 'bad_request' }, 400)
    endpoint = body.subscription.endpoint
    payload = { subscription: body.subscription, slots: body.slots.filter(validSlot).slice(0, MAX_SLOTS) }
  } else if (path === '/push/unsubscribe' || path === '/push/test') {
    if (typeof body.endpoint !== 'string' || !body.endpoint) return reply({ error: 'bad_request' }, 400)
    endpoint = body.endpoint
    payload = {}
  } else return reply({ error: 'not_found' }, 404)

  const stub = env.PUSH.get(env.PUSH.idFromName(await sha256Hex(endpoint)))
  const res = await stub.fetch(`https://push.internal/${path.slice('/push/'.length)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return reply(await res.json().catch(() => ({})), res.status)
}
