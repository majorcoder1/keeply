import serverStore from './serverStore'
import { decryptBytes, decryptText, encryptBytes, encryptText, isEncryptedText } from '../lib/crypto'
import { normalizeImages } from '../lib/images'
import { cleanItems } from '../lib/checklist'

// The signed-in store the app actually uses. Same method names as localStore (guest
// mode), but every note, folder name, photo and recording is encrypted with this device's
// key before it goes to the server and decrypted after it comes back. The server holds
// only scrambled data, and the unscrambled version only ever exists in this browser.

const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a']

// Same-origin path, so downloads work whichever address the server put in the URL.
const pathOf = (url) => String(url || '').replace(/^https?:\/\/[^/]+/i, '')
const isEncUrl = (url) => /\.enc$/i.test(pathOf(url).split('?')[0])

function baseMime(type) {
  const m = String(type || '').split(';')[0].trim().toLowerCase()
  return AUDIO_TYPES.includes(m) ? m : 'audio/webm'
}

function tagsOf(raw) {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean)
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const p = JSON.parse(raw)
      if (Array.isArray(p)) return p.map((t) => String(t).trim()).filter(Boolean)
    } catch { /* not JSON */ }
    return raw.split(',').map((t) => t.trim()).filter(Boolean)
  }
  return []
}

// A file the server says it doesn't have (404/410): it was lost or removed long ago, so there is
// nothing to lock. Anything else (a network problem, a 500) is a real error and stops the move.
class MissingFile extends Error {}

async function fetchBytes(url) {
  const res = await fetch(pathOf(url), { cache: 'no-store' })
  if (res.status === 404 || res.status === 410) throw new MissingFile('That file is already missing from the server.')
  if (!res.ok) throw new Error(`A file could not be downloaded (${res.status}).`)
  return new Uint8Array(await res.arrayBuffer())
}

// Recordings whose audio file is gone can't be locked. They are remembered on this device so the
// "Locking your notes" step doesn't come back for them every time.
const SKIPPED_KEY = 'keeply.migration.missing-recordings'
function skippedRecordings() {
  try { return new Set(JSON.parse(localStorage.getItem(SKIPPED_KEY) || '[]')) } catch { return new Set() }
}
function rememberSkipped(ids) {
  try { localStorage.setItem(SKIPPED_KEY, JSON.stringify([...new Set([...skippedRecordings(), ...ids])])) } catch { /* private window */ }
}

// After uploading, ask the server how big the stored file is and compare.
async function verifyStored(url, length) {
  const res = await fetch(pathOf(url), { method: 'HEAD', cache: 'no-store' })
  const size = Number(res.headers.get('content-length'))
  if (!res.ok || (!res.headers.get('content-encoding') && size && size !== length)) {
    throw new Error('A file did not save correctly.')
  }
}

// One migration at a time, shared by every store instance and every caller.
let running = null
let lastProgress = null
const listeners = new Set()

