import { openDB } from 'idb'

// Where a device remembers its key so the 24 digits are typed once, not every time.
// The key is stored as a non-extractable CryptoKey: the page can use it to unlock notes
// but can't read its bytes, and it never leaves this browser.
const DB_NAME = 'keeply-keys'

function db() {
  return openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore('keys', { keyPath: 'id' })
    },
  })
}

// `salt` ties the saved key to the account's current key: after a "start over" the old
// remembered key stops matching and is ignored.
export async function saveDeviceKey(userId, key, salt) {
  try {
    await (await db()).put('keys', { id: 'u' + userId, key, salt, saved: Date.now() })
    return true
  } catch {
    return false // private browsing etc.: the key then lasts only until the page closes
  }
}

export async function loadDeviceKey(userId, salt) {
  try {
    const rec = await (await db()).get('keys', 'u' + userId)
    return rec && rec.salt === salt ? rec.key : null
  } catch {
    return null
  }
}

export async function forgetDeviceKey(userId) {
  try {
    await (await db()).delete('keys', 'u' + userId)
  } catch { /* nothing stored */ }
}
