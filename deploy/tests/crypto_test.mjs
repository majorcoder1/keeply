import assert from 'node:assert/strict'
import * as C from '../../web/src/lib/crypto.js'

const results = []
const t = async (name, fn) => { try { await fn(); results.push([name, true]) } catch (e) { results.push([name, false, e.message]) } }

// --- the key code
await t('code is 24 digits', () => { const c = C.generateCode(); assert.match(c, /^\d{24}$/) })
await t('1000 codes are all different and digits look even', () => {
  const seen = new Set(); const count = Array(10).fill(0)
  for (let i = 0; i < 1000; i++) { const c = C.generateCode(); seen.add(c); for (const d of c) count[d]++ }
  assert.equal(seen.size, 1000)
  for (const n of count) assert.ok(n > 2160 && n < 2640, 'digit count ' + n)  // expect 2400 each, +-10%
})
await t('format / clean round trip', () => {
  const c = '123456789012345678901234'
  assert.equal(C.formatCode(c), '1234 5678 9012 3456 7890 1234')
  assert.equal(C.cleanCode('1234-5678 9012.3456 7890 1234'), c)
  assert.ok(C.isValidCode('1234 5678 9012 3456 7890 1234')); assert.ok(!C.isValidCode('1234 5678')); assert.ok(!C.isValidCode('1234 5678 9012 3456 7890 12345'))
})

// --- key derivation (low rounds here only to keep the unit test quick; real value timed below)
const salt = C.newSalt()
const code = C.generateCode()
const key = await C.deriveKey(code, salt, 1000)
await t('key cannot be exported', async () => { await assert.rejects(crypto.subtle.exportKey('raw', key)) })
await t('same code + salt -> same key (decrypts each other)', async () => {
  const k2 = await C.deriveKey(C.formatCode(code), salt, 1000)         // typed with spaces
  const ct = await C.encryptText(key, 'hello'); assert.equal(await C.decryptText(k2, ct), 'hello')
})
await t('different salt or code -> cannot decrypt', async () => {
  const ct = await C.encryptText(key, 'hello')
  await assert.rejects(C.decryptText(await C.deriveKey(code, C.newSalt(), 1000), ct))
  await assert.rejects(C.decryptText(await C.deriveKey(C.generateCode(), salt, 1000), ct))
})

// --- text
await t('text round trip incl. unicode and long', async () => {
  const msg = 'Jn 3:16 — “For God so loved” 日本語 🙏 ' + 'x'.repeat(200000)
  const ct = await C.encryptText(key, msg); assert.ok(C.isEncryptedText(ct)); assert.equal(await C.decryptText(key, ct), msg)
})
await t('ciphertext is not readable and is fresh each time', async () => {
  const a = await C.encryptText(key, 'SECRET-ALPHA'), b = await C.encryptText(key, 'SECRET-ALPHA')
  assert.notEqual(a, b); assert.ok(!a.includes('SECRET')); assert.match(a, /^enc1:[A-Za-z0-9_-]+$/)
})
await t('tampering is detected', async () => {
  const ct = await C.encryptText(key, 'hello'); const body = ct.slice(5)
  const flipped = 'enc1:' + body.slice(0, 20) + (body[20] === 'A' ? 'B' : 'A') + body.slice(21)
  await assert.rejects(C.decryptText(key, flipped))
  await assert.rejects(C.decryptText(key, 'enc1:' + body.slice(0, -4)))
  await assert.rejects(C.decryptText(key, 'enc1:'))
})
await t('a note cannot be passed off as a folder name (context binding)', async () => {
  const ct = await C.encryptText(key, 'x', 'keeply:note'); await assert.rejects(C.decryptText(key, ct, 'keeply:folder'))
})

// --- files
await t('file round trip, starts with KPLY1, 1 MB random', async () => {
  const data = crypto.getRandomValues(new Uint8Array(65536)); const big = new Uint8Array(1 << 20); for (let i = 0; i < big.length; i += 65536) big.set(data, i)
  const ct = await C.encryptBytes(key, big)
  assert.equal(new TextDecoder().decode(ct.subarray(0, 5)), 'KPLY1'); assert.ok(C.isEncryptedBytes(ct)); assert.equal(ct.length, big.length + 5 + 12 + 16)
  assert.deepEqual(await C.decryptBytes(key, ct), big)
})
await t('file tamper / wrong key / plaintext rejected', async () => {
  const ct = await C.encryptBytes(key, new Uint8Array([1, 2, 3, 4, 5]))
  const bad = ct.slice(); bad[bad.length - 1] ^= 1
  await assert.rejects(C.decryptBytes(key, bad)); await assert.rejects(C.decryptBytes(await C.deriveKey(C.generateCode(), salt, 1000), ct))
  await assert.rejects(C.decryptBytes(key, new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 255, 219, 0, 67])))
  assert.ok(!C.isEncryptedBytes(new Uint8Array(100)))
})

// --- key check
await t('key check: right key passes, wrong fails, text is not a note', async () => {
  const chk = await C.makeKeyCheck(key)
  assert.ok(await C.checkKey(key, chk)); assert.ok(!(await C.checkKey(await C.deriveKey(C.generateCode(), salt, 1000), chk))); assert.ok(!(await C.checkKey(key, 'enc1:abc'))); assert.ok(!(await C.checkKey(key, null)))
  await assert.rejects(C.decryptText(key, chk, 'keeply:note'))
})

// --- logging in with the number
await t('login values: stable, 64 hex, different from each other, ignore spaces', async () => {
  const a = await C.deriveLogin(code), b = await C.deriveLogin(C.formatCode(code))
  assert.deepEqual(a, b)
  assert.match(a.login_id, /^[a-f0-9]{64}$/); assert.match(a.login_auth, /^[a-f0-9]{64}$/)
  assert.notEqual(a.login_id, a.login_auth)
})
await t('login values change with any digit and never contain the number', async () => {
  const other = (code.slice(0, 23) + ((Number(code[23]) + 1) % 10))
  const a = await C.deriveLogin(code), b = await C.deriveLogin(other)
  assert.notEqual(a.login_id, b.login_id); assert.notEqual(a.login_auth, b.login_auth)
  assert.ok(!JSON.stringify(a).includes(code.slice(0, 8)))
})
await t('the login values are unrelated to the encryption key (key can still not be exported)', async () => {
  const k = await C.deriveKey(code, salt, 1000)
  await assert.rejects(crypto.subtle.exportKey('raw', k))
})

// --- real cost of the production setting
let ms
await t('600,000-round derivation time (info)', async () => { const t0 = performance.now(); await C.deriveKey(code, salt); ms = performance.now() - t0 })
const w = Math.max(...results.map(r => r[0].length))
for (const [n, ok, d] of results) console.log((ok ? 'PASS ' : 'FAIL ') + n.padEnd(w) + (ok ? '' : '   <- ' + d))
console.log(`\n${results.filter(r => r[1]).length} of ${results.length} passed; real key derivation took ${Math.round(ms)} ms on this computer`)
process.exit(results.every(r => r[1]) ? 0 : 1)
