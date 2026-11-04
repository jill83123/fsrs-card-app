// Prints a fresh VAPID key pair for the daily reminders:  node scripts/gen-vapid.mjs
const { subtle } = globalThis.crypto
const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey))
const jwk = await subtle.exportKey('jwk', pair.privateKey)
const publicKey = Buffer.from(raw).toString('base64url')
console.log('1. In wrangler.toml, set under [vars]:')
console.log(`   VAPID_PUBLIC_KEY = "${publicKey}"`)
console.log('\n2. Store the private key as a secret (paste the JSON when asked):')
console.log('   npx wrangler secret put VAPID_PRIVATE_JWK')
console.log(`\n   ${JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d })}`)
