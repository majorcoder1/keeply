// End-to-end encryption. All of this runs on the person's own phone or computer; the
// server never sees the key and only ever stores scrambled bytes.
//
//   key code   24 random digits, made on the device and shown once (about 80 bits).
//   key        PBKDF2-SHA256 (600,000 rounds) over the digits and a random per-account
//              salt -> a 256-bit AES-GCM key that the browser can use but never reveal.
//   text       "enc1:" + base64url( 12-byte random IV + AES-GCM ciphertext and tag )
//   files      "KPLY1" + 12-byte IV + ciphertext and tag  (photos, voice recordings)
//
// Every piece is bound to what it is (note, folder, file, key check) so one can't be
// swapped in for another, and every piece gets its own fresh random IV.

const enc = new TextEncoder()
const dec = new TextDecoder()

export const CODE_DIGITS = 24
export const KDF_ITERATIONS = 600000
export const TEXT_PREFIX = 'enc1:'
const FILE_MAGIC = enc.encode('KPLY1')
const IV_BYTES = 12
const TAG_BYTES = 16
const CHECK_TEXT = 'keeply-key-check'

// ---- base64url ---------------------------------------------------------------
export function toB64u(bytes) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64u(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

// ---- the 24-digit key code -----------------------------------------------------
// Rejection sampling keeps every digit equally likely (250 is a multiple of 10).
export function generateCode() {
  const digits = []
  const buf = new Uint8Array(64)
  while (digits.length < CODE_DIGITS) {
    crypto.getRandomValues(buf)
    for (const b of buf) {
      if (b < 250 && digits.length < CODE_DIGITS) digits.push(b % 10)
    }
  }
  return digits.join('')
}

export function cleanCode(input) {
  return String(input || '').replace(/\D/g, '')
}

export function isValidCode(input) {
  return cleanCode(input).length === CODE_DIGITS
}

// 1234 5678 9012 3456 7890 1234
export function formatCode(input) {
  return (cleanCode(input).match(/.{1,4}/g) || []).join(' ')
}

export function newSalt() {
  return toB64u(crypto.getRandomValues(new Uint8Array(16)))
}

// ---- logging in with the number -------------------------------------------------------------
// The number can also sign the person in. Two one-way values are made from it with HMAC-SHA256
// and sent instead of the number: a lookup id and a login proof. They are not the encryption key
// and can't be turned into it (that one needs the number AND the per-account salt, run through
// PBKDF2), so signing in this way gives the server nothing that opens a note.
async function loginValue(code, label) {
  const material = await crypto.subtle.importKey('raw', enc.encode('keeply:login:v1:' + cleanCode(code)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', material, enc.encode(label)))
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function deriveLogin(code) {
  return { login_id: await loginValue(code, 'id'), login_auth: await loginValue(code, 'auth') }
}

// ---- the key ----------------------------------------------------------------------
export async function deriveKey(code, salt, iterations = KDF_ITERATIONS) {
  const material = await crypto.subtle.importKey('raw', enc.encode('keeply:v1:' + cleanCode(code)), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64u(salt), iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false, // can be used, never exported — not even by this page's own code
    ['encrypt', 'decrypt'],
  )
}

async function seal(key, bytes, context) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(context) }, key, bytes))
  const out = new Uint8Array(IV_BYTES + sealed.length)
  out.set(iv)
  out.set(sealed, IV_BYTES)
  return out
}

async function unseal(key, packed, context) {
  if (packed.length < IV_BYTES + TAG_BYTES) throw new Error('Not valid encrypted data')
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: packed.subarray(0, IV_BYTES), additionalData: enc.encode(context) },
    key,
    packed.subarray(IV_BYTES),
  )
  return new Uint8Array(plain)
}

// ---- text ----------------------------------------------------------------------------
export function isEncryptedText(value) {
  return typeof value === 'string' && value.startsWith(TEXT_PREFIX)
}

export async function encryptText(key, text, context = 'keeply:note') {
  return TEXT_PREFIX + toB64u(await seal(key, enc.encode(text), context))
}

export async function decryptText(key, value, context = 'keeply:note') {
  if (!isEncryptedText(value)) throw new Error('Not encrypted text')
  return dec.decode(await unseal(key, fromB64u(value.slice(TEXT_PREFIX.length)), context))
}

// ---- files (photos, recordings) -----------------------------------------------------------
export function isEncryptedBytes(bytes) {
  return bytes.length > FILE_MAGIC.length + IV_BYTES + TAG_BYTES && FILE_MAGIC.every((b, i) => bytes[i] === b)
}

export async function encryptBytes(key, bytes) {
  const sealed = await seal(key, bytes, 'keeply:file')
  const out = new Uint8Array(FILE_MAGIC.length + sealed.length)
  out.set(FILE_MAGIC)
  out.set(sealed, FILE_MAGIC.length)
  return out
}

export async function decryptBytes(key, bytes) {
  if (!isEncryptedBytes(bytes)) throw new Error('Not an encrypted file')
  return unseal(key, bytes.subarray(FILE_MAGIC.length), 'keeply:file')
}

// ---- "is this the right code?" ---------------------------------------------------------------
// A small value made with the key and saved on the server. A new device decrypts it to
// find out whether the typed code is right. It reveals nothing about the key.
export function makeKeyCheck(key) {
  return encryptText(key, CHECK_TEXT, 'keeply:check')
}

export async function checkKey(key, check) {
  try {
    return (await decryptText(key, check, 'keeply:check')) === CHECK_TEXT
  } catch {
    return false
  }
}