export function createSecureStore(key) {
  const images = new Map() // photo URL -> Promise of a viewable blob: URL
  const audio = new Map() // recording id -> Promise of a playable blob: URL

  // ---- sealing and opening each kind of thing ---------------------------------
  async function sealNote(n) {
    return encryptText(key, JSON.stringify({
      v: 1,
      t: n.title || '',
      b: n.body || '',
      g: tagsOf(n.tags),
      k: n.kind === 'list' ? 'list' : undefined,
      l: n.kind === 'list' ? cleanItems(n.items) : undefined,
      u: n.edited_at || new Date().toISOString(), // when the person last edited it
    }), 'keeply:note')
  }

  async function openNote(row) {
    const base = { ...row, images: normalizeImages(row.images) }
    if (isEncryptedText(row.body)) {
      try {
        const p = JSON.parse(await decryptText(key, row.body, 'keeply:note'))
        return { ...base, title: p.t || '', body: p.b || '', tags: Array.isArray(p.g) ? p.g : [], kind: p.k === 'list' ? 'list' : 'text', items: Array.isArray(p.l) ? p.l : [], updated_at: p.u || row.updated_at, encrypted: true }
      } catch {
        return { ...base, title: '', body: "This note couldn't be unlocked with this device's key.", tags: [], encrypted: true, broken: true }
      }
    }
    // Saved before encryption existed: shown as it is until it is secured (see migrateLegacy).
    return { ...base, tags: tagsOf(row.tags), encrypted: false }
  }

  async function sealFolderName(name) {
    const sealed = await encryptText(key, name, 'keeply:folder')
    if (sealed.length > 250) throw new Error('That folder name is too long.')
    return sealed
  }

  async function openFolder(f) {
    if (f.system || !isEncryptedText(f.name)) return f // the starter folders (and older readable names)
    try {
      return { ...f, name: await decryptText(key, f.name, 'keeply:folder') }
    } catch {
      return { ...f, name: '(locked folder)' }
    }
  }

  // A recording's title and original date are sealed together in its title field.
  function sealRecordingMeta(title, created) {
    return encryptText(key, JSON.stringify({ v: 1, t: title || '', c: created || undefined }), 'keeply:recording')
  }

  async function openRecording(r) {
    if (!isEncryptedText(r.title)) return r
    try {
      const m = JSON.parse(await decryptText(key, r.title, 'keeply:recording'))
      return { ...r, title: m.t || '', created_at: m.c || r.created_at }
    } catch {
      return { ...r, title: 'Recording' }
    }
  }

  async function sealFile(bytes) {
    return new Blob([await encryptBytes(key, bytes)], { type: 'application/octet-stream' })
  }

  function cached(map, id, make) {
    if (!map.has(id)) {
      map.set(id, make().catch((err) => { map.delete(id); throw err }))
    }
    return map.get(id)
  }

  // ---- the store the app uses ----------------------------------------------------------
  const store = {
    mode: 'server',
    secure: true,

    async folders() {
      return Promise.all((await serverStore.folders()).map(openFolder))
    },
    async createFolder(name) {
      return openFolder(await serverStore.createFolder(await sealFolderName(name)))
    },
    async deleteFolder(id) {
      await serverStore.deleteFolder(id)
    },

    async notes() {
      return Promise.all((await serverStore.notes()).map(openNote))
    },
    async createNote(n) {
      return openNote(await serverStore.createNote({
        title: '',
        body: await sealNote(n),
        tags: [],
        color: n.color || 'default',
        pinned: !!n.pinned,
        folder_id: n.folder_id || null,
        images: normalizeImages(n.images),
      }))
    },
    async updateNote(id, n) {
      return openNote(await serverStore.updateNote(id, {
        title: '',
        body: await sealNote(n),
        tags: [],
        color: n.color || 'default',
        pinned: !!n.pinned,
        folder_id: n.folder_id || null,
        images: normalizeImages(n.images),
      }))
    },
    async deleteNote(id) {
      await serverStore.deleteNote(id)
    },

    async recordings() {
      return Promise.all((await serverStore.recordings()).map(openRecording))
    },
    async createRecording({ blob, duration, note_id, title }) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const created = await serverStore.createRecording({
        file: await sealFile(bytes),
        duration,
        note_id,
        title: await sealRecordingMeta(title),
        mime: baseMime(blob.type),
      })
      return openRecording(created)
    },
    // The decrypted audio, as a playable address (fetched and unscrambled when first asked for).
    recordingUrl(rec) {
      if (!isEncUrl(rec.url)) return Promise.resolve(rec.url) // older, readable recording
      return cached(audio, rec.id, async () => {
        const plain = await decryptBytes(key, await fetchBytes(rec.url))
        return URL.createObjectURL(new Blob([plain], { type: rec.mime || 'audio/webm' }))
      })
    },
    async deleteRecording(id) {
      await serverStore.deleteRecording(id)
    },

    // Asks the server to look up a web address's title/picture (only when previews are switched on).
    linkPreview: (url) => serverStore.linkPreview(url),

    // The unlocked bytes of a recording or photo, for "Export my notes".
    async recordingBytes(rec) {
      const bytes = await fetchBytes(rec.url)
      return isEncUrl(rec.url) ? decryptBytes(key, bytes) : bytes
    },
    async imageBytes(src) {
      const bytes = await fetchBytes(src)
      return isEncUrl(src) ? decryptBytes(key, bytes) : bytes
    },

    async uploadImage(blob) {
      const url = await serverStore.uploadImage(await sealFile(new Uint8Array(await blob.arrayBuffer())))
      images.set(url, Promise.resolve(URL.createObjectURL(blob))) // show it straight away
      return url
    },
    imageUrl(src) {
      if (!isEncUrl(src)) return Promise.resolve(src) // older, readable photo
      return cached(images, src, async () => {
        const plain = await decryptBytes(key, await fetchBytes(src))
        return URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' }))
      })
    },

    // Anything saved before encryption existed gets secured here, once, as soon as the
    // key is on this device. Safe to run again: it only touches what is still readable,
    // and it checks each upload before the old copy is replaced. Only one run happens at
    // a time (also across browser tabs), so a re-render or a second tab can't double it.
    migrateLegacy(onProgress = () => {}) {
      listeners.add(onProgress)
      if (lastProgress) onProgress(lastProgress)
      if (!running) {
        const report = (p) => { lastProgress = p; listeners.forEach((l) => l(p)) }
        const work = () => runMigration(report)
        running = (navigator.locks ? navigator.locks.request('keeply-migrate', work) : work())
          .finally(() => { running = null; lastProgress = null; listeners.clear() })
      }
      const mine = running
      return mine.finally(() => listeners.delete(onProgress))
    },
  }

  async function runMigration(onProgress) {
    const [folders, noteRows, recordings] = await Promise.all([serverStore.folders(), serverStore.notes(), serverStore.recordings()])

    const oldFolders = folders.filter((f) => !f.system && !isEncryptedText(f.name))
    const oldNotes = noteRows.filter((n) => {
      const readableImages = normalizeImages(n.images).some((u) => !isEncUrl(u))
      const readableText = !isEncryptedText(n.body) && !!(n.title || n.body || tagsOf(n.tags).length)
      return readableImages || readableText
    })
    const skipped = skippedRecordings()
    const oldRecs = recordings.filter((r) => !isEncUrl(r.url) && !skipped.has(r.id))
    const lost = { photos: 0, recordings: [] } // files the server no longer has

    const total = oldFolders.length + oldNotes.length + oldRecs.length
    let done = 0
    const step = () => onProgress({ done: ++done, total })
    onProgress({ done: 0, total })

    for (const f of oldFolders) {
      await serverStore.renameFolder(f.id, await sealFolderName(f.name))
      step()
    }

    for (const row of oldNotes) {
      const note = await openNote(row)
      const photos = []
      for (const src of note.images) {
        if (isEncUrl(src)) {
          photos.push(src)
          continue
        }
        let bytes
        try {
          bytes = await fetchBytes(src)
        } catch (err) {
          if (err instanceof MissingFile) { lost.photos++; continue } // the photo is gone; keep the note without it
          throw err
        }
        const sealed = await sealFile(bytes)
        const url = await serverStore.uploadImage(sealed)
        await verifyStored(url, sealed.size)
        photos.push(url)
      }
      // Keep the note's original "last edited" time instead of stamping it "now".
      const sealedBody = await sealNote({ ...note, edited_at: row.updated_at })
      const saved = await serverStore.updateNote(row.id, {
        title: '',
        body: sealedBody,
        tags: [],
        color: row.color || 'default',
        pinned: !!row.pinned,
        folder_id: row.folder_id || null,
        images: photos,
      })
      if (saved.body !== sealedBody) throw new Error('A note did not save correctly.')
      step()
    }

    for (const r of oldRecs) {
      let bytes
      try {
        bytes = await fetchBytes(r.url)
      } catch (err) {
        if (err instanceof MissingFile) { lost.recordings.push(r.id); step(); continue } // no audio left to lock
        throw err
      }
      const sealed = await sealFile(bytes)
      const made = await serverStore.createRecording({
        file: sealed,
        duration: r.duration,
        note_id: r.note_id,
        title: await sealRecordingMeta(r.title, r.created_at),
        mime: baseMime(r.mime),
      })
      await verifyStored(made.url, sealed.size)
      await serverStore.deleteRecording(r.id).catch((err) => { if (err.response?.status !== 404) throw err }) // only now is the readable copy removed
      step()
    }

    if (lost.recordings.length) rememberSkipped(lost.recordings)
    return { folders: oldFolders.length, notes: oldNotes.length, recordings: oldRecs.length, lostPhotos: lost.photos, lostRecordings: lost.recordings.length }
  }

  return store
}
